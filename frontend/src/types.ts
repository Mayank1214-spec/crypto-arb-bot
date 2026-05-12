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
  layersConsumed?: number;
  timestamp: number;
  symbol: string;
  executionType?: 'ORDERBOOK' | 'SINGLE_RFQ' | 'DUAL_RFQ';
}

export const TradeStatus = {
  open: 'open',
  closed: 'closed',
  error: 'error'
} as const;

export type TradeStatus = typeof TradeStatus[keyof typeof TradeStatus];

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
  source: 'local' | 'backend';
}

export interface EngineStatus {
  priceCount: number;
  matchedPairs: number;
  deribitCount: number;
  bybitCount: number;
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

export interface ExecutionEvent {
  id: number;
  timestamp: number;
  type: 'ENTRY' | 'EXIT' | 'OPPORTUNITY' | 'STATUS' | 'ERROR';
  message: string;
  data?: any;
}

export interface TradeStats {
  totalTrades: number;
  openTrades: number;
  closedTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalRealizedProfit: number;
  totalUnrealizedProfit: number;
  avgProfitPerTrade: number;
  bestTrade: number;
  worstTrade: number;
}
