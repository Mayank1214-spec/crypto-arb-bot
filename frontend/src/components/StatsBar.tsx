import React from 'react';
import { Wallet, TrendingUp, TrendingDown, Target, Trophy, Activity } from 'lucide-react';
import { motion } from 'framer-motion';
import type { TradeStats } from '../types';

interface StatsBarProps {
  balances: Record<string, number>;
  stats: TradeStats;
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const StatsBar: React.FC<StatsBarProps> = ({ balances, stats }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* Deribit Balance */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}
        className="glass-card stat-glow-blue p-4">
        <div className="flex items-center gap-2 mb-2">
          <Wallet size={14} className="text-indigo-400" />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Deribit</span>
        </div>
        <p className="text-lg font-mono font-bold text-slate-100">{(balances['Deribit'] || 0).toFixed(4)}</p>
        <p className="text-[10px] text-slate-500 font-medium">BTC</p>
      </motion.div>

      {/* Bybit Balance */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="glass-card stat-glow-amber p-4">
        <div className="flex items-center gap-2 mb-2">
          <Wallet size={14} className="text-amber-400" />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Bybit</span>
        </div>
        <p className="text-lg font-mono font-bold text-slate-100">${fmt(balances['Bybit'] || 0)}</p>
        <p className="text-[10px] text-slate-500 font-medium">USDT</p>
      </motion.div>

      {/* Realized PnL */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className={`glass-card p-4 ${stats.totalRealizedProfit >= 0 ? 'stat-glow-emerald' : 'stat-glow-rose'}`}>
        <div className="flex items-center gap-2 mb-2">
          {stats.totalRealizedProfit >= 0
            ? <TrendingUp size={14} className="text-emerald-400" />
            : <TrendingDown size={14} className="text-rose-400" />}
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Realized</span>
        </div>
        <p className={`text-lg font-mono font-bold ${stats.totalRealizedProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          ${fmt(stats.totalRealizedProfit)}
        </p>
        <p className="text-[10px] text-slate-500 font-medium">{stats.closedTrades} trades closed</p>
      </motion.div>

      {/* Unrealized PnL */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className={`glass-card p-4 ${stats.totalUnrealizedProfit >= 0 ? 'stat-glow-cyan' : 'stat-glow-rose'}`}>
        <div className="flex items-center gap-2 mb-2">
          <Activity size={14} className={stats.totalUnrealizedProfit >= 0 ? 'text-cyan-400' : 'text-rose-400'} />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Floating</span>
        </div>
        <p className={`text-lg font-mono font-bold ${stats.totalUnrealizedProfit >= 0 ? 'text-cyan-400' : 'text-rose-400'}`}>
          ${fmt(stats.totalUnrealizedProfit)}
        </p>
        <p className="text-[10px] text-slate-500 font-medium">{stats.openTrades} positions open</p>
      </motion.div>

      {/* Win Rate */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
        className="glass-card stat-glow-purple p-4">
        <div className="flex items-center gap-2 mb-2">
          <Trophy size={14} className="text-purple-400" />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Win Rate</span>
        </div>
        <p className="text-lg font-mono font-bold text-purple-400">{stats.winRate.toFixed(1)}%</p>
        <p className="text-[10px] text-slate-500 font-medium">{stats.winCount}W / {stats.lossCount}L</p>
      </motion.div>

      {/* Avg Profit */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="glass-card stat-glow-emerald p-4">
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} className="text-emerald-400" />
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Avg P/T</span>
        </div>
        <p className="text-lg font-mono font-bold text-emerald-400">${fmt(stats.avgProfitPerTrade)}</p>
        <p className="text-[10px] text-slate-500 font-medium">per closed trade</p>
      </motion.div>
    </div>
  );
};

export default StatsBar;
