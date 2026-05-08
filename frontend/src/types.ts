export interface OptionContract {
  asset: string;
  expiry: string;
  strike: number;
  type: 'CALL' | 'PUT';
}

export interface Opportunity {
  asset: string;
  expiry: string;
  strike: number;
  type: string;
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
  timestamp: number;
  symbol: string;
}

export enum TradeStatus {
  open = 'open',
  closed = 'closed'
}

export interface PaperTrade {
  id: string;
  entryOpportunity: Opportunity;
  quantity: number;
  entryTime: number;
  entryProfitPercent: number;
  targetProfit: number;
  entrySpreadPercent: number;
  entryBuyPrice: number;
  entrySellPrice: number;
  entryFees: number;
  status: TradeStatus;
  exitTime?: number;
  exitBuyPrice?: number;
  exitSellPrice?: number;
  exitFees?: number;
  realizedProfit?: number;
  scaleCount: number;
}

export interface EngineStatus {
  priceCount: number;
  matchedPairs: number;
  lastUpdate: number;
  exchanges: string[];
}

export interface Ticker {
  symbol: string;
  bid: number;
  bidExchange: string;
  ask: number;
  askExchange: string;
  spreadPercent: number;
  ivSpread: number;
  indexMismatch: number;
  movingBasis: number;
  adjustedProfitPercent: number;
}
