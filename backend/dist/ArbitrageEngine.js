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
                if (type === "snapshot" || (rawData.b && rawData.b.length > 5)) {
                    if (rawData.b)
                        priceData.bids = rawData.b.map((x) => [parseFloat(x[0]), parseFloat(x[1])]);
                    if (rawData.a)
                        priceData.asks = rawData.a.map((x) => [parseFloat(x[0]), parseFloat(x[1])]);
                }
            }
            priceData.timestamp = Date.now();
            this.prices.set(normalizedKey, entries);
            this.lastUpdate = Date.now();
            if (priceData.asks.length > 0 && priceData.bids.length > 0) {
                // Only check arb if we have depth data.
                if (priceData.asks.length > 0 && priceData.bids.length > 0) {
                    this.checkArbitrage(normalizedKey, contract, entries);
                }
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
            this.monitorOpenTrades(normalizedKey, priceData);
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
            if (layerNetProfit <= 0)
                break; // This layer is not profitable after fees
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
                layersConsumed
            };
            this.broadcast({ type: "OPPORTUNITY", data: opportunity });
            this.attemptExecution(opportunity);
            console.log(`[ARB-DEPTH] ${contract.asset} ${contract.strike}${contract.type[0]} | Profit: $${netAbsoluteProfit.toFixed(2)} (${vwapProfitPercent.toFixed(2)}%) | Size: ${accumulatedSize.toFixed(4)} | Layers: ${layersConsumed}`);
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
        if (this.dryRun) {
            console.log(`[DRY RUN] Executed simulated trade for ${opportunity.contract.asset} @ ${opportunity.profitPercent.toFixed(2)}% profit`);
        }
        else {
            // TODO: Place real orders
        }
    }
    monitorOpenTrades(key, currentPrice) {
        // key is asset_expiry_strike_type
        // currentPrice is the latest data for one exchange
        for (const trade of this.trades) {
            if (trade.status !== 'OPEN')
                continue;
            const tradeKey = this.getNormalizedKey(trade.opportunity.contract);
            if (tradeKey !== key)
                continue;
            // We need prices from BOTH exchanges to calculate current PnL accurately
            const entries = this.prices.get(key);
            if (!entries || entries.length < 2)
                continue;
            const deribit = entries.find(e => e.exchange === "Deribit");
            const bybit = entries.find(e => e.exchange === "Bybit");
            if (!deribit || !bybit)
                continue;
            // Calculate PnL (Simplified: current exit spread)
            // If we bought Bybit and sold Deribit (useRoute1)
            const buyExchangeData = trade.opportunity.buyExchange === "Deribit" ? deribit : bybit;
            const sellExchangeData = trade.opportunity.sellExchange === "Deribit" ? deribit : bybit;
            // To close: Sell bought leg (at its bid), Buy sold leg (at its ask)
            const sellBid = sellExchangeData.bids && sellExchangeData.bids.length > 0 ? sellExchangeData.bids[0][0] : 0;
            const buyAsk = buyExchangeData.asks && buyExchangeData.asks.length > 0 ? buyExchangeData.asks[0][0] : 0;
            const currentExitProfit = (sellBid - buyAsk);
            const entryProfit = (trade.opportunity.sellPrice - trade.opportunity.buyPrice);
            // If the spread has narrowed or inverted in our favor (target achieved)
            // or if we hit a stop loss (not implemented yet)
            const unrealizedPnL = (currentExitProfit - entryProfit) * trade.opportunity.tradableSize;
            // Auto-close if we captured 80% of the predicted potential profit or fixed %
            if (unrealizedPnL > (trade.opportunity.potentialProfit * 0.8)) {
                this.closeTrade(trade, unrealizedPnL);
            }
        }
    }
    closeTrade(trade, profit) {
        console.log(`[EXECUTION] Closing trade ${trade.id} | Realized Profit: $${profit.toFixed(2)}`);
        trade.status = 'CLOSED';
        trade.profitActual = profit;
        if (this.dryRun) {
            // Credit back original simulation cost + profit
            if (trade.opportunity.buyExchange === 'Bybit') {
                this.balances.Bybit += (trade.opportunity.buyPrice * trade.opportunity.tradableSize) + profit;
            }
            else {
                // Approximate BTC/ETH profit
                const asset = trade.opportunity.contract.asset;
                const underlyingPrice = trade.opportunity.buyUnderlying;
                this.balances.Deribit += trade.opportunity.tradableSize + (profit / underlyingPrice);
            }
        }
        this.broadcast({ type: "TRADE_EXECUTED", data: trade }); // Update status in Flutter
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
