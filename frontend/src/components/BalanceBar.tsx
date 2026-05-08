import React from 'react';
import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface BalanceBarProps {
  balances: Record<string, number>;
  totalPnL: number;
  unrealizedPnL: number;
}

const BalanceBar: React.FC<BalanceBarProps> = ({ balances, totalPnL, unrealizedPnL }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {Object.entries(balances).map(([exchange, balance]) => (
        <motion.div 
          key={exchange}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 flex items-center gap-4"
        >
          <div className={`p-2 rounded-lg ${exchange === 'Bybit' ? 'bg-amber-500/20' : 'bg-blue-500/20'}`}>
            <Wallet size={20} className={exchange === 'Bybit' ? 'text-amber-400' : 'text-blue-400'} />
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-semibold">{exchange} Balance</p>
            <p className="text-lg font-mono font-bold">
              {exchange === 'Bybit' ? `$${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${balance.toFixed(4)} BTC`}
            </p>
          </div>
        </motion.div>
      ))}

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card p-4 flex items-center gap-4 border-l-4 border-emerald-500"
      >
        <div className="p-2 rounded-lg bg-emerald-500/20">
          <TrendingUp size={20} className="text-emerald-400" />
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold">Total Realized</p>
          <p className="text-lg font-mono font-bold text-emerald-400">
            ${totalPnL.toFixed(2)}
          </p>
        </div>
      </motion.div>

      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className={`glass-card p-4 flex items-center gap-4 border-l-4 ${unrealizedPnL >= 0 ? 'border-blue-500' : 'border-red-500'}`}
      >
        <div className={`p-2 rounded-lg ${unrealizedPnL >= 0 ? 'bg-blue-500/20' : 'bg-red-500/20'}`}>
          {unrealizedPnL >= 0 ? <TrendingUp size={20} className="text-blue-400" /> : <TrendingDown size={20} className="text-red-400" />}
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase font-semibold">Unrealized PnL</p>
          <p className={`text-lg font-mono font-bold ${unrealizedPnL >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
            ${unrealizedPnL.toFixed(2)}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default BalanceBar;
