import React from 'react';
import { Settings, Zap, ShieldAlert, Cpu } from 'lucide-react';

interface SettingsPanelProps {
  autoExecutionEnabled: boolean;
  onToggleAutoExecution: () => void;
  engineStatus: any;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  autoExecutionEnabled, 
  onToggleAutoExecution,
  engineStatus
}) => {
  return (
    <div className="space-y-6">
      <section className="glass-card p-6">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Settings size={16} className="text-gray-400" />
          Execution Control
        </h2>
        
        <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${autoExecutionEnabled ? 'bg-emerald-500/20' : 'bg-gray-500/20'}`}>
              <Zap size={20} className={autoExecutionEnabled ? 'text-emerald-400' : 'text-gray-400'} />
            </div>
            <div>
              <p className="text-sm font-bold">Auto-Execution</p>
              <p className="text-xs text-gray-400">Execute trades automatically based on threshold</p>
            </div>
          </div>
          <button 
            onClick={onToggleAutoExecution}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoExecutionEnabled ? 'bg-emerald-600' : 'bg-white/10'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoExecutionEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">Min Profit Threshold</span>
            <span className="text-emerald-400 font-mono">0.10%</span>
          </div>
          <input type="range" className="w-full accent-emerald-500" readOnly value={10} />
          
          <div className="flex items-center gap-2 p-2 bg-blue-500/10 rounded-lg text-[10px] text-blue-300 border border-blue-500/20">
            <ShieldAlert size={12} />
            Auto-close active when target profit reached
          </div>
        </div>
      </section>

      <section className="glass-card p-6">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-4">
          <Cpu size={16} className="text-gray-400" />
          Backend Health
        </h2>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase">Prices Scan</p>
              <p className="text-lg font-mono font-bold text-blue-400">{engineStatus?.priceCount || 0}</p>
            </div>
            <div className="p-3 bg-white/5 rounded-lg border border-white/10">
              <p className="text-[10px] text-gray-400 uppercase">Pairs Matched</p>
              <p className="text-lg font-mono font-bold text-purple-400">{engineStatus?.matchedPairs || 0}</p>
            </div>
          </div>
          
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-400">Connected Exchanges</span>
            <div className="flex gap-2">
              {engineStatus?.exchanges?.map((ex: string) => (
                <span key={ex} className="px-1.5 py-0.5 bg-white/5 rounded border border-white/10">{ex}</span>
              )) || <span className="text-gray-500">None</span>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default SettingsPanel;
