import React from 'react';
import type { ExecutionEvent } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, Radio, AlertTriangle, ArrowRight } from 'lucide-react';

interface ExecutionTrackerProps {
  events: ExecutionEvent[];
  compact?: boolean;
}

const eventConfig: Record<string, { icon: typeof Zap; color: string; bg: string }> = {
  ENTRY: { icon: TrendingUp, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  EXIT: { icon: TrendingDown, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  OPPORTUNITY: { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  STATUS: { icon: Radio, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
  ERROR: { icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
};

const ExecutionTracker: React.FC<ExecutionTrackerProps> = ({ events, compact = false }) => {
  const displayEvents = compact ? events.filter(e => e.type === 'ENTRY' || e.type === 'EXIT' || e.type === 'ERROR').slice(0, 8) : events.slice(0, 100);

  return (
    <div className={`space-y-1 ${compact ? 'max-h-[300px]' : 'max-h-[600px]'} overflow-y-auto p-4`}>
      <AnimatePresence mode="popLayout">
        {displayEvents.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-600">
            <Radio size={24} />
            <span className="text-xs font-semibold uppercase tracking-widest">Awaiting executions...</span>
          </div>
        ) : (
          displayEvents.map((event) => {
            const config = eventConfig[event.type] || eventConfig.STATUS;
            const Icon = config.icon;
            const time = new Date(event.timestamp).toLocaleTimeString();

            return (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`flex items-start gap-3 p-2.5 rounded-lg ${config.bg} border border-transparent hover:border-white/5 transition-colors`}
              >
                <div className={`mt-0.5 ${config.color}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${config.color}`}>{event.type}</span>
                    <span className="text-[9px] text-slate-600 font-mono">{time}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium truncate mt-0.5">{event.message}</p>
                </div>
                <ArrowRight size={12} className="text-slate-700 mt-1 flex-shrink-0" />
              </motion.div>
            );
          })
        )}
      </AnimatePresence>
    </div>
  );
};

export default ExecutionTracker;
