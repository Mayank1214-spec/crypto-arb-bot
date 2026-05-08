import React from 'react';
import { Terminal, ScrollText } from 'lucide-react';
import { motion } from 'framer-motion';

interface LogsPanelProps {
  logs: string[];
}

const LogsPanel: React.FC<LogsPanelProps> = ({ logs }) => {
  return (
    <section className="glass-card flex flex-col h-full max-h-[400px]">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Terminal size={16} className="text-blue-400" />
          System Logs
        </h2>
        <ScrollText size={16} className="text-gray-500" />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-[11px] leading-relaxed">
        {logs.length === 0 ? (
          <p className="text-gray-500 italic text-center py-10">No logs available</p>
        ) : (
          logs.map((log, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              className={`p-1.5 rounded transition-colors ${
                log.includes('🚀') ? 'bg-blue-500/10 text-blue-300' : 
                log.includes('📉') ? 'bg-emerald-500/10 text-emerald-300' : 
                log.includes('🔍') ? 'text-gray-400' : 'text-gray-300'
              }`}
            >
              {log}
            </motion.div>
          ))
        )}
      </div>
    </section>
  );
};

export default LogsPanel;
