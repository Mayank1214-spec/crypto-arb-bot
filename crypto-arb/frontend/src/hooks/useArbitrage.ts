import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { TradeStatus } from '../types';
import type { Opportunity, PaperTrade, Ticker, EngineStatus, ExecutionEvent, TradeStats } from '../types';

const BACKEND_URL = 'wss://mayank931154680-crypto-arb-bot.hf.space';
const TAKER_FEE_RATE = 0.0003; // 0.03%

/** Shared PnL calculation for both unrealized display and realized close */
function calculateSpreadPnL(
  entryBuyPrice: number,
  entrySellPrice: number,
  exitBuyPrice: number,
  exitSellPrice: number,
  quantity: number,
  entryFees: number,
  exitFees: number
): number {
  const entrySpread = (entrySellPrice - entryBuyPrice) * quantity;
  const exitSpread = (exitBuyPrice - exitSellPrice) * quantity;
  return entrySpread - exitSpread - entryFees - exitFees;
}

export const useArbitrage = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(true);
  const [minProfitThreshold, setMinProfitThreshold] = useState(0.1);
  const [balances, setBalances] = useState<Record<string, number>>({
    'Deribit': 100.0,
    'Bybit': 1000000.0,
  });

  const ws = useRef<WebSocket | null>(null);
  const tickersRef = useRef<Ticker[]>([]);
  const autoExecutionRef = useRef(autoExecutionEnabled);
  const eventIdRef = useRef(0);

  useEffect(() => { tickersRef.current = tickers; }, [tickers]);
  useEffect(() => { autoExecutionRef.current = autoExecutionEnabled; }, [autoExecutionEnabled]);

  const addLogEntry = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 200));
  }, []);

  const addExecutionEvent = useCallback((type: ExecutionEvent['type'], message: string, data?: any) => {
    const event: ExecutionEvent = {
      id: ++eventIdRef.current,
      timestamp: Date.now(),
      type,
      message,
      data
    };
    setExecutionEvents(prev => [event, ...prev].slice(0, 500));
  }, []);

  // ─── Compute trade statistics ───
  const tradeStats = useMemo((): TradeStats => {
    const closedTrades = paperTrades.filter(t => t.status === TradeStatus.closed);
    const openTrades = paperTrades.filter(t => t.status === TradeStatus.open);

    const wins = closedTrades.filter(t => (t.realizedProfit || 0) > 0);
    const losses = closedTrades.filter(t => (t.realizedProfit || 0) <= 0);
    const totalRealized = closedTrades.reduce((sum, t) => sum + (t.realizedProfit || 0), 0);
    const profits = closedTrades.map(t => t.realizedProfit || 0);

    // Unrealized PnL
    let totalUnrealized = 0;
    openTrades.forEach(trade => {
      const ticker = tickersRef.current.find(t => t.symbol === trade.entryOpportunity.symbol);
      if (ticker) {
        const entrySpread = (trade.entrySellPrice - trade.entryBuyPrice) * trade.quantity;
        const exitSpread = (ticker.ask - ticker.bid) * trade.quantity;
        totalUnrealized += entrySpread - exitSpread - trade.entryFees;
      }
    });

    return {
      totalTrades: paperTrades.length,
      openTrades: openTrades.length,
      closedTrades: closedTrades.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0,
      totalRealizedProfit: totalRealized,
      totalUnrealizedProfit: totalUnrealized,
      avgProfitPerTrade: closedTrades.length > 0 ? totalRealized / closedTrades.length : 0,
      bestTrade: profits.length > 0 ? Math.max(...profits) : 0,
      worstTrade: profits.length > 0 ? Math.min(...profits) : 0,
    };
  }, [paperTrades, tickers]);

  // ─── Message Handlers ───

  const handleNewOpportunity = useCallback((opp: any) => {
    const opportunity: Opportunity = {
      ...opp,
      asset: opp.contract?.asset || '',
      expiry: opp.contract?.expiry || '',
      strike: opp.contract?.strike || 0,
      type: opp.contract?.type || '',
      symbol: `${opp.contract?.asset}-${opp.contract?.expiry}-${opp.contract?.strike}-${opp.contract?.type}`,
      timestamp: Date.now()
    };

    setOpportunities(prev => {
      const index = prev.findIndex(o => o.symbol === opportunity.symbol);
      let newOpps;
      if (index !== -1) {
        newOpps = [...prev];
        newOpps[index] = opportunity;
      } else {
        newOpps = [opportunity, ...prev];
      }
      return newOpps.slice(0, 50);
    });

    addExecutionEvent('OPPORTUNITY', `${opportunity.symbol} → ${opportunity.profitPercent.toFixed(2)}% spread`, opportunity);
    addLogEntry(`🔍 Opportunity: ${opportunity.symbol} (${opportunity.profitPercent.toFixed(2)}%)`);
  }, [addLogEntry, addExecutionEvent]);

  const handleTicker = useCallback((tickerData: any) => {
    const contract = tickerData.contract;
    const symbol = contract
      ? `${contract.asset}-${contract.expiry}-${contract.strike}-${contract.type}`
      : 'Unknown';

    const ticker: Ticker = {
      symbol,
      bid: tickerData.bid || 0,
      bidExchange: tickerData.bidExchange || '',
      ask: tickerData.ask || 0,
      askExchange: tickerData.askExchange || '',
      spreadPercent: tickerData.spreadPercent || 0,
      ivSpread: tickerData.ivSpread || 0,
      indexMismatch: tickerData.indexMismatch || 0,
      movingBasis: tickerData.movingBasis || 0,
      adjustedProfitPercent: tickerData.adjustedProfitPercent || 0,
    };

    setTickers(prev => {
      const index = prev.findIndex(t => t.symbol === ticker.symbol);
      let newTickers;
      if (index !== -1) {
        newTickers = [...prev];
        newTickers[index] = ticker;
      } else {
        newTickers = [ticker, ...prev];
      }
      return newTickers.slice(0, 50);
    });
  }, []);

  const handleBackendTrade = useCallback((data: any) => {
    const tradeId = data.id;
    const oppJson = data.opportunity;
    const status = data.status;

    setPaperTrades(prev => {
      const existingIndex = prev.findIndex(t => t.id === tradeId);
      if (existingIndex !== -1) {
        const newTrades = [...prev];
        const trade = { ...newTrades[existingIndex] };
        trade.status = status === 'OPEN' ? TradeStatus.open : status === 'ERROR' ? TradeStatus.error : TradeStatus.closed;
        if (status === 'CLOSED') {
          trade.realizedProfit = data.profitActual || 0;
          trade.exitTime = Date.now();
          addLogEntry(`📉 [BACKEND] Closed: ${trade.entryOpportunity.symbol} | Profit: $${trade.realizedProfit?.toFixed(2)}`);
          addExecutionEvent('EXIT', `Closed ${trade.entryOpportunity.symbol} → $${trade.realizedProfit?.toFixed(2)}`, trade);
        }
        if (status === 'ERROR') {
          addLogEntry(`❌ [BACKEND] Error on: ${trade.entryOpportunity.symbol}`);
          addExecutionEvent('ERROR', `Trade error: ${trade.entryOpportunity.symbol}`, trade);
        }
        newTrades[existingIndex] = trade;
        return newTrades;
      } else {
        const opportunity: Opportunity = {
          ...oppJson,
          asset: oppJson.contract?.asset || '',
          expiry: oppJson.contract?.expiry || '',
          strike: oppJson.contract?.strike || 0,
          type: oppJson.contract?.type || '',
          symbol: `${oppJson.contract?.asset}-${oppJson.contract?.expiry}-${oppJson.contract?.strike}-${oppJson.contract?.type}`,
          timestamp: Date.now()
        };

        const newTrade: PaperTrade = {
          id: tradeId,
          entryOpportunity: opportunity,
          quantity: opportunity.tradableSize,
          entryTime: data.timestamp,
          entryProfitPercent: opportunity.profitPercent,
          targetProfit: opportunity.potentialProfit,
          entrySpreadPercent: opportunity.profitPercent,
          entryBuyPrice: opportunity.buyPrice,
          entrySellPrice: opportunity.sellPrice,
          entryFees: 0,
          status: status === 'OPEN' ? TradeStatus.open : TradeStatus.closed,
          scaleCount: 0,
          source: 'backend'
        };
        addLogEntry(`🚀 [BACKEND] Executed: ${newTrade.entryOpportunity.symbol} @ ${newTrade.entryProfitPercent.toFixed(2)}%`);
        addExecutionEvent('ENTRY', `Opened ${newTrade.entryOpportunity.symbol} @ ${newTrade.entryProfitPercent.toFixed(2)}%`, newTrade);
        return [newTrade, ...prev];
      }
    });
  }, [addLogEntry, addExecutionEvent]);

  const executePaperTrade = useCallback((opportunity: Opportunity, quantity: number) => {
    const buyCost = opportunity.buyPrice * quantity;
    const sellValue = opportunity.sellPrice * quantity;
    const entryFees = (buyCost + sellValue) * TAKER_FEE_RATE;
    const expectedExitFees = entryFees;
    const targetProfit = (sellValue - buyCost) - entryFees - expectedExitFees;

    setBalances(prev => {
      const newBalances = { ...prev };
      if (opportunity.buyExchange === 'Bybit') {
        newBalances['Bybit'] = (prev['Bybit'] || 0) - buyCost - (buyCost * TAKER_FEE_RATE);
        newBalances['Deribit'] = (prev['Deribit'] || 0) + (opportunity.sellPrice / opportunity.sellUnderlying * quantity);
      } else {
        newBalances['Bybit'] = (prev['Bybit'] || 0) + sellValue - (sellValue * TAKER_FEE_RATE);
        newBalances['Deribit'] = (prev['Deribit'] || 0) - (opportunity.buyPrice / opportunity.buyUnderlying * quantity);
      }
      return newBalances;
    });

    const trade: PaperTrade = {
      id: Date.now().toString(),
      entryOpportunity: opportunity,
      quantity,
      entryTime: Date.now(),
      entryProfitPercent: opportunity.profitPercent,
      targetProfit,
      entrySpreadPercent: opportunity.profitPercent,
      entryBuyPrice: opportunity.buyPrice,
      entrySellPrice: opportunity.sellPrice,
      entryFees,
      status: TradeStatus.open,
      scaleCount: 0,
      source: 'local'
    };

    setPaperTrades(prev => [trade, ...prev]);
    addLogEntry(`🚀 [LOCAL] Executed: ${opportunity.symbol} @ ${opportunity.profitPercent.toFixed(2)}%`);
    addExecutionEvent('ENTRY', `[LOCAL] Opened ${opportunity.symbol} @ ${opportunity.profitPercent.toFixed(2)}%`, trade);
  }, [addLogEntry, addExecutionEvent]);

  const closePaperTrade = useCallback((trade: PaperTrade) => {
    if (trade.status === TradeStatus.closed) return;

    const ticker = tickersRef.current.find(t => t.symbol === trade.entryOpportunity.symbol);
    const exitSellPrice = ticker ? ticker.bid : trade.entryOpportunity.sellPrice;
    const exitBuyPrice = ticker ? ticker.ask : trade.entryOpportunity.buyPrice;
    const exitSellValue = exitSellPrice * trade.quantity;
    const exitBuyCost = exitBuyPrice * trade.quantity;
    const exitFees = (exitSellValue + exitBuyCost) * TAKER_FEE_RATE;

    const realizedProfit = calculateSpreadPnL(
      trade.entryBuyPrice, trade.entrySellPrice,
      exitBuyPrice, exitSellPrice,
      trade.quantity, trade.entryFees, exitFees
    );

    setPaperTrades(prev => {
      const index = prev.findIndex(t => t.id === trade.id);
      if (index === -1) return prev;
      const newTrades = [...prev];
      newTrades[index] = {
        ...trade,
        status: TradeStatus.closed,
        exitTime: Date.now(),
        exitSellPrice, exitBuyPrice, exitFees, realizedProfit
      };
      return newTrades;
    });

    setBalances(prev => {
      const newBalances = { ...prev };
      const opp = trade.entryOpportunity;
      if (opp.buyExchange === 'Bybit') {
        newBalances['Bybit'] = (prev['Bybit'] || 0) + exitSellValue - (exitSellValue * TAKER_FEE_RATE) + realizedProfit;
        newBalances['Deribit'] = (prev['Deribit'] || 0) - (exitBuyPrice / (opp.sellUnderlying || 1) * trade.quantity);
      } else {
        newBalances['Bybit'] = (prev['Bybit'] || 0) - exitBuyCost - (exitBuyCost * TAKER_FEE_RATE) + realizedProfit;
        newBalances['Deribit'] = (prev['Deribit'] || 0) + (exitSellPrice / (opp.buyUnderlying || 1) * trade.quantity);
      }
      return newBalances;
    });

    addLogEntry(`📉 [LOCAL] Closed: ${trade.entryOpportunity.symbol} | Profit: $${realizedProfit.toFixed(2)}`);
    addExecutionEvent('EXIT', `[LOCAL] Closed ${trade.entryOpportunity.symbol} → $${realizedProfit.toFixed(2)}`, { ...trade, realizedProfit });
  }, [addLogEntry, addExecutionEvent]);

  // ─── WebSocket (stable, no handler deps) ───
  const handlersRef = useRef({ handleNewOpportunity, handleTicker, handleBackendTrade, addLogEntry, addExecutionEvent });
  useEffect(() => {
    handlersRef.current = { handleNewOpportunity, handleTicker, handleBackendTrade, addLogEntry, addExecutionEvent };
  });

  useEffect(() => {
    const socket = new WebSocket(BACKEND_URL);
    ws.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      handlersRef.current.addLogEntry('📡 Connected to backend');
      handlersRef.current.addExecutionEvent('STATUS', 'WebSocket connected to backend');
    };
    socket.onclose = () => {
      setIsConnected(false);
      handlersRef.current.addLogEntry('❌ Disconnected from backend');
      handlersRef.current.addExecutionEvent('STATUS', 'WebSocket disconnected');
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const h = handlersRef.current;
        switch (message.type) {
          case 'OPPORTUNITY':
            h.handleNewOpportunity(message.data);
            break;
          case 'TICKER':
            h.handleTicker(message.data);
            break;
          case 'STATUS':
            setEngineStatus(message.data);
            break;
          case 'TRADE_EXECUTED':
            h.handleBackendTrade(message.data);
            break;
          case 'WELCOME':
            h.addLogEntry(`✅ ${message.message}`);
            h.addExecutionEvent('STATUS', message.message);
            break;
        }
      } catch (e) {
        console.error('WS Error:', e);
      }
    };

    return () => socket.close();
  }, []);

  // ─── Expire stale opportunities ───
  useEffect(() => {
    const cleanup = setInterval(() => {
      setOpportunities(prev => {
        const now = Date.now();
        const filtered = prev.filter(o => now - o.timestamp < 60_000);
        return filtered.length !== prev.length ? filtered : prev;
      });
    }, 10_000);
    return () => clearInterval(cleanup);
  }, []);

  // ─── Auto-close monitor ───
  useEffect(() => {
    const interval = setInterval(() => {
      if (!autoExecutionRef.current) return;
      const currentTickers = tickersRef.current;
      setPaperTrades(trades => {
        trades.forEach(trade => {
          if (trade.status === TradeStatus.open) {
            const ticker = currentTickers.find(t => t.symbol === trade.entryOpportunity.symbol);
            if (ticker) {
              const currentPnL = calculateSpreadPnL(
                trade.entryBuyPrice, trade.entrySellPrice,
                ticker.ask, ticker.bid,
                trade.quantity, trade.entryFees, 0
              );
              if (currentPnL >= trade.targetProfit && trade.targetProfit > 0) {
                closePaperTrade(trade);
              }
            }
          }
        });
        return trades;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, [closePaperTrade]);

  return {
    opportunities,
    paperTrades,
    tickers,
    logs,
    executionEvents,
    engineStatus,
    isConnected,
    autoExecutionEnabled,
    minProfitThreshold,
    balances,
    tradeStats,
    toggleAutoExecution: () => setAutoExecutionEnabled(prev => !prev),
    setMinProfitThreshold,
    executePaperTrade,
    closePaperTrade
  };
};
