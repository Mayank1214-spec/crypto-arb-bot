import React from 'react';
import { Settings, Zap, ShieldAlert, Cpu, Wifi, WifiOff, Database } from 'lucide-react';
import type { EngineStatus } from '../types';

interface SettingsPanelProps {
  autoExecutionEnabled: boolean;
  onToggleAutoExecution: () => void;
  engineStatus: EngineStatus | null;
  minProfitThreshold: number;
  onMinProfitChange: (value: number) => void;
  isConnected: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  autoExecutionEnabled,
  onToggleAutoExecution,
  engineStatus,
  minProfitThreshold,
  onMinProfitChange,
  isConnected
}) => {
  const sliderValue = Math.round(minProfitThreshold * 100);

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <section className="glass-card p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isConnected ? <Wifi size={18} className="text-emerald-400" /> : <WifiOff size={18} className="text-rose-400" />}
            <div>
              <p className="text-sm font-bold">{isConnected ? 'Engine Connected' : 'Engine Offline'}</p>
              <p className="text-[10px] text-slate-500 font-medium">
                {isConnected ? 'Real-time data streaming active' : 'Attempting to reconnect...'}
              </p>
            </div>
          </div>
          <div className={`status-dot ${isConnected ? 'status-dot--live' : 'status-dot--dead'}`} />
        </div>
      </section>

      {/* Execution Control */}
      <section className="glass-card p-5">
        <h2 className="text-xs font-bold flex items-center gap-2 mb-5 uppercase tracking-widest text-slate-400">
          <Settings size={14} />
          Execution Control
        </h2>

        <div className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl border border-white/5">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${autoExecutionEnabled ? 'bg-emerald-500/15' : 'bg-slate-500/10'}`}>
              <Zap size={18} className={autoExecutionEnabled ? 'text-emerald-400' : 'text-slate-500'} />
            </div>
            <div>
              <p className="text-sm font-bold">Auto-Execution</p>
              <p className="text-[10px] text-slate-500">Auto-close when target profit is hit</p>
            </div>
          </div>
          <button onClick={onToggleAutoExecution}
            className={`toggle-track ${autoExecutionEnabled ? 'toggle-track--on' : 'toggle-track--off'}`}>
            <span className={`toggle-thumb ${autoExecutionEnabled ? 'toggle-thumb--on' : 'toggle-thumb--off'}`} />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-slate-500 font-medium">Min Profit Threshold</span>
            <span className="text-emerald-400 font-mono font-bold">{minProfitThreshold.toFixed(2)}%</span>
          </div>
          <input
            type="range"
            min={1} max={100}
            value={sliderValue}
            onChange={(e) => onMinProfitChange(parseInt(e.target.value) / 100)}
          />

          <div className="flex items-center gap-2 p-2.5 bg-indigo-500/8 rounded-lg text-[10px] text-indigo-300 border border-indigo-500/15">
            <ShieldAlert size={12} className="flex-shrink-0" />
            Trades auto-close at 80% of target profit
          </div>
        </div>
      </section>

      {/* Backend Health */}
      <section className="glass-card p-5">
        <h2 className="text-xs font-bold flex items-center gap-2 mb-5 uppercase tracking-widest text-slate-400">
          <Cpu size={14} />
          Backend Health
        </h2>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Deribit</p>
            <p className="text-xl font-mono font-bold text-blue-400">{engineStatus?.deribitCount || 0}</p>
            <p className="text-[9px] text-slate-600">instruments</p>
          </div>
          <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5">
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Bybit</p>
            <p className="text-xl font-mono font-bold text-amber-400">{engineStatus?.bybitCount || 0}</p>
            <p className="text-[9px] text-slate-600">instruments</p>
          </div>
        </div>

        <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Database size={12} className="text-purple-400" />
            <p className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Matched Pairs</p>
          </div>
          <p className="text-2xl font-mono font-bold text-purple-400">{engineStatus?.matchedPairs || 0}</p>
        </div>

        <div className="flex items-center justify-between text-[10px] px-1">
          <span className="text-slate-500 font-medium">Connected Exchanges</span>
          <div className="flex gap-2">
            {engineStatus?.exchanges?.map((ex: string) => (
              <span key={ex} className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                ex === 'Deribit' ? 'exchange-deribit' : 'exchange-bybit'
              }`}>{ex}</span>
            )) || <span className="text-slate-600">None</span>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsPanel;
