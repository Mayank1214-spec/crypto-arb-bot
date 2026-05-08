import { useState, useEffect, useRef, useCallback } from 'react';
import { TradeStatus } from '../types';
import type { Opportunity, PaperTrade, Ticker, EngineStatus } from '../types';

const BACKEND_URL = 'wss://mayank931154680-crypto-arb-bot.hf.space';
const TAKER_FEE_RATE = 0.0003; // 0.03%

export const useArbitrage = () => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [paperTrades, setPaperTrades] = useState<PaperTrade[]>([]);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [engineStatus, setEngineStatus] = useState<EngineStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [autoExecutionEnabled, setAutoExecutionEnabled] = useState(true);
  const [balances, setBalances] = useState<Record<string, number>>({
    'Deribit': 100.0,
    'Bybit': 1000000.0,
  });

  const ws = useRef<WebSocket | null>(null);

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [`[${time}] ${message}`, ...prev].slice(0, 100));
  }, []);

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

    addLog(`🔍 Opportunity: ${opportunity.symbol} (${opportunity.profitPercent.toFixed(2)}%)`);
  }, [addLog]);

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
        trade.status = status === 'OPEN' ? TradeStatus.open : TradeStatus.closed;
        if (status === 'CLOSED') {
          trade.realizedProfit = data.profitActual || 0;
          trade.exitTime = Date.now();
          addLog(`📉 [BACKEND] Closed: ${trade.entryOpportunity.symbol} | Profit: $${trade.realizedProfit?.toFixed(2)}`);
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
          scaleCount: 0
        };
        addLog(`🚀 [BACKEND] Executed: ${newTrade.entryOpportunity.symbol} @ ${newTrade.entryProfitPercent.toFixed(2)}%`);
        return [newTrade, ...prev];
      }
    });
  }, [addLog]);

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
      scaleCount: 0
    };

    setPaperTrades(prev => [trade, ...prev]);
    addLog(`🚀 [LOCAL] Executed: ${opportunity.symbol} @ ${opportunity.profitPercent.toFixed(2)}%`);
  }, [addLog]);

  const closePaperTrade = useCallback((trade: PaperTrade) => {
    if (trade.status === TradeStatus.closed) return;

    setTickers(currentTickers => {
      const ticker = currentTickers.find(t => t.symbol === trade.entryOpportunity.symbol);
      
      const exitSellPrice = ticker ? ticker.bid : trade.entryOpportunity.sellPrice;
      const exitBuyPrice = ticker ? ticker.ask : trade.entryOpportunity.buyPrice;
      
      const exitSellValue = exitSellPrice * trade.quantity;
      const exitBuyCost = exitBuyPrice * trade.quantity;
      const exitFees = (exitSellValue + exitBuyCost) * TAKER_FEE_RATE;
      
      const realizedProfit = (exitSellValue - (trade.entryBuyPrice * trade.quantity)) + 
                             ((trade.entrySellPrice * trade.quantity) - exitBuyCost) - 
                             trade.entryFees - exitFees;

      setPaperTrades(prev => {
        const index = prev.findIndex(t => t.id === trade.id);
        if (index === -1) return prev;
        const newTrades = [...prev];
        newTrades[index] = {
          ...trade,
          status: TradeStatus.closed,
          exitTime: Date.now(),
          exitSellPrice,
          exitBuyPrice,
          exitFees,
          realizedProfit
        };
        return newTrades;
      });

      setBalances(prev => ({
        ...prev,
        'Bybit': (prev['Bybit'] || 0) + realizedProfit
      }));

      addLog(`📉 [LOCAL] Closed: ${trade.entryOpportunity.symbol} | Profit: $${realizedProfit.toFixed(2)}`);
      
      return currentTickers;
    });
  }, [addLog]);

  useEffect(() => {
    ws.current = new WebSocket(BACKEND_URL);

    ws.current.onopen = () => {
      setIsConnected(true);
      addLog('📡 Connected to backend');
    };
    ws.current.onclose = () => {
      setIsConnected(false);
      addLog('❌ Disconnected from backend');
    };
    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        switch (message.type) {
          case 'OPPORTUNITY':
            handleNewOpportunity(message.data);
            break;
          case 'TICKER':
            handleTicker(message.data);
            break;
          case 'STATUS':
            setEngineStatus(message.data);
            break;
          case 'TRADE':
            handleBackendTrade(message.data);
            break;
        }
      } catch (e) {
        console.error('WS Error:', e);
      }
    };

    return () => ws.current?.close();
  }, [handleNewOpportunity, handleTicker, handleBackendTrade, addLog]);

  // Monitor open positions for auto-close/scale
  useEffect(() => {
    const interval = setInterval(() => {
      setPaperTrades(trades => {
        trades.forEach(trade => {
          if (trade.status === TradeStatus.open) {
            const ticker = tickers.find(t => t.symbol === trade.entryOpportunity.symbol);
            if (ticker) {
              const currentPnL = (ticker.bid - trade.entryBuyPrice) * trade.quantity + 
                                (trade.entrySellPrice - ticker.ask) * trade.quantity - 
                                trade.entryFees;
              
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
  }, [tickers, closePaperTrade]);

  return {
    opportunities,
    paperTrades,
    tickers,
    logs,
    engineStatus,
    isConnected,
    autoExecutionEnabled,
    balances,
    toggleAutoExecution: () => setAutoExecutionEnabled(prev => !prev),
    executePaperTrade,
    closePaperTrade
  };
};
