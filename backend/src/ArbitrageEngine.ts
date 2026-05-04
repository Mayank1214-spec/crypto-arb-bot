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
          channels: [
            "ticker.btc_usd.raw",
            "ticker.eth_usd.raw"
          ]
        }
      };
      ws.send(JSON.stringify(subscribeMsg));
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
    const ws = new WebSocket("wss://nbstream.binance.com/eoptions/ws/all@ticker");
    
    ws.on('open', () => {
      console.log("Connected to Binance Options");
    });

    ws.on('message', (data: WebSocket.Data) => {
      try {
        const response = JSON.parse(data.toString());
        if (Array.isArray(response)) {
          response.forEach(item => this.updatePrice("Binance", item));
        } else {
          this.updatePrice("Binance", response);
        }
      } catch (e) {
        console.error('Error processing Binance message:', e);
      }
    });

    ws.on('error', (err: Error) => console.error('Binance WS Error:', err));
    ws.on('close', () => {
      console.log('Binance connection closed. Reconnecting in 5s...');
      setTimeout(() => this.connectBinance(), 5000);
    });
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
