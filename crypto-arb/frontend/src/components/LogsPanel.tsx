import React from 'react';
import { Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LogsPanelProps {
  logs: string[];
  maxHeight?: string;
}

const LogsPanel: React.FC<LogsPanelProps> = ({ logs, maxHeight = '400px' }) => {
  return (
    <section className="glass-card flex flex-col" style={{ maxHeight }}>
      <div className="p-4 border-b border-white/5 flex justify-between items-center">
        <h2 className="text-xs font-bold flex items-center gap-2 uppercase tracking-widest text-slate-400">
          <Terminal size={14} className="text-emerald-400" />
          System Logs
        </h2>
        <span className="text-[10px] font-mono text-slate-600">{logs.length} entries</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-0.5 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-slate-600 italic text-center py-10 text-xs">Waiting for activity...</p>
        ) : (
          <AnimatePresence mode="popLayout">
            {logs.map((log, index) => (
              <motion.div
                key={`${logs.length - index}`}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                className={`px-2 py-1 rounded transition-colors ${
                  log.includes('🚀') ? 'text-indigo-300' :
                  log.includes('📉') ? 'text-emerald-300' :
                  log.includes('❌') ? 'text-rose-300' :
                  log.includes('✅') ? 'text-emerald-400' :
                  log.includes('📡') ? 'text-cyan-300' :
                  log.includes('🔍') ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {log}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
};

export default LogsPanel;
