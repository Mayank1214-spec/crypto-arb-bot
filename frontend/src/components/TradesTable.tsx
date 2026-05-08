import React from 'react';
import { TradeStatus } from '../types';
import type { PaperTrade } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle, CheckCircle2, Timer } from 'lucide-react';

interface TradesTableProps {
  trades: PaperTrade[];
  onCloseTrade: (trade: PaperTrade) => void;
  showHistory?: boolean;
}

const TradesTable: React.FC<TradesTableProps> = ({ trades, onCloseTrade, showHistory = false }) => {
  const filteredTrades = trades.filter(t => 
    showHistory ? t.status === TradeStatus.closed : t.status === TradeStatus.open
  );

  return (
    <div className="overflow-x-auto">
      <table className="arbitrage-table">
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Qty</th>
            <th>{showHistory ? 'Exit Time' : 'Entry Time'}</th>
            <th>{showHistory ? 'Net Profit' : 'Entry Spread'}</th>
            <th>Buy P / Sell P</th>
            <th>Status</th>
            {!showHistory && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {filteredTrades.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  {showHistory ? 'No trade history yet' : 'No active trades'}
                </td>
              </tr>
            ) : (
              filteredTrades.map((trade) => (
                <motion.tr 
                  key={trade.id}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, x: 20 }}
                  layout
                >
                  <td className="font-mono text-xs font-bold">{trade.entryOpportunity.symbol}</td>
                  <td className="font-mono text-xs">{trade.quantity.toFixed(1)}</td>
                  <td className="text-[10px] text-gray-400">
                    <div className="flex items-center gap-1">
                      <Timer size={10} />
                      {new Date(showHistory ? (trade.exitTime || 0) : trade.entryTime).toLocaleTimeString()}
                    </div>
                  </td>
                  <td>
                    {showHistory ? (
                      <span className={`font-bold font-mono ${trade.realizedProfit && trade.realizedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${trade.realizedProfit?.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-blue-400 font-mono font-medium">
                        {trade.entrySpreadPercent.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="text-[10px] text-gray-400">
                      B: ${trade.entryBuyPrice.toFixed(2)}<br/>
                      S: ${trade.entrySellPrice.toFixed(2)}
                    </div>
                  </td>
                  <td>
                    <div className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider">
                      {trade.status === TradeStatus.open ? (
                        <span className="text-blue-400 flex items-center gap-1">
                           <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          Open
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          Closed
                        </span>
                      )}
                    </div>
                  </td>
                  {!showHistory && (
                    <td>
                      <button 
                        onClick={() => onCloseTrade(trade)}
                        className="p-1.5 hover:bg-red-500/10 text-red-400 rounded-md transition-colors"
                        title="Close Position"
                      >
                        <XCircle size={16} />
                      </button>
                    </td>
                  )}
                </motion.tr>
              ))
            )}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
};

export default TradesTable;
