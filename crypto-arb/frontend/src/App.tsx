import React, { useState } from 'react';
import { Activity, Zap, TrendingUp, BarChart3, History, Settings as SettingsIcon, Radio, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useArbitrage } from './hooks/useArbitrage';
import StatsBar from './components/StatsBar';
import LogsPanel from './components/LogsPanel';
import TradesTable from './components/TradesTable';
import SettingsPanel from './components/SettingsPanel';
import ExecutionTracker from './components/ExecutionTracker';

type TabId = 'dashboard' | 'tracker' | 'trades' | 'executions' | 'settings';

const tabs: { id: TabId; icon: typeof Zap; label: string }[] = [
  { id: 'dashboard', icon: Zap, label: 'Opportunities' },
  { id: 'tracker', icon: Activity, label: 'Live Tracker' },
  { id: 'trades', icon: History, label: 'Paper Trading' },
  { id: 'executions', icon: Radio, label: 'Executions' },
  { id: 'settings', icon: SettingsIcon, label: 'Settings' },
];

const pageTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.2 }
};

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

  const {
    opportunities, paperTrades, tickers, logs, executionEvents,
    engineStatus, isConnected, autoExecutionEnabled, minProfitThreshold,
    balances, tradeStats,
    toggleAutoExecution, setMinProfitThreshold, executePaperTrade, closePaperTrade
  } = useArbitrage();

  return (
    <div className="min-h-screen text-white">
      {/* ── Navigation ── */}
      <nav className="sticky top-0 z-50 px-5 py-3 border-b border-white/5 bg-[#030712]/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-600 to-cyan-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Zap size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-black tracking-tight gradient-text">ARBITRAGEX</h1>
              <div className="flex items-center gap-1.5 -mt-0.5">
                <div className={`status-dot ${isConnected ? 'status-dot--live' : 'status-dot--dead'}`} />
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                  {isConnected ? 'Engine Live' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center bg-white/[0.03] p-1 rounded-xl border border-white/5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-[11px] font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                <tab.icon size={13} />
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="max-w-[1400px] mx-auto px-5 py-6 space-y-6">
        {/* Stats bar (always visible) */}
        <StatsBar balances={balances} stats={tradeStats} />

        <AnimatePresence mode="wait">

          {/* ════════════════ TAB: OPPORTUNITIES ════════════════ */}
          {activeTab === 'dashboard' && (
            <motion.div key="dashboard" {...pageTransition} className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Opportunities Table */}
                <section className="lg:col-span-2 glass-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-slate-400">
                      <BarChart3 size={14} className="text-indigo-400" />
                      Live Arbitrage Feed
                    </h2>
                    <div className="flex gap-2">
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] font-bold rounded-full border border-indigo-500/15">
                        {opportunities.length} active
                      </span>
                    </div>
                  </div>

                  <div className="overflow-x-auto" style={{ maxHeight: '500px' }}>
                    <table className="arb-table">
                      <thead>
                        <tr>
                          <th>Instrument</th>
                          <th>Buy / Sell</th>
                          <th>IV Spread</th>
                          <th>Price Spread</th>
                          <th>Size</th>
                          <th>Depth</th>
                          <th>Net Profit</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        <AnimatePresence mode="popLayout">
                          {opportunities.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="text-center py-20">
                                <div className="flex flex-col items-center gap-4 text-slate-600">
                                  <div className="spinner" />
                                  <span className="text-xs font-bold uppercase tracking-widest">Scanning markets...</span>
                                </div>
                              </td>
                            </tr>
                          ) : (
                            opportunities.map((opp) => (
                              <motion.tr
                                key={opp.symbol}
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                layout
                              >
                                <td>
                                  <div className="font-mono font-bold text-sm text-slate-200">{opp.asset}</div>
                                  <div className="text-[10px] text-slate-500 font-semibold tracking-tight">
                                    {opp.expiry} · {opp.strike} · {opp.type}
                                  </div>
                                </td>
                                <td>
                                  <div className="flex items-center gap-2">
                                    <div>
                                      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block mb-0.5 ${
                                        opp.buyExchange === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'
                                      }`}>{opp.buyExchange}</div>
                                      <div className="text-emerald-400 font-mono font-bold text-sm">${fmt(opp.buyPrice)}</div>
                                    </div>
                                    <ArrowRight size={14} className="text-slate-600" />
                                    <div>
                                      <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded inline-block mb-0.5 ${
                                        opp.sellExchange === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'
                                      }`}>{opp.sellExchange}</div>
                                      <div className="text-cyan-400 font-mono font-bold text-sm">${fmt(opp.sellPrice)}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>
                                  <span className="text-purple-400 font-mono font-bold text-xs">
                                    {opp.ivSpread > 0 ? '+' : ''}{opp.ivSpread.toFixed(2)}%
                                  </span>
                                </td>
                                <td>
                                  <span className={opp.profitPercent > 0 ? 'badge-profit' : 'badge-loss'}>
                                    {opp.profitPercent > 0 ? '+' : ''}{opp.profitPercent.toFixed(2)}%
                                  </span>
                                </td>
                                <td className="font-mono text-xs text-slate-300">{opp.tradableSize.toFixed(2)}</td>
                                <td>
                                  <span className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 text-[10px] font-mono font-bold rounded">
                                    L{opp.layersConsumed || 1}
                                  </span>
                                </td>
                                <td className="font-mono text-sm font-bold text-emerald-400">${fmt(opp.potentialProfit)}</td>
                                <td>
                                  <button
                                    onClick={() => executePaperTrade(opp, opp.tradableSize)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all hover:shadow-lg hover:shadow-indigo-500/20"
                                  >
                                    <TrendingUp size={12} />
                                    Trade
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

                {/* Sidebar: Execution Feed + Quick Settings */}
                <div className="space-y-6">
                  <section className="glass-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/5">
                      <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-slate-400">
                        <Radio size={14} className="text-cyan-400" />
                        Execution Feed
                      </h2>
                    </div>
                    <ExecutionTracker events={executionEvents} compact />
                  </section>

                  <LogsPanel logs={logs} maxHeight="280px" />
                </div>
              </div>
            </motion.div>
          )}

          {/* ════════════════ TAB: LIVE TRACKER ════════════════ */}
          {activeTab === 'tracker' && (
            <motion.div key="tracker" {...pageTransition}>
              <section className="glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
                  <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-slate-400">
                    <Activity size={14} className="text-emerald-400" />
                    Live Market Spreads — Deribit vs Bybit
                  </h2>
                  <span className="text-[10px] font-mono text-slate-600">{tickers.length} instruments</span>
                </div>

                <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
                  <table className="arb-table">
                    <thead>
                      <tr>
                        <th>Instrument</th>
                        <th>Bid (Exchange)</th>
                        <th>Ask (Exchange)</th>
                        <th>Price Spread</th>
                        <th>IV Spread</th>
                        <th>Basis Dev.</th>
                        <th>Adj. Profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-20">
                            <div className="flex flex-col items-center gap-4 text-slate-600">
                              <div className="spinner" />
                              <span className="text-xs font-bold uppercase tracking-widest">Connecting to feeds...</span>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        tickers.map((t) => {
                          const basisDev = t.indexMismatch - t.movingBasis;
                          return (
                            <tr key={t.symbol}>
                              <td>
                                <span className="font-mono font-bold text-sm text-slate-200">{t.symbol}</span>
                              </td>
                              <td>
                                <div className="font-mono text-sm text-emerald-400 font-bold">${fmt(t.bid)}</div>
                                <div className={`text-[9px] font-bold px-1 py-0.5 rounded inline-block mt-0.5 ${
                                  t.bidExchange === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'
                                }`}>{t.bidExchange}</div>
                              </td>
                              <td>
                                <div className="font-mono text-sm text-cyan-400 font-bold">${fmt(t.ask)}</div>
                                <div className={`text-[9px] font-bold px-1 py-0.5 rounded inline-block mt-0.5 ${
                                  t.askExchange === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'
                                }`}>{t.askExchange}</div>
                              </td>
                              <td>
                                <span className={t.spreadPercent > 0 ? 'badge-profit' : 'badge-loss'}>
                                  {t.spreadPercent > 0 ? '+' : ''}{t.spreadPercent.toFixed(3)}%
                                </span>
                              </td>
                              <td className="font-mono text-xs text-purple-400 font-bold">
                                {t.ivSpread > 0 ? '+' : ''}{t.ivSpread.toFixed(2)}%
                              </td>
                              <td>
                                <span className={`font-mono text-xs font-bold ${
                                  Math.abs(basisDev) > 10 ? 'text-rose-400' : 'text-amber-400'
                                }`}>
                                  {basisDev.toFixed(2)}
                                </span>
                              </td>
                              <td>
                                <span className={`font-mono text-xs font-bold ${
                                  t.adjustedProfitPercent > 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                  {t.adjustedProfitPercent.toFixed(3)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </motion.div>
          )}

          {/* ════════════════ TAB: PAPER TRADING ════════════════ */}
          {activeTab === 'trades' && (
            <motion.div key="trades" {...pageTransition} className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <section className="glass-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-cyan-400">
                      <Zap size={14} />
                      Active Positions
                    </h2>
                    <span className="text-[10px] font-mono text-slate-600">{tradeStats.openTrades} open</span>
                  </div>
                  <TradesTable trades={paperTrades} tickers={tickers} onCloseTrade={closePaperTrade} />
                </section>

                <section className="glass-card overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
                    <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-emerald-400">
                      <History size={14} />
                      Trade History
                    </h2>
                    <span className="text-[10px] font-mono text-slate-600">{tradeStats.closedTrades} closed</span>
                  </div>
                  <TradesTable trades={paperTrades} tickers={tickers} onCloseTrade={closePaperTrade} showHistory />
                </section>
              </div>
            </motion.div>
          )}

          {/* ════════════════ TAB: EXECUTIONS ════════════════ */}
          {activeTab === 'executions' && (
            <motion.div key="executions" {...pageTransition} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <section className="lg:col-span-2 glass-card overflow-hidden">
                <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
                  <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-slate-400">
                    <Radio size={14} className="text-cyan-400" />
                    Backend Execution Timeline
                  </h2>
                  <span className="text-[10px] font-mono text-slate-600">{executionEvents.length} events</span>
                </div>
                <ExecutionTracker events={executionEvents} />
              </section>

              <LogsPanel logs={logs} maxHeight="600px" />
            </motion.div>
          )}

          {/* ════════════════ TAB: SETTINGS ════════════════ */}
          {activeTab === 'settings' && (
            <motion.div key="settings" {...pageTransition} className="max-w-xl mx-auto">
              <SettingsPanel
                autoExecutionEnabled={autoExecutionEnabled}
                onToggleAutoExecution={toggleAutoExecution}
                engineStatus={engineStatus}
                minProfitThreshold={minProfitThreshold}
                onMinProfitChange={setMinProfitThreshold}
                isConnected={isConnected}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default App;
