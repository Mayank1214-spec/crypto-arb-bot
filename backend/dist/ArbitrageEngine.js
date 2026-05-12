import WebSocket from 'ws';
export class ArbitrageEngine {
    clients = new Set();
    prices = new Map();
    trades = [];
    indexBasisHistory = new Map();
    lastUpdate = 0;
    debugCount = 0;
    matchedPairsCount = 0;
    bybitDebugCount = 0;
    activeSymbols = [];
    activeDualRfqs = new Map();
    activeSingleRfqs = new Map();
    closeAttempts = new Map(); // tradeId → CloseAttempt
    // Configuration
    dryRun = process.env.DRY_RUN !== 'false'; // Default to true for safety
    minProfitThreshold = 0.1; // 0.1% min profit to execute
    maxPositionSize = 10.0; // Increased for testing (10 BTC / 100 ETH)
    maxUsdPerTrade = 100000; // $100k cap for simulation
    balances = {
        'Deribit': 100.0, // BTC
        'Bybit': 1000000.0 // USDT
    };
    constructor() {
        console.log(`[ENGINE] Starting in ${this.dryRun ? 'DRY RUN' : 'LIVE'} mode`);
        this.startExchangeConnections();
        // Broadcast status every 5 seconds so the user knows we are alive
        setInterval(() => {
            let deribitCount = 0, bybitCount = 0, matchedPairs = 0;
            for (const entries of this.prices.values()) {
                const exchanges = new Set(entries.map(e => e.exchange));
                if (exchanges.has("Deribit"))
                    deribitCount++;
                if (exchanges.has("Bybit"))
                    bybitCount++;
                if (exchanges.has("Deribit") && exchanges.has("Bybit"))
                    matchedPairs++;
            }
            // Log to console so you can see data health in server logs
            console.log(`[STATUS] Deribit=${deribitCount} symbols | Bybit=${bybitCount} symbols | Matched=${matchedPairs} pairs`);
            this.broadcast({
                type: "STATUS",
                data: {
                    priceCount: this.prices.size,
                    deribitCount,
                    bybitCount,
                    matchedPairs,
                    lastUpdate: this.lastUpdate,
                    exchanges: ["Deribit", "Bybit"],
                    deribitSymbols: deribitCount,
                    bybitSymbols: bybitCount
                }
            });
        }, 5000);
    }
    handleClient(ws) {
        this.clients.add(ws);
        ws.on('close', () => {
            this.clients.delete(ws);
        });
        ws.on('error', (err) => {
            console.error('Client WS Error:', err);
            this.clients.delete(ws);
        });
        // Send initial state
        ws.send(JSON.stringify({ type: "WELCOME", message: "Connected to Arbitrage Engine (Node.js)" }));
    }
    getStatus() {
        return {
            connections: this.clients.size,
            priceCount: this.prices.size,
            lastUpdate: this.lastUpdate
        };
    }
    async startExchangeConnections() {
        try {
            console.log("Fetching global instrument list from Deribit...");
            const symbols = await this.fetchDeribitInstruments();
            this.activeSymbols = symbols;
            console.log(`Global list ready: ${symbols.length} instruments.`);
            this.connectDeribit(symbols);
            this.connectBybit(symbols);
        }
        catch (e) {
            console.error("Failed to initialize instrument list:", e);
            // Fallback to basic connection if discovery fails
            this.connectDeribit([]);
            this.connectBybit([]);
        }
    }
    connectDeribit(symbols) {
        const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
        ws.on('open', async () => {
            console.log("Connected to Deribit ✅");
            if (symbols.length > 0) {
                console.log(`Subscribing to ${symbols.length} Deribit instruments...`);
                for (let i = 0; i < symbols.length; i += 25) {
                    const batch = symbols.slice(i, i + 25);
                    const subMsg = {
                        jsonrpc: "2.0",
                        method: "public/subscribe",
                        params: {
                            channels: batch.flatMap(s => [`ticker.${s}.100ms`, `book.${s}.none.10.100ms`])
                        },
                        id: i
                    };
                    ws.send(JSON.stringify(subMsg));
                    // Small sleep to avoid rate limiting on sub
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        });
        ws.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.params && response.params.channel.startsWith("ticker")) {
                    this.updateTicker("Deribit", response.params.data);
                }
                else if (response.params && response.params.channel.startsWith("book")) {
                    this.updateDepth("Deribit", response.params.data, "snapshot");
                }
            }
            catch (e) { }
        });
        ws.on('error', (err) => console.error('Deribit WS Error:', err));
        ws.on('close', () => {
            console.log('Deribit connection closed. Reconnecting in 5s...');
            setTimeout(() => this.connectDeribit(this.activeSymbols), 5000);
        });
    }
    connectBybit(symbols) {
        console.log("Attempting Bybit connection...");
        const ws = new WebSocket("wss://stream.bybit.com/v5/public/option");
        let pingInterval = null;
        ws.on('open', async () => {
            console.log("Connected to Bybit Options ✅");
            if (symbols.length > 0) {
                // Transform Deribit symbols to Bybit format:
                // 1. Ensure day is 2-digits (e.g. 4MAY -> 04MAY)
                // 2. Add -USDT suffix
                const bybitSymbols = symbols.map(s => {
                    const parts = s.split('-');
                    const dateStr = parts[1];
                    const monthStart = dateStr.search(/[A-Z]/);
                    const day = dateStr.substring(0, monthStart).padStart(2, '0');
                    const rest = dateStr.substring(monthStart);
                    return `${parts[0]}-${day}${rest}-${parts[2]}-${parts[3]}-USDT`;
                });
                console.log(`Subscribing to ${bybitSymbols.length} Bybit instruments (via translated list)...`);
                for (let i = 0; i < bybitSymbols.length; i += 10) {
                    const batch = bybitSymbols.slice(i, i + 10);
                    const subMsg = {
                        op: "subscribe",
                        args: batch.flatMap(s => [`tickers.${s}`, `orderbook.25.${s}`])
                    };
                    ws.send(JSON.stringify(subMsg));
                    await new Promise(r => setTimeout(r, 100)); // Sleep to avoid Bybit rate limit
                }
            }
            // Bybit heartbeat — store ref so we can clear on close
            pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ op: "ping" }));
                }
            }, 20000);
        });
        ws.on('message', (data) => {
            try {
                const response = JSON.parse(data.toString());
                if (response.op === "subscribe" && response.success === false) {
                    console.error("Bybit Subscription Failed:", response.ret_msg);
                }
                if (response.topic && response.topic.startsWith("tickers")) {
                    this.updateTicker("Bybit", response.data);
                }
                else if (response.topic && response.topic.startsWith("orderbook")) {
                    this.updateDepth("Bybit", response.data, response.type);
                }
            }
            catch (e) { }
        });
        ws.on('error', (err) => console.error('Bybit WS Error:', err.message));
        ws.on('close', () => {
            if (pingInterval)
                clearInterval(pingInterval);
            console.log('Bybit connection closed. Reconnecting in 5s...');
            setTimeout(() => this.connectBybit(this.activeSymbols), 5000);
        });
    }
    updateDepth(exchange, rawData, type) {
        const rawSymbol = rawData.s || rawData.instrument_name || rawData.symbol;
        if (!rawSymbol)
            return;
        try {
            let contract;
            if (exchange === "Deribit") {
                contract = this.parseDeribitSymbol(rawSymbol);
            }
            else if (exchange === "Bybit") {
                contract = this.parseBybitSymbol(rawSymbol);
            }
            else {
                return;
            }
            const normalizedKey = this.getNormalizedKey(contract);
            let entries = this.prices.get(normalizedKey) || [];
            let priceData = entries.find(e => e.exchange === exchange);
            if (!priceData) {
                priceData = { bids: [], asks: [], bidIv: 0, askIv: 0, underlyingPrice: 0, delta: 0, exchange, timestamp: Date.now() };
                entries.push(priceData);
            }
            if (exchange === "Deribit") {
                if (rawData.bids)
                    priceData.bids = rawData.bids.map((x) => [parseFloat(x[0]), parseFloat(x[1])]);
                if (rawData.asks)
                    priceData.asks = rawData.asks.map((x) => [parseFloat(x[0]), parseFloat(x[1])]);
            }
            else if (exchange === "Bybit") {
                if (type === "snapshot") {
                    if (rawData.b)
                        priceData.bids = rawData.b.map((x) => [parseFloat(x[0]), parseFloat(x[1])]);
                    if (rawData.a)
                        priceData.asks = rawData.a.map((x) => [parseFloat(x[0]), parseFloat(x[1])]);
                }
                else if (type === "delta") {
                    if (rawData.b) {
                        for (const update of rawData.b) {
                            const price = parseFloat(update[0]);
                            const size = parseFloat(update[1]);
                            const idx = priceData.bids.findIndex(x => x[0] === price);
                            if (size === 0) {
                                if (idx !== -1)
                                    priceData.bids.splice(idx, 1);
                            }
                            else {
                                if (idx !== -1)
                                    priceData.bids[idx][1] = size;
                                else
                                    priceData.bids.push([price, size]);
                            }
                        }
                        priceData.bids.sort((a, b) => b[0] - a[0]); // Bids descending
                    }
                    if (rawData.a) {
                        for (const update of rawData.a) {
                            const price = parseFloat(update[0]);
                            const size = parseFloat(update[1]);
                            const idx = priceData.asks.findIndex(x => x[0] === price);
                            if (size === 0) {
                                if (idx !== -1)
                                    priceData.asks.splice(idx, 1);
                            }
                            else {
                                if (idx !== -1)
                                    priceData.asks[idx][1] = size;
                                else
                                    priceData.asks.push([price, size]);
                            }
                        }
                        priceData.asks.sort((a, b) => a[0] - b[0]); // Asks ascending
                    }
                }
            }
            priceData.timestamp = Date.now();
            this.prices.set(normalizedKey, entries);
            this.lastUpdate = Date.now();
            // BUG FIX #1+#2: flat single check; also call monitorCloseOrders so
            // resting limit fills are detected immediately on depth updates (not just tickers)
            if (priceData.asks.length > 0 && priceData.bids.length > 0) {
                this.checkArbitrage(normalizedKey, contract, entries);
                this.monitorCloseOrders(normalizedKey);
            }
        }
        catch (e) {
            console.error(`[updateDepth] Error processing ${exchange} data:`, e);
        }
    }
    updateTicker(exchange, rawData) {
        const rawSymbol = rawData.s || rawData.instrument_name || rawData.symbol;
        if (!rawSymbol)
            return;
        try {
            let contract;
            if (exchange === "Deribit") {
                contract = this.parseDeribitSymbol(rawSymbol);
            }
            else if (exchange === "Bybit") {
                contract = this.parseBybitSymbol(rawSymbol);
            }
            else {
                return;
            }
            const normalizedKey = this.getNormalizedKey(contract);
            const underlyingPrice = parseFloat(rawData.underlying_price || // Deribit WebSocket ticker
                rawData.underlyingPrice || // Bybit WebSocket ticker
                rawData.index_price || // Deribit REST fallback
                rawData.indexPrice || // Bybit REST fallback
                rawData.markPrice || // last resort
                0);
            let bidIv = 0;
            let askIv = 0;
            if (exchange === "Deribit") {
                bidIv = parseFloat(rawData.bid_iv || 0);
                askIv = parseFloat(rawData.ask_iv || 0);
            }
            else {
                bidIv = parseFloat(rawData.bidIv || 0) * 100;
                askIv = parseFloat(rawData.askIv || 0) * 100;
            }
            let entries = this.prices.get(normalizedKey) || [];
            let priceData = entries.find(e => e.exchange === exchange);
            if (!priceData) {
                priceData = { bids: [], asks: [], bidIv: 0, askIv: 0, underlyingPrice: 0, delta: 0, exchange, timestamp: Date.now() };
                entries.push(priceData);
            }
            priceData.bidIv = bidIv;
            priceData.askIv = askIv;
            if (underlyingPrice > 0)
                priceData.underlyingPrice = underlyingPrice;
            priceData.delta = parseFloat(rawData.delta || (rawData.greeks && rawData.greeks.delta) || 0);
            priceData.timestamp = Date.now();
            this.prices.set(normalizedKey, entries);
            this.lastUpdate = Date.now();
            this.monitorCloseOrders(normalizedKey);
        }
        catch (e) {
            console.error(`[updateTicker] Error processing ${exchange} data:`, e);
        }
    }
    parseOptionSymbol(symbol) {
        // Handles both: BTC-4MAY26-83000-C (single digit day) and BTC-04MAY26-83000-C (zero-padded)
        const parts = symbol.split("-");
        if (parts.length < 4)
            throw new Error(`Invalid symbol: ${symbol}`);
        const asset = parts[0];
        const dateStr = parts[1]; // e.g. '4MAY26' or '04MAY26'
        const strike = parseFloat(parts[2]);
        const type = parts[3] === "C" ? "CALL" : "PUT";
        const months = {
            JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
            JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
        };
        // Dynamically find where the month letters start (skip leading digits)
        const monthStart = dateStr.search(/[A-Z]/);
        const day = dateStr.substring(0, monthStart).padStart(2, '0');
        const monthStr = dateStr.substring(monthStart, monthStart + 3);
        const yearShort = dateStr.substring(monthStart + 3);
        const month = months[monthStr];
        if (!month)
            throw new Error(`Unknown month: ${monthStr} in ${symbol}`);
        const expiry = `20${yearShort}-${month}-${day}`;
        return { asset, expiry, strike, type };
    }
    parseDeribitSymbol(symbol) {
        return this.parseOptionSymbol(symbol);
    }
    parseBybitSymbol(symbol) {
        // Format: BTC-31MAY24-65000-C-USDT
        // Remove the -USDT suffix before parsing
        const cleanSymbol = symbol.replace("-USDT", "");
        return this.parseOptionSymbol(cleanSymbol);
    }
    getNormalizedKey(contract) {
        return `${contract.asset}_${contract.expiry}_${contract.strike}_${contract.type}`;
    }
    checkArbitrage(key, contract, entries) {
        // We need at least two different exchanges to find arbitrage
        const deribit = entries.find(e => e.exchange === "Deribit");
        const bybit = entries.find(e => e.exchange === "Bybit");
        if (!deribit || !bybit)
            return;
        // Stale data guard: both quotes must be fresh (within 60 seconds)
        const now = Date.now();
        if (now - deribit.timestamp > 60_000 || now - bybit.timestamp > 60_000)
            return;
        // Use best available ask for spread display (ask always present if there's a market)
        const dAsk = deribit.asks && deribit.asks.length > 0 ? deribit.asks[0][0] : 0;
        const dBid = deribit.bids && deribit.bids.length > 0 ? deribit.bids[0][0] : 0;
        const bAsk = bybit.asks && bybit.asks.length > 0 ? bybit.asks[0][0] : 0;
        const bBid = bybit.bids && bybit.bids.length > 0 ? bybit.bids[0][0] : 0;
        const deribitAsk = dAsk * deribit.underlyingPrice;
        const deribitBid = dBid * deribit.underlyingPrice;
        const bybitAsk = bAsk;
        const bybitBid = bBid;
        // OPTION A: Index Monitoring (Moving Basis) — per-asset to avoid mixing BTC & ETH
        const rawBasis = deribit.underlyingPrice - bybit.underlyingPrice;
        const assetBasisHistory = this.indexBasisHistory.get(contract.asset) || [];
        assetBasisHistory.push(rawBasis);
        if (assetBasisHistory.length > 100)
            assetBasisHistory.shift();
        this.indexBasisHistory.set(contract.asset, assetBasisHistory);
        const movingAverageBasis = assetBasisHistory.reduce((a, b) => a + b, 0) / assetBasisHistory.length;
        const currentMismatch = deribit.underlyingPrice - bybit.underlyingPrice;
        // Price spread calculation (both routes)
        const pct1 = bybitAsk > 0 ? ((deribitBid - bybitAsk) / bybitAsk) * 100 : -Infinity; // Buy Bybit, Sell Deribit
        const pct2 = deribitAsk > 0 ? ((bybitBid - deribitAsk) / deribitAsk) * 100 : -Infinity; // Buy Deribit, Sell Bybit
        // OPTION B: IV-based route selection (only when IV data is available)
        const ivAvailable = deribit.bidIv > 0 && bybit.bidIv > 0 && deribit.askIv > 0 && bybit.askIv > 0;
        const ivSpread1 = deribit.bidIv - bybit.askIv; // Buy Bybit, Sell Deribit
        const ivSpread2 = bybit.bidIv - deribit.askIv; // Buy Deribit, Sell Bybit
        const bestIvSpread = ivAvailable ? Math.max(ivSpread1, ivSpread2) : 0;
        // Route selection: use best price spread (IV just helps confirm)
        const useRoute1 = pct1 >= pct2; // Route1 = Buy Bybit, Sell Deribit
        const bestPricePct = Math.max(pct1, pct2);
        const ticker = {
            contract,
            bid: useRoute1 ? deribitBid : bybitBid,
            bidExchange: useRoute1 ? "Deribit" : "Bybit",
            ask: useRoute1 ? bybitAsk : deribitAsk,
            askExchange: useRoute1 ? "Bybit" : "Deribit",
            spreadPercent: isFinite(bestPricePct) ? bestPricePct : 0,
            ivSpread: bestIvSpread,
            indexMismatch: currentMismatch,
            movingBasis: movingAverageBasis,
            adjustedProfitPercent: isFinite(bestPricePct) ? bestPricePct : 0
        };
        this.broadcast({ type: "TICKER", data: ticker });
        // OPPORTUNITY: requires a real two-sided market on both exchanges
        if (!deribitBid || !deribitAsk || !bybitBid || !bybitAsk)
            return;
        // Deep Book VWAP Calculation
        const buyBook = useRoute1 ? bybit.asks : deribit.asks; // Arrays of [price, size]
        const sellBook = useRoute1 ? deribit.bids : bybit.bids;
        if (!buyBook || !sellBook || buyBook.length === 0 || sellBook.length === 0)
            return;
        let accumulatedSize = 0;
        let accumulatedBuyCost = 0;
        let accumulatedSellValue = 0;
        let accumulatedFees = 0;
        let buyIdx = 0;
        let sellIdx = 0;
        let layersConsumed = 0;
        const TAKER_FEE = 0.0003; // 0.03% of underlying
        // Dynamic sizing based on USD cap
        const maxCoinSize = deribit.underlyingPrice > 0 ? this.maxUsdPerTrade / deribit.underlyingPrice : this.maxPositionSize;
        const effectiveMaxSize = Math.min(this.maxPositionSize, maxCoinSize);
        let currentBSize = buyBook[0][1];
        let currentSSize = sellBook[0][1];
        while (buyIdx < buyBook.length && sellIdx < sellBook.length && accumulatedSize < effectiveMaxSize) {
            let bPrice = buyBook[buyIdx][0];
            let sPrice = sellBook[sellIdx][0];
            if (useRoute1) { // Buy Bybit, Sell Deribit
                sPrice = sPrice * deribit.underlyingPrice;
            }
            else { // Buy Deribit, Sell Bybit
                bPrice = bPrice * deribit.underlyingPrice;
            }
            const layerSpread = sPrice - bPrice;
            // Fee calculations with 12.5% cap rule
            // Standard fee is 0.03% of underlying, capped at 12.5% of the option price
            const standardFee = deribit.underlyingPrice * TAKER_FEE;
            const buyFee = Math.min(standardFee, bPrice * 0.125);
            const sellFee = Math.min(standardFee, sPrice * 0.125);
            const layerFees = buyFee + sellFee;
            const layerNetProfit = layerSpread - layerFees;
            if (accumulatedSize === 0) {
                // Evaluate raw spread for RFQ triggers on the first layer
                const rawProfitPercent = (layerSpread / bPrice) * 100;
                if (layerSpread > 0 && rawProfitPercent > this.minProfitThreshold) {
                    const buyEx = useRoute1 ? "Bybit" : "Deribit";
                    const sellEx = useRoute1 ? "Deribit" : "Bybit";
                    // Parallel Racing: Fire both Single-RFQ and Dual-RFQ.
                    // The first one to return a profitable execution locks the trade.
                    this.triggerSingleRfq(contract, buyEx, sellEx, effectiveMaxSize, layerSpread);
                    this.triggerDualRfq(contract, buyEx, sellEx, effectiveMaxSize, layerSpread);
                }
            }
            if (layerNetProfit <= 0) {
                break; // Standard VWAP execution path fails here due to fees/spread
            }
            const takeSize = Math.min(currentBSize, currentSSize, effectiveMaxSize - accumulatedSize);
            accumulatedSize += takeSize;
            accumulatedBuyCost += bPrice * takeSize;
            accumulatedSellValue += sPrice * takeSize;
            accumulatedFees += layerFees * takeSize;
            layersConsumed = Math.max(buyIdx, sellIdx) + 1;
            currentBSize -= takeSize;
            currentSSize -= takeSize;
            // Advance indices if layer is exhausted
            if (currentBSize <= 1e-8) {
                buyIdx++;
                if (buyIdx < buyBook.length)
                    currentBSize = buyBook[buyIdx][1];
            }
            if (currentSSize <= 1e-8) {
                sellIdx++;
                if (sellIdx < sellBook.length)
                    currentSSize = sellBook[sellIdx][1];
            }
        }
        if (accumulatedSize <= 0)
            return;
        const vwapBuyPrice = accumulatedBuyCost / accumulatedSize;
        const vwapSellPrice = accumulatedSellValue / accumulatedSize;
        const vwapProfitPercent = ((vwapSellPrice - vwapBuyPrice) / vwapBuyPrice) * 100;
        const netAbsoluteProfit = accumulatedSellValue - accumulatedBuyCost - accumulatedFees;
        if (vwapProfitPercent > this.minProfitThreshold) {
            const opportunity = {
                contract,
                buyExchange: useRoute1 ? "Bybit" : "Deribit",
                buyPrice: vwapBuyPrice,
                buyUnderlying: useRoute1 ? bybit.underlyingPrice : deribit.underlyingPrice,
                buyIv: useRoute1 ? bybit.askIv : deribit.askIv,
                sellExchange: useRoute1 ? "Deribit" : "Bybit",
                sellPrice: vwapSellPrice,
                sellUnderlying: useRoute1 ? deribit.underlyingPrice : bybit.underlyingPrice,
                sellIv: useRoute1 ? deribit.bidIv : bybit.bidIv,
                profitPercent: vwapProfitPercent,
                ivSpread: bestIvSpread,
                indexMismatch: currentMismatch,
                adjustedProfitPercent: vwapProfitPercent,
                tradableSize: accumulatedSize,
                potentialProfit: netAbsoluteProfit,
                layersConsumed,
                executionType: 'ORDERBOOK'
            };
            this.broadcast({ type: "OPPORTUNITY", data: opportunity });
            this.attemptExecution(opportunity);
            console.log(`[ARB-DEPTH] ${contract.asset} ${contract.strike}${contract.type[0]} | Profit: $${netAbsoluteProfit.toFixed(2)} (${vwapProfitPercent.toFixed(2)}%) | Size: ${accumulatedSize.toFixed(4)} | Layers: ${layersConsumed}`);
        }
    }
    triggerSingleRfq(contract, buyExchange, sellExchange, size, spread) {
        const key = this.getNormalizedKey(contract);
        if (this.activeSingleRfqs.has(key)) {
            const existing = this.activeSingleRfqs.get(key);
            if (Date.now() - existing.timestamp < 10000)
                return; // Strict 10s cooldown
        }
        if (size < 1.0)
            return;
        const rfq = {
            id: `SRFQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            contract,
            buyExchange,
            sellExchange,
            size,
            timestamp: Date.now(),
            status: 'PENDING',
            originalSpread: spread
        };
        this.activeSingleRfqs.set(key, rfq);
        console.log(`[SINGLE-RFQ] Broadcasted block quote request on ${buyExchange} (Size: ${size.toFixed(2)})`);
        setTimeout(() => this.simulateSingleRfqResponse(rfq), 300 + Math.random() * 1000);
    }
    simulateSingleRfqResponse(rfq) {
        const key = this.getNormalizedKey(rfq.contract);
        const existing = this.activeSingleRfqs.get(key);
        if (!existing || existing.id !== rfq.id || existing.status !== 'PENDING')
            return;
        existing.status = 'QUOTED';
        // MM takes ~50% of the raw spread edge, we get the rest, 0 taker fee on this leg.
        const customProfitPerUnit = rfq.originalSpread * 0.50;
        const entries = this.prices.get(key);
        if (!entries)
            return;
        const deribit = entries.find(e => e.exchange === "Deribit");
        const bybit = entries.find(e => e.exchange === "Bybit");
        if (!deribit || !bybit)
            return;
        const useRoute1 = rfq.buyExchange === "Bybit";
        const sellBook = useRoute1 ? deribit.bids : bybit.bids;
        if (!sellBook || sellBook.length === 0)
            return;
        let sPrice = sellBook[0][0];
        if (useRoute1)
            sPrice = sPrice * deribit.underlyingPrice;
        const quotedBuyPrice = sPrice - customProfitPerUnit;
        const standardFee = deribit.underlyingPrice * 0.0003;
        const sellFee = Math.min(standardFee, sPrice * 0.125);
        const netProfitPerUnit = customProfitPerUnit - sellFee;
        const vwapProfitPercent = (netProfitPerUnit / quotedBuyPrice) * 100;
        if (vwapProfitPercent > this.minProfitThreshold) {
            existing.status = 'EXECUTED';
            const netAbsoluteProfit = netProfitPerUnit * rfq.size;
            const opportunity = {
                contract: rfq.contract,
                buyExchange: rfq.buyExchange,
                buyPrice: quotedBuyPrice,
                buyUnderlying: useRoute1 ? bybit.underlyingPrice : deribit.underlyingPrice,
                buyIv: useRoute1 ? bybit.askIv : deribit.askIv,
                sellExchange: rfq.sellExchange,
                sellPrice: sPrice,
                sellUnderlying: useRoute1 ? deribit.underlyingPrice : bybit.underlyingPrice,
                sellIv: useRoute1 ? deribit.bidIv : bybit.bidIv,
                profitPercent: vwapProfitPercent,
                ivSpread: 0,
                indexMismatch: 0,
                adjustedProfitPercent: vwapProfitPercent,
                tradableSize: rfq.size,
                potentialProfit: netAbsoluteProfit,
                layersConsumed: 0,
                executionType: 'SINGLE_RFQ'
            };
            this.broadcast({ type: "OPPORTUNITY", data: opportunity });
            this.attemptExecution(opportunity);
            console.log(`[SINGLE-RFQ-EXEC] Block trade filled! ${rfq.contract.asset} | Profit: $${netAbsoluteProfit.toFixed(2)} | Latency: ${Date.now() - rfq.timestamp}ms`);
        }
        else {
            existing.status = 'EXPIRED';
        }
    }
    triggerDualRfq(contract, buyExchange, sellExchange, size, spread) {
        const key = this.getNormalizedKey(contract);
        if (this.activeDualRfqs.has(key)) {
            const existing = this.activeDualRfqs.get(key);
            if (Date.now() - existing.timestamp < 10000)
                return; // Strict 10s cooldown
        }
        // Block trades usually require high minimums, filter out tiny retail noise
        if (size < 1.0)
            return;
        const rfq = {
            id: `DRFQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            contract,
            buyExchange,
            sellExchange,
            size,
            timestamp: Date.now(),
            status: 'PENDING',
            originalSpread: spread
        };
        this.activeDualRfqs.set(key, rfq);
        console.log(`[DUAL-RFQ] Broadcasted dual block quote request: ${contract.asset} ${contract.strike}${contract.type[0]} on ${buyExchange} & ${sellExchange} (Size: ${size.toFixed(2)})`);
        // Simulate independent MM latencies for both exchanges (200ms - 1000ms)
        const buyLatency = 200 + Math.random() * 800;
        const sellLatency = 200 + Math.random() * 800;
        setTimeout(() => this.simulateRfqLegResponse(rfq.id, 'BUY'), buyLatency);
        setTimeout(() => this.simulateRfqLegResponse(rfq.id, 'SELL'), sellLatency);
    }
    simulateRfqLegResponse(rfqId, leg) {
        // Find the specific DUAL-RFQ
        let targetRfq;
        for (const rfq of this.activeDualRfqs.values()) {
            if (rfq.id === rfqId) {
                targetRfq = rfq;
                break;
            }
        }
        if (!targetRfq || !['PENDING', 'PARTIAL'].includes(targetRfq.status))
            return;
        const key = this.getNormalizedKey(targetRfq.contract);
        const entries = this.prices.get(key);
        if (!entries)
            return;
        const deribit = entries.find(e => e.exchange === "Deribit");
        const bybit = entries.find(e => e.exchange === "Bybit");
        if (!deribit || !bybit)
            return;
        const useRoute1 = targetRfq.buyExchange === "Bybit";
        // Simulate MM giving a custom block quote.
        // In dual RFQ, each MM takes roughly 25% of the raw spread edge, leaving 50% for us.
        const customProfitPerLeg = targetRfq.originalSpread * 0.25;
        if (leg === 'BUY') {
            const buyBook = useRoute1 ? bybit.asks : deribit.asks;
            if (!buyBook || buyBook.length === 0)
                return;
            let bPrice = buyBook[0][0];
            if (!useRoute1)
                bPrice = bPrice * deribit.underlyingPrice;
            // MM quotes us a slightly worse buy price than mid, but we pay 0 fees
            targetRfq.buyQuote = bPrice + customProfitPerLeg;
        }
        else {
            const sellBook = useRoute1 ? deribit.bids : bybit.bids;
            if (!sellBook || sellBook.length === 0)
                return;
            let sPrice = sellBook[0][0];
            if (useRoute1)
                sPrice = sPrice * deribit.underlyingPrice;
            // MM quotes us a slightly worse sell price than mid, but we pay 0 fees
            targetRfq.sellQuote = sPrice - customProfitPerLeg;
        }
        // BUG FIX #4: use !== undefined so zero-priced options don't break the state machine
        targetRfq.status = (targetRfq.buyQuote !== undefined && targetRfq.sellQuote !== undefined) ? 'QUOTED' : 'PARTIAL';
        if (targetRfq.status === 'QUOTED') {
            this.evaluateDualQuotes(targetRfq);
        }
    }
    evaluateDualQuotes(rfq) {
        // BUG FIX #7: use !== undefined so zero-priced options work; safe null checks
        if (rfq.buyQuote === undefined || rfq.sellQuote === undefined)
            return;
        // Both legs are purely RFQ block quotes, so standard taker fees are completely zeroed out!
        const netProfitPerUnit = rfq.sellQuote - rfq.buyQuote;
        const vwapProfitPercent = (netProfitPerUnit / rfq.buyQuote) * 100;
        if (vwapProfitPercent > this.minProfitThreshold) {
            rfq.status = 'EXECUTED';
            const netAbsoluteProfit = netProfitPerUnit * rfq.size;
            const key = this.getNormalizedKey(rfq.contract);
            const entries = this.prices.get(key);
            if (!entries)
                return;
            const deribit = entries.find(e => e.exchange === "Deribit");
            const bybit = entries.find(e => e.exchange === "Bybit");
            if (!deribit || !bybit)
                return;
            const useRoute1 = rfq.buyExchange === "Bybit";
            const opportunity = {
                contract: rfq.contract,
                buyExchange: rfq.buyExchange,
                buyPrice: rfq.buyQuote,
                buyUnderlying: useRoute1 ? bybit.underlyingPrice : deribit.underlyingPrice,
                buyIv: 0,
                sellExchange: rfq.sellExchange,
                sellPrice: rfq.sellQuote,
                sellUnderlying: useRoute1 ? deribit.underlyingPrice : bybit.underlyingPrice,
                sellIv: 0,
                profitPercent: vwapProfitPercent,
                ivSpread: 0,
                indexMismatch: 0,
                adjustedProfitPercent: vwapProfitPercent,
                tradableSize: rfq.size,
                potentialProfit: netAbsoluteProfit,
                layersConsumed: 0,
                executionType: 'DUAL_RFQ'
            };
            this.broadcast({ type: "OPPORTUNITY", data: opportunity });
            this.attemptExecution(opportunity);
            const actualLatency = Date.now() - rfq.timestamp;
            console.log(`[DUAL-RFQ-EXEC] Zero-fee double block trade filled! ${rfq.contract.asset} | Profit: $${netAbsoluteProfit.toFixed(2)} | Max Latency: ${actualLatency}ms`);
        }
        else {
            rfq.status = 'EXPIRED';
            console.log(`[DUAL-RFQ-REJECT] Dual-quotes no longer cross profitably after latency for ${rfq.contract.asset} (Net: ${vwapProfitPercent.toFixed(3)}%)`);
        }
    }
    async attemptExecution(opportunity) {
        // Guard: prevent duplicate trades on the same contract, not the entire asset class
        const tradeKey = this.getNormalizedKey(opportunity.contract);
        const existing = this.trades.find(t => this.getNormalizedKey(t.opportunity.contract) === tradeKey && t.status === 'OPEN');
        if (existing)
            return;
        const costUsd = opportunity.buyPrice * opportunity.tradableSize;
        // Simple balance check for simulation
        // Deribit balance is in BTC — convert cost to BTC using underlying price
        if (this.dryRun) {
            if (opportunity.buyExchange === 'Bybit') {
                if (this.balances.Bybit < costUsd) {
                    console.log(`[DRY RUN] Insufficient Bybit balance for ${opportunity.contract.asset} ($${costUsd.toFixed(2)} > $${this.balances.Bybit.toFixed(2)})`);
                    return;
                }
            }
            else if (opportunity.buyExchange === 'Deribit') {
                const costInBtc = opportunity.buyUnderlying > 0 ? costUsd / opportunity.buyUnderlying : Infinity;
                if (this.balances.Deribit < costInBtc) {
                    console.log(`[DRY RUN] Insufficient Deribit balance for ${opportunity.contract.asset} (${costInBtc.toFixed(4)} BTC > ${this.balances.Deribit.toFixed(4)} BTC)`);
                    return;
                }
            }
        }
        // Deduct balance for simulation
        if (this.dryRun) {
            if (opportunity.buyExchange === 'Bybit') {
                this.balances.Bybit -= costUsd;
            }
            else {
                const costInBtc = opportunity.buyUnderlying > 0 ? costUsd / opportunity.buyUnderlying : 0;
                this.balances.Deribit -= costInBtc;
            }
        }
        console.log(`[EXECUTION] Attempting trade for ${opportunity.contract.asset} | Size: ${opportunity.tradableSize} | Cost: $${costUsd.toFixed(2)}`);
        const trade = {
            id: Date.now().toString(),
            opportunity,
            timestamp: Date.now(),
            status: 'OPEN'
        };
        this.trades.push(trade);
        this.broadcast({ type: "TRADE_EXECUTED", data: trade });
        this.initiateClose(trade); // Immediately race all three close methods
        if (this.dryRun) {
            console.log(`[DRY RUN] Executed simulated trade for ${opportunity.contract.asset} @ ${opportunity.profitPercent.toFixed(2)}% profit`);
        }
        else {
            // TODO: Place real orders
        }
    }
    // ─────────────────────────────────────────────────────────────────────────────
    // CLOSE SYSTEM — Three methods race simultaneously; first winner closes trade
    // ─────────────────────────────────────────────────────────────────────────────
    /**
     * Called on every ticker/depth update. Checks if resting limit orders
     * at targetClosePrice are now fillable on BOTH exchanges simultaneously.
     * If yes → Method 2 (LIMIT) wins and closes the trade.
     */
    monitorCloseOrders(key) {
        const entries = this.prices.get(key);
        if (!entries)
            return;
        const deribit = entries.find(e => e.exchange === 'Deribit');
        const bybit = entries.find(e => e.exchange === 'Bybit');
        if (!deribit || !bybit)
            return;
        for (const trade of this.trades) {
            if (trade.status !== 'OPEN')
                continue;
            if (this.getNormalizedKey(trade.opportunity.contract) !== key)
                continue;
            const attempt = this.closeAttempts.get(trade.id);
            if (!attempt || attempt.closed)
                continue;
            const buyExData = trade.opportunity.buyExchange === 'Deribit' ? deribit : bybit;
            const sellExData = trade.opportunity.sellExchange === 'Deribit' ? deribit : bybit;
            // Close long leg: SELL on buy exchange → limit fill when bestBid >= targetClosePrice
            let bestBid = buyExData.bids.length > 0 ? buyExData.bids[0][0] : 0;
            if (trade.opportunity.buyExchange === 'Deribit')
                bestBid *= buyExData.underlyingPrice;
            // Close short leg: BUY on sell exchange → limit fill when bestAsk <= targetClosePrice
            let bestAsk = sellExData.asks.length > 0 ? sellExData.asks[0][0] : 0;
            if (trade.opportunity.sellExchange === 'Deribit')
                bestAsk *= sellExData.underlyingPrice;
            attempt.limitLongFillable = bestBid > 0 && bestBid >= attempt.targetClosePrice;
            attempt.limitShortFillable = bestAsk > 0 && bestAsk <= attempt.targetClosePrice;
            // Both legs fillable at target price simultaneously → limit close wins
            if (attempt.limitLongFillable && attempt.limitShortFillable) {
                this.finalizeClose(trade, attempt, 'LIMIT', attempt.targetClosePrice, attempt.targetClosePrice);
            }
        }
    }
    /**
     * Called immediately after a trade opens. Calculates the fee-adjusted
     * symmetric close price and races all three close methods.
     *
     *  targetClosePrice = midpoint of [minClosePrice, maxClosePrice]
     *  Since P cancels in the PnL math, any P in this window captures full entry spread.
     *
     *  Entry spread:  sellPrice - buyPrice  (locked)
     *  Close contrib: closeLongPrice - closeShortPrice  (≈0 when both legs close at same P)
     *  Net PnL:       entrySpread - entryFees - closeFees
     */
    initiateClose(trade) {
        const { buyPrice, sellPrice, buyUnderlying, sellUnderlying, tradableSize, executionType } = trade.opportunity;
        const underlying = buyUnderlying || sellUnderlying;
        const midPrice = (buyPrice + sellPrice) / 2;
        // Fee per leg at close (0 for DUAL_RFQ, reduced for SINGLE_RFQ)
        let closeFeePerLeg = Math.min(underlying * 0.0003, midPrice * 0.125);
        if (executionType === 'DUAL_RFQ')
            closeFeePerLeg = 0;
        if (executionType === 'SINGLE_RFQ')
            closeFeePerLeg = Math.min(underlying * 0.0003, midPrice * 0.125) * 0.5;
        const minClosePrice = buyPrice + closeFeePerLeg; // long leg profitable if sold >= here
        const maxClosePrice = sellPrice - closeFeePerLeg; // short leg profitable if bought <= here
        // If entry spread can't survive close fees → market close immediately
        if (minClosePrice >= maxClosePrice) {
            console.log(`[CLOSE-INIT] Spread too thin for limit/RFQ close → immediate market for trade ${trade.id}`);
            const attempt = {
                tradeId: trade.id, targetClosePrice: midPrice, minClosePrice, maxClosePrice,
                rfqStatus: 'IDLE', limitLongFillable: false, limitShortFillable: false,
                marketCloseAt: Date.now(), marketCloseScheduled: true, closed: false
            };
            this.closeAttempts.set(trade.id, attempt);
            this.executeMarketClose(trade, attempt);
            return;
        }
        const targetClosePrice = (minClosePrice + maxClosePrice) / 2;
        const attempt = {
            tradeId: trade.id, targetClosePrice, minClosePrice, maxClosePrice,
            rfqStatus: 'IDLE', limitLongFillable: false, limitShortFillable: false,
            marketCloseAt: Date.now() + 30_000, marketCloseScheduled: true, closed: false
        };
        this.closeAttempts.set(trade.id, attempt);
        console.log(`[CLOSE-INIT] Trade ${trade.id} | Target: $${targetClosePrice.toFixed(2)} | Window: [$${minClosePrice.toFixed(2)}, $${maxClosePrice.toFixed(2)}] | Entry: ${executionType} | Market fallback: 30s`);
        this.broadcast({
            type: 'CLOSE_INITIATED',
            data: { tradeId: trade.id, targetClosePrice, minClosePrice, maxClosePrice, executionType, marketFallbackAt: attempt.marketCloseAt }
        });
        // Method 1: RFQ close — zero taker fees, preferred
        this.triggerRfqClose(trade, attempt);
        // Method 2: Limit orders — monitored passively via monitorCloseOrders() on each tick
        // Method 3: Market fallback — fires after 30s if neither above has closed
        setTimeout(() => this.executeMarketClose(trade, attempt), 30_000);
    }
    /** Method 1: Broadcast reverse block quote to both exchanges to close both legs. */
    triggerRfqClose(trade, attempt) {
        if (attempt.closed || attempt.rfqStatus !== 'IDLE')
            return;
        attempt.rfqStatus = 'PENDING';
        attempt.rfqCloseId = `RFC-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        console.log(`[RFQ-CLOSE] Reverse block quote for trade ${trade.id} | Size: ${trade.opportunity.tradableSize.toFixed(4)} | Type: ${trade.opportunity.executionType}`);
        // Simulate independent MM latencies for both close legs
        setTimeout(() => this.simulateRfqCloseResponse(trade, attempt, 'LONG'), 200 + Math.random() * 800);
        setTimeout(() => this.simulateRfqCloseResponse(trade, attempt, 'SHORT'), 200 + Math.random() * 800);
    }
    simulateRfqCloseResponse(trade, attempt, leg) {
        if (attempt.closed || (attempt.rfqStatus !== 'PENDING' && attempt.rfqStatus !== 'PARTIAL'))
            return;
        const key = this.getNormalizedKey(trade.opportunity.contract);
        const entries = this.prices.get(key);
        if (!entries)
            return;
        const deribit = entries.find(e => e.exchange === 'Deribit');
        const bybit = entries.find(e => e.exchange === 'Bybit');
        if (!deribit || !bybit)
            return;
        const buyExData = trade.opportunity.buyExchange === 'Deribit' ? deribit : bybit;
        const sellExData = trade.opportunity.sellExchange === 'Deribit' ? deribit : bybit;
        if (leg === 'LONG') {
            // Close long: sell on buy exchange. MM quotes ~99.5% of best bid (0 taker fee).
            let bid = buyExData.bids.length > 0 ? buyExData.bids[0][0] : 0;
            if (trade.opportunity.buyExchange === 'Deribit')
                bid *= buyExData.underlyingPrice;
            attempt.rfqSellQuote = bid * 0.995;
        }
        else {
            // Close short: buy on sell exchange. MM charges ~100.5% of best ask (0 taker fee).
            let ask = sellExData.asks.length > 0 ? sellExData.asks[0][0] : 0;
            if (trade.opportunity.sellExchange === 'Deribit')
                ask *= sellExData.underlyingPrice;
            attempt.rfqBuyQuote = ask * 1.005;
        }
        // BUG FIX #3: use !== undefined so zero-priced options don't get stuck in PARTIAL
        attempt.rfqStatus = (attempt.rfqSellQuote !== undefined && attempt.rfqBuyQuote !== undefined) ? 'QUOTED' : 'PARTIAL';
        if (attempt.rfqStatus === 'QUOTED' && attempt.rfqSellQuote && attempt.rfqBuyQuote) {
            if (attempt.rfqSellQuote >= attempt.minClosePrice && attempt.rfqBuyQuote <= attempt.maxClosePrice) {
                this.finalizeClose(trade, attempt, 'RFQ', attempt.rfqSellQuote, attempt.rfqBuyQuote);
            }
            else {
                attempt.rfqStatus = 'EXPIRED';
                console.log(`[RFQ-CLOSE-REJECT] Quotes outside profitable window for trade ${trade.id} | Sell: $${attempt.rfqSellQuote.toFixed(2)} | Buy: $${attempt.rfqBuyQuote.toFixed(2)}`);
            }
        }
    }
    /** Method 3: Market close — hits bid on long leg, lifts ask on short leg. Guaranteed fill. */
    executeMarketClose(trade, attempt) {
        if (attempt.closed)
            return;
        const key = this.getNormalizedKey(trade.opportunity.contract);
        const entries = this.prices.get(key);
        const deribit = entries?.find(e => e.exchange === 'Deribit');
        const bybit = entries?.find(e => e.exchange === 'Bybit');
        if (!deribit || !bybit) {
            // No price data — close at entry prices as last resort
            this.finalizeClose(trade, attempt, 'MARKET', trade.opportunity.buyPrice, trade.opportunity.sellPrice);
            return;
        }
        const buyExData = trade.opportunity.buyExchange === 'Deribit' ? deribit : bybit;
        const sellExData = trade.opportunity.sellExchange === 'Deribit' ? deribit : bybit;
        // BUG FIX #5: separate raw-price path from fallback to avoid double underlying conversion.
        // Deribit raw prices are in BTC fraction → must multiply by underlyingPrice to get USD.
        // trade.opportunity.buyPrice is ALREADY in USD → must NOT multiply again.
        let closeLongPrice;
        if (buyExData.bids.length > 0) {
            closeLongPrice = buyExData.bids[0][0];
            if (trade.opportunity.buyExchange === 'Deribit')
                closeLongPrice *= buyExData.underlyingPrice;
        }
        else {
            closeLongPrice = trade.opportunity.buyPrice; // already USD, no further conversion
        }
        let closeShortPrice;
        if (sellExData.asks.length > 0) {
            closeShortPrice = sellExData.asks[0][0];
            if (trade.opportunity.sellExchange === 'Deribit')
                closeShortPrice *= sellExData.underlyingPrice;
        }
        else {
            closeShortPrice = trade.opportunity.sellPrice; // already USD, no further conversion
        }
        console.log(`[MARKET-CLOSE] Timeout fallback for trade ${trade.id} | Long close: $${closeLongPrice.toFixed(2)} | Short close: $${closeShortPrice.toFixed(2)}`);
        this.finalizeClose(trade, attempt, 'MARKET', closeLongPrice, closeShortPrice);
    }
    /**
     * Single settlement point for all close methods. The first method to call
     * this wins; subsequent calls are no-ops (attempt.closed guard).
     *
     * Net PnL breakdown:
     *   entryGross  = (entrySellPrice - entryBuyPrice) × size  ← locked at open
     *   closeGross  = (closeLongPrice  - closeShortPrice) × size  ← ≈0 when P cancels
     *   totalFees   = entryFees + closeFees
     *   netPnL      = entryGross + closeGross - totalFees
     */
    finalizeClose(trade, attempt, method, closeLongPrice, // price received for selling the long leg
    closeShortPrice // price paid for buying back the short leg
    ) {
        if (attempt.closed)
            return; // Only one method can win
        attempt.closed = true;
        attempt.closedBy = method;
        const { buyPrice, sellPrice, buyUnderlying, sellUnderlying, tradableSize, potentialProfit, executionType } = trade.opportunity;
        const underlying = buyUnderlying || sellUnderlying;
        const size = tradableSize;
        // Entry gross spread (already locked)
        const entryGross = (sellPrice - buyPrice) * size;
        // Entry fees = what the VWAP engine subtracted from potentialProfit
        const entryFees = entryGross - potentialProfit;
        // Close contribution: P cancels when closeLongPrice === closeShortPrice
        const closeGross = (closeLongPrice - closeShortPrice) * size;
        // Close fees by method
        let closeFees = 0;
        if (method !== 'RFQ') {
            const stdFee = underlying * 0.0003;
            const longCloseFee = Math.min(stdFee, closeLongPrice * 0.125) * size;
            const shortCloseFee = Math.min(stdFee, closeShortPrice * 0.125) * size;
            if (executionType === 'DUAL_RFQ')
                closeFees = 0;
            else if (executionType === 'SINGLE_RFQ')
                closeFees = shortCloseFee;
            else
                closeFees = longCloseFee + shortCloseFee;
        }
        // RFQ close → zero taker fees regardless of entry type
        const netPnL = entryGross + closeGross - entryFees - closeFees;
        trade.status = 'CLOSED';
        trade.profitActual = netPnL;
        // Return capital to simulation balances
        if (this.dryRun) {
            const costUsd = buyPrice * size;
            if (trade.opportunity.buyExchange === 'Bybit') {
                this.balances.Bybit += costUsd + netPnL;
            }
            else {
                this.balances.Deribit += size + (netPnL / underlying);
            }
        }
        const holdMs = Date.now() - trade.timestamp;
        const holdSec = (holdMs / 1000).toFixed(1);
        console.log(`[CLOSE-${method}] Trade ${trade.id} | Net P&L: $${netPnL.toFixed(2)} | Hold: ${holdSec}s | EntryGross: $${entryGross.toFixed(2)} | CloseGross: $${closeGross.toFixed(2)} | Fees: $${(entryFees + closeFees).toFixed(2)}`);
        this.broadcast({ type: 'TRADE_EXECUTED', data: trade });
        this.broadcast({
            type: 'TRADE_CLOSED',
            data: {
                tradeId: trade.id, closedBy: method, netPnL,
                entryGross, closeGross,
                entryFees, closeFees,
                holdMs,
                closeLongPrice, closeShortPrice
            }
        });
        // BUG FIX #6: prune closed trades to prevent unbounded memory growth.
        // Keep last 500 closed trades for UI history; drop the oldest beyond that.
        setTimeout(() => {
            const closedCount = this.trades.filter(t => t.status === 'CLOSED').length;
            if (closedCount > 500) {
                const firstClosedIdx = this.trades.findIndex(t => t.status === 'CLOSED');
                if (firstClosedIdx !== -1) {
                    const removed = this.trades.splice(firstClosedIdx, 1)[0];
                    this.closeAttempts.delete(removed.id);
                }
            }
            // Also evict stale RFQ entries (older than 60s)
            const cutoff = Date.now() - 60_000;
            for (const [k, v] of this.activeDualRfqs) {
                if (v.timestamp < cutoff)
                    this.activeDualRfqs.delete(k);
            }
            for (const [k, v] of this.activeSingleRfqs) {
                if (v.timestamp < cutoff)
                    this.activeSingleRfqs.delete(k);
            }
        }, 0);
    }
    broadcast(message) {
        const payload = JSON.stringify(message);
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
    async fetchDeribitInstruments() {
        const currencies = ["BTC", "ETH"];
        let allSymbols = [];
        for (const currency of currencies) {
            const url = `https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.result) {
                const now = Date.now();
                const symbols = data.result
                    .filter((i) => i.expiration_timestamp - now < 30 * 24 * 60 * 60 * 1000)
                    .map((i) => i.instrument_name);
                allSymbols = allSymbols.concat(symbols);
            }
        }
        // Limit to max 500 contracts to scan more market but prevent complete OOM
        this.activeSymbols = allSymbols.slice(0, 500);
        return this.activeSymbols;
    }
}
