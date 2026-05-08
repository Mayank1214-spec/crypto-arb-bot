import React, { useState, useMemo } from 'react';
import { Activity, Zap, TrendingUp, BarChart3, LayoutDashboard, History, ListTodo, Settings as SettingsIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useArbitrage } from './hooks/useArbitrage';
import BalanceBar from './components/BalanceBar';
import LogsPanel from './components/LogsPanel';
import TradesTable from './components/TradesTable';
import SettingsPanel from './components/SettingsPanel';
import { TradeStatus } from './types';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trades' | 'logs' | 'settings'>('dashboard');
  
  const {
    opportunities,
    paperTrades,
    tickers,
    logs,
    engineStatus,
    isConnected,
    autoExecutionEnabled,
    balances,
    toggleAutoExecution,
    executePaperTrade,
    closePaperTrade
  } = useArbitrage();

  const totalRealizedProfit = useMemo(() => 
    paperTrades
      .filter(t => t.status === TradeStatus.closed)
      .reduce((sum, t) => sum + (t.realizedProfit || 0), 0)
  , [paperTrades]);

  const unrealizedProfit = useMemo(() => {
    let total = 0;
    paperTrades.forEach(trade => {
      if (trade.status === TradeStatus.open) {
        const ticker = tickers.find(t => t.symbol === trade.entryOpportunity.symbol);
        if (ticker) {
          total += (ticker.bid - trade.entryBuyPrice) * trade.quantity + 
                   (trade.entrySellPrice - ticker.ask) * trade.quantity - 
                   trade.entryFees;
        }
      }
    });
    return total;
  }, [paperTrades, tickers]);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Navigation */}
      <nav className="p-4 border-b border-white/5 flex justify-between items-center bg-black/40 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl shadow-lg shadow-blue-500/20">
            <Zap size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tighter gradient-text">ARBITRAGEX</h1>
            <div className="flex items-center gap-1.5 -mt-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                {isConnected ? 'Network Live' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center bg-white/5 p-1 rounded-xl border border-white/10">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'trades', icon: History, label: 'Trades' },
            { id: 'logs', icon: ListTodo, label: 'Logs' },
            { id: 'settings', icon: SettingsIcon, label: 'Settings' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={14} />
              <span className="hidden md:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-6 space-y-8">
        <BalanceBar 
          balances={balances} 
          totalPnL={totalRealizedProfit} 
          unrealizedPnL={unrealizedProfit} 
        />

        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              {/* Opportunities Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <section className="lg:col-span-2 glass-card overflow-hidden">
                  <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest">
                      <BarChart3 size={18} className="text-blue-400" />
                      Live Arbitrage Feed
                    </h2>
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-bold rounded border border-blue-500/20">BTC-OPTIONS</span>
                    </div>
                  </div>
                  
                  <div className="p-0 overflow-x-auto">
                    <table className="arbitrage-table">
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Buy/Sell</th>
                          <th>Spread</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence mode="popLayout">
                          {opportunities.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="text-center py-20 text-gray-500">
                                <div className="flex flex-col items-center gap-4">
                                  <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                                  <span className="text-xs font-bold uppercase tracking-widest">Scanning market for edges...</span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            opportunities.map((opp) => (
                              <motion.tr 
                                key={opp.symbol}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                layout
                              >
                                <td>
                                  <div className="font-mono font-bold text-sm">{opp.asset}</div>
                                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                                    {opp.expiry} • {opp.strike} • {opp.type}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex items-center gap-3">
                                    <div>
                                      <div className="text-[9px] text-gray-500 uppercase font-black">{opp.buyExchange}</div>
                                      <div className="text-emerald-400 font-mono font-bold">${opp.buyPrice.toFixed(2)}</div>
                                    </div>
                                    <div className="w-px h-6 bg-white/10" />
                                    <div>
                                      <div className="text-[9px] text-gray-500 uppercase font-black">{opp.sellExchange}</div>
                                      <div className="text-blue-400 font-mono font-bold">${opp.sellPrice.toFixed(2)}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="profit-badge text-xs px-3 py-1 bg-emerald-500 text-white font-black rounded-lg">
                                    +{opp.profitPercent.toFixed(2)}%
                                  </span>
                                </td>
                                <td>
                                  <button 
                                    onClick={() => executePaperTrade(opp, opp.tradableSize)}
                                    className="p-2 bg-white/5 hover:bg-blue-600 hover:text-white rounded-lg transition-all border border-white/10 group"
                                  >
                                    <TrendingUp size={16} className="text-blue-400 group-hover:text-white" />
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

                <div className="space-y-8">
                   <LogsPanel logs={logs} />
                   <SettingsPanel 
                    autoExecutionEnabled={autoExecutionEnabled}
                    onToggleAutoExecution={toggleAutoExecution}
                    engineStatus={engineStatus}
                  />
                </div>
              </div>

              {/* Ticker Feed */}
              <section className="glass-card overflow-hidden">
                <div className="p-4 border-b border-white/5 bg-white/5">
                  <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-gray-400">
                    <Activity size={16} className="text-emerald-400" />
                    Market Pulse
                  </h2>
                </div>
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {tickers.slice(0, 10).map((t) => (
                    <div key={t.symbol} className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <div className="text-[9px] font-black text-gray-500 truncate mb-1">{t.symbol}</div>
                      <div className="flex justify-between items-end">
                        <span className={`text-sm font-mono font-black ${t.spreadPercent > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.spreadPercent.toFixed(3)}%
                        </span>
                        <div className="flex flex-col items-end">
                          <span className="text-[8px] text-gray-600 font-bold uppercase">{t.bidExchange}/{t.askExchange}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'trades' && (
            <motion.div 
              key="trades"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <section className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-white/5 bg-blue-500/5">
                    <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-blue-400">
                      <Zap size={18} />
                      Active Positions
                    </h2>
                  </div>
                  <TradesTable trades={paperTrades} onCloseTrade={closePaperTrade} />
                </section>

                <section className="glass-card overflow-hidden">
                  <div className="p-6 border-b border-white/5 bg-emerald-500/5">
                    <h2 className="text-sm font-bold flex items-center gap-2 uppercase tracking-widest text-emerald-400">
                      <History size={18} />
                      Trade History
                    </h2>
                  </div>
                  <TradesTable trades={paperTrades} onCloseTrade={closePaperTrade} showHistory />
                </section>
              </div>
            </motion.div>
          )}

          {activeTab === 'logs' && (
            <motion.div 
              key="logs"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
            >
              <LogsPanel logs={logs} />
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl mx-auto"
            >
              <SettingsPanel 
                autoExecutionEnabled={autoExecutionEnabled}
                onToggleAutoExecution={toggleAutoExecution}
                engineStatus={engineStatus}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
