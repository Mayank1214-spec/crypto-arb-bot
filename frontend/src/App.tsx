import React, { useState, useEffect, useRef } from 'react';
import { Activity, Zap, TrendingUp, Shield, BarChart3, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OptionContract {
  asset: string;
  expiry: string;
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
}

const App: React.FC = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [stats, setStats] = useState({ totalProfit: 0, scanCount: 0 });
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Connect to the Cloudflare Worker WebSocket
    // In production, this would be the actual worker URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`; 
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => setIsConnected(true);
    ws.current.onclose = () => setIsConnected(false);
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'OPPORTUNITY') {
        const newOpp = message.data;
        setOpportunities(prev => {
          const contractKey = `${newOpp.contract.asset}_${newOpp.contract.expiry}_${newOpp.contract.strike}`;
          const filtered = prev.filter(o => `${o.contract.asset}_${o.contract.expiry}_${o.contract.strike}` !== contractKey);
          return [newOpp, ...filtered].slice(0, 10);
        });
        setStats(prev => ({ 
          totalProfit: prev.totalProfit + newOpp.profitPercent, 
          scanCount: prev.scanCount + 1 
        }));
      }
    };

    return () => ws.current?.close();
  }, []);

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-xl font-bold gradient-text">ArbitrageX</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className={`live-indicator ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-sm font-medium text-gray-400">
              {isConnected ? 'Network Live' : 'Disconnected'}
            </span>
          </div>
          <button className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-medium transition-all">
            Settings
          </button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card stat-card"
          >
            <div className="flex justify-between items-start">
              <span className="stat-label">Total Opportunities</span>
              <Activity className="text-blue-400" size={20} />
            </div>
            <div className="stat-value">{stats.scanCount}</div>
            <p className="text-xs text-gray-400 mt-2">+12% from last hour</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card stat-card"
          >
            <div className="flex justify-between items-start">
              <span className="stat-label">Avg Profit</span>
              <TrendingUp className="text-emerald-400" size={20} />
            </div>
            <div className="stat-value">{(stats.totalProfit / (stats.scanCount || 1)).toFixed(2)}%</div>
            <p className="text-xs text-gray-400 mt-2">Max: 1.42%</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card stat-card"
          >
            <div className="flex justify-between items-start">
              <span className="stat-label">Latency</span>
              <Clock className="text-amber-400" size={20} />
            </div>
            <div className="stat-value">Node.js</div>
            <p className="text-xs text-gray-400 mt-2">Oracle Cloud (Standalone)</p>
          </motion.div>
        </div>

        {/* Opportunities Table */}
        <section className="glass-card overflow-hidden">
          <div className="p-6 border-b border-white/10 flex justify-between items-center">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-400" />
              Live Arbitrage Feed
            </h2>
            <div className="flex gap-2">
              <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs rounded-full border border-blue-500/20">BTC</span>
              <span className="px-3 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20">ETH</span>
            </div>
          </div>
          
          <div className="p-6 overflow-x-auto">
            <table className="arbitrage-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Expiry</th>
                  <th>Strike</th>
                  <th>Type</th>
                  <th>Buy From</th>
                  <th>Sell To</th>
                  <th>Profit</th>
                  <th>Underlying</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout">
                  {opportunities.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-gray-500">
                        Waiting for opportunities...
                      </td>
                    </tr>
                  ) : (
                    opportunities.map((opp, idx) => (
                      <motion.tr 
                        key={idx}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        layout
                      >
                        <td className="font-mono font-medium">{opp.contract.asset}</td>
                        <td className="text-gray-400">{opp.contract.expiry}</td>
                        <td className="font-mono">${opp.contract.strike}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${opp.contract.type === 'CALL' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {opp.contract.type}
                          </span>
                        </td>
                        <td>
                          <div className="text-gray-300">{opp.buyExchange}</div>
                          <div className="text-emerald-400 font-mono text-xs">${opp.buyPrice.toFixed(2)}</div>
                        </td>
                        <td>
                          <div className="text-gray-300">{opp.sellExchange}</div>
                          <div className="text-blue-400 font-mono text-xs">${opp.sellPrice.toFixed(2)}</div>
                        </td>
                        <td>
                          <span className="profit-badge">
                            +{opp.profitPercent.toFixed(2)}%
                          </span>
                        </td>
                        <td className="text-[10px] text-gray-500">
                          B: {opp.buyUnderlying.toFixed(1)}<br/>
                          S: {opp.sellUnderlying.toFixed(1)}
                        </td>
                        <td>
                          <button className="p-2 hover:bg-white/10 rounded-lg transition-colors text-blue-400">
                            <Shield size={18} />
                          </button>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
