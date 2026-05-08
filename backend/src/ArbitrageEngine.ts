import WebSocket from 'ws';

interface OptionContract {
  asset: string;
  expiry: string; // YYYY-MM-DD
  strike: number;
  type: 'CALL' | 'PUT';
}

interface Opportunity {
  contract: OptionContract;
  buyExchange: string;
  buyPrice: number;
  buyUnderlying: number;
  buyIv: number;
  sellExchange: string;
  sellPrice: number;
  sellUnderlying: number;
  sellIv: number;
  profitPercent: number;
  ivSpread: number;
  indexMismatch: number;
  adjustedProfitPercent: number;
  tradableSize: number;
  potentialProfit: number;
}

interface TradeRecord {
  id: string;
  opportunity: Opportunity;
  timestamp: number;
  status: 'OPEN' | 'CLOSED' | 'ERROR';
  buyOrderId?: string;
  sellOrderId?: string;
  profitActual?: number;
}

interface PriceData {
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  bidIv: number;
  askIv: number;
  underlyingPrice: number;
  delta: number;
  exchange: string;
  timestamp: number;
}

export class ArbitrageEngine {
  private clients: Set<WebSocket> = new Set();
  private prices: Map<string, PriceData[]> = new Map();
  private trades: TradeRecord[] = [];
  private indexBasisHistory: number[] = [];
  private lastUpdate = 0;
  private debugCount = 0;
  private matchedPairsCount = 0;
  private bybitDebugCount = 0;
  private activeSymbols: string[] = [];

  // Configuration
  private dryRun = process.env.DRY_RUN !== 'false'; // Default to true for safety
  private minProfitThreshold = 0.5; // 0.5% min profit to execute
  private maxPositionSize = 0.1; // 0.1 BTC or 1 ETH max per leg

  constructor() {
    console.log(`[ENGINE] Starting in ${this.dryRun ? 'DRY RUN' : 'LIVE'} mode`);
    this.startExchangeConnections();
    
    // Broadcast status every 5 seconds so the user knows we are alive
    setInterval(() => {
      let deribitCount = 0, bybitCount = 0, matchedPairs = 0;
      for (const entries of this.prices.values()) {
        const exchanges = new Set(entries.map(e => e.exchange));
        if (exchanges.has("Deribit")) deribitCount++;
        if (exchanges.has("Bybit")) bybitCount++;
        if (exchanges.has("Deribit") && exchanges.has("Bybit")) matchedPairs++;
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
          exchanges: ["Deribit", "Bybit"]
        }
      });
    }, 5000);
  }

  public handleClient(ws: WebSocket) {
    this.clients.add(ws);

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', (err: Error) => {
      console.error('Client WS Error:', err);
      this.clients.delete(ws);
    });

    // Send initial state
    ws.send(JSON.stringify({ type: "WELCOME", message: "Connected to Arbitrage Engine (Node.js)" }));
  }

  public getStatus() {
    return {
      connections: this.clients.size,
      priceCount: this.prices.size,
      lastUpdate: this.lastUpdate
    };
  }

  private async startExchangeConnections() {
    try {
      console.log("Fetching global instrument list from Deribit...");
      const symbols = await this.fetchDeribitInstruments();
      this.activeSymbols = symbols;
      console.log(`Global list ready: ${symbols.length} instruments.`);
      
      this.connectDeribit(symbols);
      this.connectBybit(symbols);
    } catch (e) {
      console.error("Failed to initialize instrument list:", e);
      // Fallback to basic connection if discovery fails
      this.connectDeribit([]);
      this.connectBybit([]);
    }
  }

  private connectDeribit(symbols: string[]) {
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
              channels: batch.map(s => `ticker.${s}.100ms`)
            },
            id: i
          };
          ws.send(JSON.stringify(subMsg));
          // Small sleep to avoid rate limiting on sub
          await new Promise(r => setTimeout(r, 100));
        }
      }
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.params && response.params.channel.startsWith("ticker")) {
          this.updatePrice("Deribit", response.params.data);
        }
      } catch (e) {}
    });

    ws.on('error', (err: Error) => console.error('Deribit WS Error:', err));
    ws.on('close', () => {
      console.log('Deribit connection closed. Reconnecting in 5s...');
      setTimeout(() => this.connectDeribit(this.activeSymbols), 5000);
    });
  }

  private connectBybit(symbols: string[]) {
    console.log("Attempting Bybit connection...");
    const ws = new WebSocket("wss://stream.bybit.com/v5/public/option");
    
    ws.on('open', () => {
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
            args: batch.map(s => `tickers.${s}`)
          };
          ws.send(JSON.stringify(subMsg));
        }
      }

      // Bybit heartbeat
      setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ op: "ping" }));
        }
      }, 20000);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.op === "subscribe" && response.success === false) {
          console.error("Bybit Subscription Failed:", response.ret_msg);
        }
        if (response.topic && response.topic.startsWith("tickers")) {
          const rawData = response.data;
          this.updatePrice("Bybit", rawData);
        }
      } catch (e) {}
    });

    ws.on('error', (err: Error) => console.error('Bybit WS Error:', err.message));
    ws.on('close', () => {
      console.log('Bybit connection closed. Reconnecting in 5s...');
      setTimeout(() => this.connectBybit(this.activeSymbols), 5000);
    });
  }

  private updatePrice(exchange: string, rawData: any) {
    const rawSymbol = rawData.s || rawData.instrument_name || rawData.symbol;
    if (!rawSymbol) return;

    try {
      let contract: OptionContract;
      if (exchange === "Deribit") {
        contract = this.parseDeribitSymbol(rawSymbol);
      } else if (exchange === "Bybit") {
        contract = this.parseBybitSymbol(rawSymbol);
      } else {
        return;
      }

      const normalizedKey = this.getNormalizedKey(contract);
      let bid = parseFloat(rawData.b || rawData.best_bid_price || rawData.bidPrice || rawData.bid1Price || 0);
      let ask = parseFloat(rawData.a || rawData.best_ask_price || rawData.askPrice || rawData.ask1Price || 0);

      // Deribit WebSocket stream sends 'underlying_price' (snake_case).
      // Bybit sends 'underlyingPrice' (camelCase). index_price is REST-only on Deribit.
      const underlyingPrice = parseFloat(
        rawData.underlying_price ||   // Deribit WebSocket ticker
        rawData.underlyingPrice ||     // Bybit WebSocket ticker
        rawData.index_price ||         // Deribit REST fallback
        rawData.indexPrice ||          // Bybit REST fallback
        rawData.markPrice ||           // last resort
        0
      );

      if (exchange === "Deribit") {
        if (underlyingPrice === 0) {
          // Can't convert BTC-denominated price to USD without underlying — skip
          return;
        }
        bid = bid * underlyingPrice;
        ask = ask * underlyingPrice;
      }

      // IV extraction:
      // Deribit: bid_iv and ask_iv are already in percentage (e.g. 85.5 = 85.5%)
      // Bybit:   bidIv and askIv are in decimal form (e.g. 0.855 = 85.5%)
      let bidIv = 0;
      let askIv = 0;
      if (exchange === "Deribit") {
        bidIv = parseFloat(rawData.bid_iv || 0);
        askIv = parseFloat(rawData.ask_iv || 0);
      } else {
        // Bybit sends as decimal — multiply by 100
        bidIv = parseFloat(rawData.bidIv || 0) * 100;
        askIv = parseFloat(rawData.askIv || 0) * 100;
      }

      const price: PriceData = {
        bid,
        bidSize: parseFloat(rawData.B || rawData.best_bid_amount || rawData.bidSize || rawData.bid1Size || 0),
        ask,
        askSize: parseFloat(rawData.A || rawData.best_ask_amount || rawData.askSize || rawData.ask1Size || 0),
        bidIv,
        askIv,
        underlyingPrice,
        delta: parseFloat(rawData.delta || (rawData.greeks && rawData.greeks.delta) || 0),
        exchange,
        timestamp: Date.now()
      };

      let entries = this.prices.get(normalizedKey) || [];
      entries = entries.filter(e => e.exchange !== exchange);
      entries.push(price);
      this.prices.set(normalizedKey, entries);

      this.lastUpdate = Date.now();
      this.checkArbitrage(normalizedKey, contract, entries);
    } catch (e) {
      console.error(`[updatePrice] Error processing ${exchange} data:`, e);
    }
  }

  private parseOptionSymbol(symbol: string): OptionContract {
    // Handles both: BTC-4MAY26-83000-C (single digit day) and BTC-04MAY26-83000-C (zero-padded)
    const parts = symbol.split("-");
    if (parts.length < 4) throw new Error(`Invalid symbol: ${symbol}`);

    const asset = parts[0];
    const dateStr = parts[1]; // e.g. '4MAY26' or '04MAY26'
    const strike = parseFloat(parts[2]);
    const type = parts[3] === "C" ? "CALL" : "PUT";

    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
    };

    // Dynamically find where the month letters start (skip leading digits)
    const monthStart = dateStr.search(/[A-Z]/);
    const day = dateStr.substring(0, monthStart).padStart(2, '0');
    const monthStr = dateStr.substring(monthStart, monthStart + 3);
    const yearShort = dateStr.substring(monthStart + 3);

    const month = months[monthStr];
    if (!month) throw new Error(`Unknown month: ${monthStr} in ${symbol}`);

    const expiry = `20${yearShort}-${month}-${day}`;
    return { asset, expiry, strike, type };
  }

  private parseDeribitSymbol(symbol: string): OptionContract {
    return this.parseOptionSymbol(symbol);
  }

  private parseBybitSymbol(symbol: string): OptionContract {
    // Format: BTC-31MAY24-65000-C-USDT
    // Remove the -USDT suffix before parsing
    const cleanSymbol = symbol.replace("-USDT", "");
    return this.parseOptionSymbol(cleanSymbol);
  }

  private getNormalizedKey(contract: OptionContract): string {
    return `${contract.asset}_${contract.expiry}_${contract.strike}_${contract.type}`;
  }

  private checkArbitrage(key: string, contract: OptionContract, entries: PriceData[]) {
    // We need at least two different exchanges to find arbitrage
    const deribit = entries.find(e => e.exchange === "Deribit");
    const bybit = entries.find(e => e.exchange === "Bybit");

    if (!deribit || !bybit) return;

    // Stale data guard: both quotes must be fresh (within 60 seconds)
    const now = Date.now();
    if (now - deribit.timestamp > 60_000 || now - bybit.timestamp > 60_000) return;

    // Use best available ask for spread display (ask always present if there's a market)
    const deribitAsk = deribit.ask || 0;
    const bybitAsk = bybit.ask || 0;
    const deribitBid = deribit.bid || 0;
    const bybitBid = bybit.bid || 0;

    // OPTION A: Index Monitoring (Moving Basis)
    const rawBasis = deribit.underlyingPrice - bybit.underlyingPrice;
    this.indexBasisHistory.push(rawBasis);
    if (this.indexBasisHistory.length > 100) this.indexBasisHistory.shift();
    const movingAverageBasis = this.indexBasisHistory.reduce((a, b) => a + b, 0) / this.indexBasisHistory.length;
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
      bid:         useRoute1 ? deribitBid : bybitBid,
      bidExchange: useRoute1 ? "Deribit"  : "Bybit",
      ask:         useRoute1 ? bybitAsk   : deribitAsk,
      askExchange: useRoute1 ? "Bybit"    : "Deribit",
      spreadPercent: isFinite(bestPricePct) ? bestPricePct : 0,
      ivSpread: bestIvSpread,
      indexMismatch: currentMismatch,
      movingBasis: movingAverageBasis,
      adjustedProfitPercent: isFinite(bestPricePct) ? bestPricePct : 0
    };
    this.broadcast({ type: "TICKER", data: ticker });

    // OPPORTUNITY: requires a real two-sided market on both exchanges
    if (!deribitBid || !deribitAsk || !bybitBid || !bybitAsk) return;

    // Trigger on price spread > threshold
    if (bestPricePct > this.minProfitThreshold) {
      const tradableSize = useRoute1 ? Math.min(deribit.bidSize, bybit.askSize) : Math.min(bybit.bidSize, deribit.askSize);
      if (tradableSize <= 0) return;

      const opportunity: Opportunity = {
        contract,
        buyExchange:    useRoute1 ? "Bybit"   : "Deribit",
        buyPrice:       useRoute1 ? bybitAsk  : deribitAsk,
        buyUnderlying:  useRoute1 ? bybit.underlyingPrice  : deribit.underlyingPrice,
        buyIv:          useRoute1 ? bybit.askIv : deribit.askIv,
        sellExchange:   useRoute1 ? "Deribit" : "Bybit",
        sellPrice:      useRoute1 ? deribitBid : bybitBid,
        sellUnderlying: useRoute1 ? deribit.underlyingPrice : bybit.underlyingPrice,
        sellIv:         useRoute1 ? deribit.bidIv : bybit.bidIv,
        profitPercent:  bestPricePct,
        ivSpread:       bestIvSpread,
        indexMismatch:  currentMismatch,
        adjustedProfitPercent: bestPricePct,
        tradableSize: Math.min(tradableSize, this.maxPositionSize),
        potentialProfit: (useRoute1 ? (deribitBid - bybitAsk) : (bybitBid - deribitAsk)) * Math.min(tradableSize, this.maxPositionSize)
      };
      
      this.broadcast({ type: "OPPORTUNITY", data: opportunity });
      this.attemptExecution(opportunity);
      
      console.log(`[ARB] ${contract.asset} ${contract.strike}${contract.type[0]} | Price: ${bestPricePct.toFixed(2)}% | IV Spread: ${bestIvSpread.toFixed(2)}% | Buy ${opportunity.buyExchange}@${opportunity.buyPrice.toFixed(0)} Sell ${opportunity.sellExchange}@${opportunity.sellPrice.toFixed(0)}`);
    }
  }

  private async attemptExecution(opportunity: Opportunity) {
    // Check if we already have an open trade for this symbol to avoid double entry
    const existing = this.trades.find(t => t.opportunity.contract.asset === opportunity.contract.asset && t.status === 'OPEN');
    if (existing) return;

    console.log(`[EXECUTION] Attempting trade for ${opportunity.contract.asset}...`);
    
    const trade: TradeRecord = {
      id: Date.now().toString(),
      opportunity,
      timestamp: Date.now(),
      status: 'OPEN'
    };

    if (this.dryRun) {
      console.log(`[DRY RUN] Executed simulated trade for ${opportunity.contract.asset} @ ${opportunity.profitPercent.toFixed(2)}% profit`);
      this.trades.push(trade);
      this.broadcast({ type: "TRADE_EXECUTED", data: trade });
      return;
    }

    // TODO: Implement Real Execution Logic with API Keys
    try {
      // 1. Place Buy Order
      // 2. Place Sell Order
      // 3. Update trade status
      this.trades.push(trade);
      this.broadcast({ type: "TRADE_EXECUTED", data: trade });
    } catch (e) {
      console.error("[EXECUTION ERROR]", e);
    }
  }

  private broadcast(message: any) {
    const payload = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  private async fetchDeribitInstruments(): Promise<string[]> {
    const currencies = ["BTC", "ETH"];
    let allSymbols: string[] = [];
    
    for (const currency of currencies) {
      const url = `https://www.deribit.com/api/v2/public/get_instruments?currency=${currency}&kind=option&expired=false`;
      const response = await fetch(url);
      const data: any = await response.json();
      if (data.result) {
        const now = Date.now();
        const symbols = data.result
          .filter((i: any) => i.expiration_timestamp - now < 30 * 24 * 60 * 60 * 1000)
          .map((i: any) => i.instrument_name);
        allSymbols = allSymbols.concat(symbols);
      }
    }
    this.activeSymbols = allSymbols;
    return allSymbols;
  }
}
