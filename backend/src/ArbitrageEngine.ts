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
  sellExchange: string;
  sellPrice: number;
  sellUnderlying: number;
  profitPercent: number;
  tradableSize: number;
  potentialProfit: number;
}

interface PriceData {
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  underlyingPrice: number;
  exchange: string;
  timestamp: number;
}

export class ArbitrageEngine {
  private prices: Map<string, PriceData[]> = new Map();
  private clients: Set<WebSocket> = new Set();
  private lastUpdate = 0;
  private binanceUrls: string[] = [
    "wss://nbstream.binance.com/eoptions/ws",
    "wss://vstream.binance.com/vstream",
    "wss://vstream.binance.com/ws"
  ];
  private currentBinanceUrlIndex: number = 0;
  private binancePollInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startExchangeConnections();
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

  private startExchangeConnections() {
    this.connectDeribit();
    this.connectBinance();
  }

  private connectDeribit() {
    const ws = new WebSocket("wss://www.deribit.com/ws/api/v2");
    
    ws.on('open', () => {
      console.log("Connected to Deribit");
      const subscribeMsg = {
        jsonrpc: "2.0",
        id: 1,
        method: "public/subscribe",
        params: {
          channels: ["ticker.BTC-27JUN25-100000-C.100ms", "ticker.ETH-27JUN25-2000-C.100ms"] // We will add logic to dynamic subscribe later
        }
      };
      // For now, let's subscribe to all tickers if possible, or just the main ones
      // Deribit doesn't have an "all" channel, we usually subscribe to instrument groups
      const subAll = {
        jsonrpc: "2.0",
        id: 1,
        method: "public/subscribe",
        params: {
          channels: ["ticker.BTC-ANY.100ms", "ticker.ETH-ANY.100ms"]
        }
      };
      ws.send(JSON.stringify(subAll));

      // Start Heartbeat
      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ jsonrpc: "2.0", method: "public/test", params: {}, id: 999 }));
        } else {
          clearInterval(heartbeat);
        }
      }, 30000);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.params && response.params.channel.startsWith("ticker")) {
          this.updatePrice("Deribit", response.params.data);
        }
      } catch (e) {
        console.error('Error processing Deribit message:', e);
      }
    });

    ws.on('error', (err: Error) => console.error('Deribit WS Error:', err));
    ws.on('close', () => {
      console.log('Deribit connection closed. Reconnecting in 5s...');
      setTimeout(() => this.connectDeribit(), 5000);
    });
  }

  private connectBinance() {
    const url = this.binanceUrls[this.currentBinanceUrlIndex];
    console.log(`Attempting Binance connection via: ${url}`);
    const ws = new WebSocket(url);
    
    ws.on('open', () => {
      console.log(`Connected to Binance Options via ${url}`);
      // Reset index on success
      this.currentBinanceUrlIndex = 0;

      const subscribeMsg = {
        method: "SUBSCRIBE",
        params: ["all@ticker"],
        id: 1
      };
      ws.send(JSON.stringify(subscribeMsg));

      const heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(heartbeat);
        }
      }, 30000);
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.result === null && response.id === 1) {
          console.log("Binance subscription successful");
          return;
        }

        if (Array.isArray(response)) {
          response.forEach(item => this.updatePrice("Binance", item));
        } else if (response.data) {
          const payload = Array.isArray(response.data) ? response.data : [response.data];
          payload.forEach((item: any) => this.updatePrice("Binance", item));
        } else {
          this.updatePrice("Binance", response);
        }
      } catch (e) {
        // Silently skip non-JSON or heartbeat responses
      }
    });

    ws.on('error', (err: any) => {
      console.error(`Binance WS Error (${url}):`, err.message || err);
    });

    ws.on('close', (code, reason) => {
      console.log(`Binance connection closed (Code: ${code}). Reason: ${reason}`);
      
      // If we've tried all URLs and none work, switch to REST polling
      if (this.currentBinanceUrlIndex === this.binanceUrls.length - 1 && !this.binancePollInterval) {
        console.log("⚠️ All Binance WebSocket endpoints blocked. Switching to REST Polling Fallback...");
        this.startBinanceRestPolling();
      }

      this.currentBinanceUrlIndex = (this.currentBinanceUrlIndex + 1) % this.binanceUrls.length;
      
      console.log(`Retrying next Binance endpoint in 5s...`);
      setTimeout(() => this.connectBinance(), 5000);
    });
  }

  private startBinanceRestPolling() {
    if (this.binancePollInterval) return;
    
    // Initial poll
    this.pollBinanceRest();
    
    // Poll every 2 seconds (safe rate limit for Binance)
    this.binancePollInterval = setInterval(() => {
      this.pollBinanceRest();
    }, 2000);
  }

  private async pollBinanceRest() {
    try {
      // Using global fetch (available in Node 18+)
      const response = await fetch("https://eapi.binance.com/eapi/v1/ticker");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      if (Array.isArray(data)) {
        data.forEach(item => this.updatePrice("Binance", item));
      }
    } catch (e: any) {
      console.error(`Binance REST Poll Error: ${e.message}`);
    }
  }

  private updatePrice(exchange: string, rawData: any) {
    const rawSymbol = rawData.s || rawData.instrument_name;
    if (!rawSymbol) return;

    let contract: OptionContract | null = null;
    try {
      if (exchange === "Deribit") {
        contract = this.parseDeribitSymbol(rawSymbol);
      } else if (exchange === "Binance") {
        contract = this.parseBinanceSymbol(rawSymbol);
      }
    } catch (e) {
      // console.error(`Failed to parse symbol ${rawSymbol} from ${exchange}`);
      return;
    }

    if (!contract) return;

    const normalizedKey = this.getNormalizedKey(contract);

    const price: PriceData = {
      bid: parseFloat(rawData.b || rawData.best_bid_price || 0),
      bidSize: parseFloat(rawData.B || rawData.best_bid_amount || 0),
      ask: parseFloat(rawData.a || rawData.best_ask_price || 0),
      askSize: parseFloat(rawData.A || rawData.best_ask_amount || 0),
      underlyingPrice: parseFloat(rawData.up || rawData.index_price || 0),
      exchange,
      timestamp: Date.now()
    };

    let entries = this.prices.get(normalizedKey) || [];
    entries = entries.filter(e => e.exchange !== exchange);
    entries.push(price);
    this.prices.set(normalizedKey, entries);

    this.lastUpdate = Date.now();
    this.checkArbitrage(normalizedKey, contract, entries);
  }

  private parseDeribitSymbol(symbol: string): OptionContract {
    const parts = symbol.split("-");
    if (parts.length < 4) throw new Error("Invalid Deribit symbol");

    const asset = parts[0];
    const dateStr = parts[1];
    const strike = parseFloat(parts[2]);
    const type = parts[3] === "C" ? "CALL" : "PUT";

    const day = dateStr.substring(0, 2);
    const monthStr = dateStr.substring(2, 5);
    const yearShort = dateStr.substring(5, 7);

    const months: Record<string, string> = {
      JAN: "01", FEB: "02", MAR: "03", APR: "04", MAY: "05", JUN: "06",
      JUL: "07", AUG: "08", SEP: "09", OCT: "10", NOV: "11", DEC: "12"
    };

    const expiry = `20${yearShort}-${months[monthStr]}-${day}`;
    return { asset, expiry, strike, type };
  }

  private parseBinanceSymbol(symbol: string): OptionContract {
    const parts = symbol.split("-");
    if (parts.length < 4) throw new Error("Invalid Binance symbol");

    const asset = parts[0];
    const dateStr = parts[1];
    const strike = parseFloat(parts[2]);
    const type = parts[3] === "C" ? "CALL" : "PUT";

    const year = dateStr.substring(0, 2);
    const month = dateStr.substring(2, 4);
    const day = dateStr.substring(4, 6);

    const expiry = `20${year}-${month}-${day}`;
    return { asset, expiry, strike, type };
  }

  private getNormalizedKey(contract: OptionContract): string {
    return `${contract.asset}_${contract.expiry}_${contract.strike}_${contract.type}`;
  }

  private checkArbitrage(key: string, contract: OptionContract, entries: PriceData[]) {
    if (entries.length < 2) return;

    let bestBid = entries[0];
    let bestAsk = entries[0];

    for (const entry of entries) {
      if (entry.bid > bestBid.bid) bestBid = entry;
      if (entry.ask < bestAsk.ask && entry.ask > 0) bestAsk = entry;
    }

    if (bestBid.bid > bestAsk.ask && bestAsk.ask > 0) {
      const profit = bestBid.bid - bestAsk.ask;
      const profitPercent = (profit / bestAsk.ask) * 100;

      if (profitPercent > 0.05) {
        const tradableSize = Math.min(bestBid.bidSize, bestAsk.askSize);
        const potentialProfit = profit * tradableSize;

        const opportunity: Opportunity = {
          contract,
          buyExchange: bestAsk.exchange,
          buyPrice: bestAsk.ask,
          buyUnderlying: bestAsk.underlyingPrice,
          sellExchange: bestBid.exchange,
          sellPrice: bestBid.bid,
          sellUnderlying: bestBid.underlyingPrice,
          profitPercent,
          tradableSize,
          potentialProfit
        };

        this.broadcast({ type: "OPPORTUNITY", data: opportunity });
      }
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
}
