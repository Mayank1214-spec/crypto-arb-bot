import React from 'react';
import { TradeStatus } from '../types';
import type { PaperTrade, Ticker } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle, CheckCircle2, Clock, ArrowUpRight, ArrowDownRight, AlertTriangle } from 'lucide-react';

interface TradesTableProps {
  trades: PaperTrade[];
  tickers: Ticker[];
  onCloseTrade: (trade: PaperTrade) => void;
  showHistory?: boolean;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TradesTable: React.FC<TradesTableProps> = ({ trades, tickers, onCloseTrade, showHistory = false }) => {
  const filteredTrades = trades.filter(t =>
    showHistory ? t.status === TradeStatus.closed : t.status === TradeStatus.open
  );

  const getUnrealizedPnL = (trade: PaperTrade): number | null => {
    if (trade.status !== TradeStatus.open) return null;
    const ticker = tickers.find(t => t.symbol === trade.entryOpportunity.symbol);
    if (!ticker) return null;
    const entrySpread = (trade.entrySellPrice - trade.entryBuyPrice) * trade.quantity;
    const exitSpread = (ticker.ask - ticker.bid) * trade.quantity;
    return entrySpread - exitSpread - trade.entryFees;
  };

  const getDuration = (trade: PaperTrade): string => {
    const end = trade.exitTime || Date.now();
    const ms = end - trade.entryTime;
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  };

  return (
    <div className="overflow-x-auto">
      <table className="arb-table">
        <thead>
          <tr>
            <th>Instrument</th>
            <th>Route</th>
            <th>Size</th>
            <th>Entry Spread</th>
            <th>{showHistory ? 'Realized P&L' : 'Unrealized P&L'}</th>
            <th>Duration</th>
            <th>Source</th>
            <th>Status</th>
            {!showHistory && <th></th>}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {filteredTrades.length === 0 ? (
              <tr>
                <td colSpan={showHistory ? 8 : 9} className="text-center py-16">
                  <div className="flex flex-col items-center gap-3 text-slate-600">
                    {showHistory
                      ? <><CheckCircle2 size={28} /><span className="text-xs font-semibold uppercase tracking-widest">No trade history yet</span></>
                      : <><div className="spinner" /><span className="text-xs font-semibold uppercase tracking-widest mt-2">No active positions</span></>
                    }
                  </div>
                </td>
              </tr>
            ) : (
              filteredTrades.map((trade) => {
                const pnl = showHistory ? (trade.realizedProfit || 0) : getUnrealizedPnL(trade);
                const pnlPositive = (pnl || 0) >= 0;

                return (
                  <motion.tr
                    key={trade.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    layout
                  >
                    <td>
                      <div className="font-mono font-bold text-sm text-slate-200">{trade.entryOpportunity.asset}</div>
                      <div className="text-[10px] text-slate-500 font-semibold tracking-tight">
                        {trade.entryOpportunity.expiry} · {trade.entryOpportunity.strike} · {trade.entryOpportunity.type}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${trade.entryOpportunity.buyExchange === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'}`}>
                          {trade.entryOpportunity.buyExchange}
                        </span>
                        <span className="text-slate-600">→</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${trade.entryOpportunity.sellExchange === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'}`}>
                          {trade.entryOpportunity.sellExchange}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        ${fmt(trade.entryBuyPrice)} → ${fmt(trade.entrySellPrice)}
                      </div>
                    </td>
                    <td className="font-mono text-sm font-semibold">{trade.quantity.toFixed(2)}</td>
                    <td>
                      <span className="badge-profit">{trade.entrySpreadPercent.toFixed(2)}%</span>
                    </td>
                    <td>
                      {pnl !== null ? (
                        <div className="flex items-center gap-1">
                          {pnlPositive
                            ? <ArrowUpRight size={14} className="text-emerald-400" />
                            : <ArrowDownRight size={14} className="text-rose-400" />}
                          <span className={`font-mono font-bold text-sm ${pnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            ${fmt(pnl)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 text-slate-400">
                        <Clock size={11} />
                        <span className="text-xs font-mono">{getDuration(trade)}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                        trade.source === 'backend'
                          ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                          : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {trade.source || 'local'}
                      </span>
                    </td>
                    <td>
                      {trade.status === TradeStatus.open ? (
                        <span className="flex items-center gap-1.5 text-cyan-400">
                          <div className="status-dot status-dot--live" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Live</span>
                        </span>
                      ) : trade.status === TradeStatus.error ? (
                        <span className="flex items-center gap-1.5 text-rose-400">
                          <AlertTriangle size={12} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Error</span>
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-emerald-400">
                          <CheckCircle2 size={12} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Closed</span>
                        </span>
                      )}
                    </td>
                    {!showHistory && (
                      <td>
                        <button
                          onClick={() => onCloseTrade(trade)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Close Position"
                        >
                          <XCircle size={16} />
                        </button>
                      </td>
                    )}
                  </motion.tr>
                );
              })
            )}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
};

export default TradesTable;
