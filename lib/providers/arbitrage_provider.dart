import 'package:flutter/foundation.dart';
import 'dart:io' show Platform;
import 'package:intl/intl.dart';
import '../models/opportunity.dart';
import '../models/paper_trade.dart';
import '../services/websocket_service.dart';

import '../models/live_data.dart';

class ArbitrageProvider extends ChangeNotifier {
  final List<Opportunity> _opportunities = [];
  final List<PaperTrade> _paperTrades = [];
  final List<Ticker> _tickers = [];
  String _status = 'Initializing...';
  EngineStatus? _engineStatus;
  late WebSocketService _webSocketService;
  final List<String> _logs = [];

  List<String> get logs => List.unmodifiable(_logs);

  // Auto-trading settings
  bool _autoExecutionEnabled = true;
  double _minProfitThreshold = 0.10; // 0.10% min profit after considering fees
  static const double _takerFeeRate = 0.0003; // 0.03% taker fee

  final Map<String, double> _balances = {
    'Deribit': 100.0, // BTC
    'Bybit': 1000000.0, // USDT
  };

  List<Opportunity> get opportunities => List.unmodifiable(_opportunities);
  List<PaperTrade> get paperTrades => List.unmodifiable(_paperTrades);
  List<Ticker> get tickers => List.unmodifiable(_tickers);
  String get status => _status;
  EngineStatus? get engineStatus => _engineStatus;
  bool get autoExecutionEnabled => _autoExecutionEnabled;
  Map<String, double> get balances => Map.unmodifiable(_balances);

  /// On desktop/web, Flutter can reach localhost directly.
  /// On Android/iOS, 'localhost' refers to the device itself — use the host machine's LAN IP.
  static String get _backendUrl {
    const hfUrl = 'wss://mayank931154680-crypto-arb-bot.hf.space';
    const lanIp = '172.23.167.54'; // Your host machine's LAN IP
    const port = '7860';
    
    // Use HF URL for production/live use. 
    // You can toggle this back to 'ws://localhost:$port' for local testing.
    return hfUrl; 
  }

  ArbitrageProvider() {
    _webSocketService = WebSocketService(
      url: _backendUrl,
      onOpportunity: _handleNewOpportunity,
      onStatus: _handleStatusChange,
      onEngineStatus: _handleEngineStatus,
      onTicker: _handleTicker,
      onTrade: _handleBackendTrade,
    );
    _webSocketService.connect();
  }

  void _handleEngineStatus(EngineStatus status) {
    _engineStatus = status;
    notifyListeners();
  }

  void _handleTicker(Ticker ticker) {
    final index = _tickers.indexWhere((t) => t.symbol == ticker.symbol);
    if (index != -1) {
      _tickers[index] = ticker;
    } else {
      _tickers.insert(0, ticker);
    }
    if (_tickers.length > 50) {
      _tickers.removeLast();
    }
    _monitorOpenPositions(ticker);
    notifyListeners();
  }

  void _monitorOpenPositions(Ticker ticker) {
    // 1. Find all open trades for this symbol
    final openTrades = _paperTrades
        .where((t) => t.status == TradeStatus.open && t.entryOpportunity.symbol == ticker.symbol)
        .toList();

    for (var trade in openTrades) {
      // 2. Calculate current PnL (net of entry fees)
      final currentPnL = trade.calculateCurrentPnL(ticker.ask, ticker.bid);

      // 3. AUTO-CLOSE: If floating profit >= target profit at entry
      if (currentPnL >= trade.targetProfit && trade.targetProfit > 0) {
        debugPrint('Auto-Closing trade ${trade.id} - Target reached!');
        closePaperTrade(trade);
        continue;
      }

      // 4. AUTO-SCALE: If spread increases significantly against us
      // If current spread is 50% better (wider) than entry spread
      final currentSpread = ticker.spreadPercent;
      if (currentSpread > (trade.entrySpreadPercent * 1.5) && trade.scaleCount < 3) {
        debugPrint('Auto-Scaling trade ${trade.id} - Spread widened to $currentSpread%');
        trade.scaleCount++;
        // Scale in with the same quantity
        executePaperTrade(trade.entryOpportunity, trade.quantity);
      }
    }
  }

  void toggleAutoExecution() {
    _autoExecutionEnabled = !_autoExecutionEnabled;
    notifyListeners();
  }

  void _handleNewOpportunity(Opportunity opportunity) {
    // Keep only unique opportunities by symbol
    final index = _opportunities.indexWhere((o) => o.symbol == opportunity.symbol);
    if (index != -1) {
      _opportunities[index] = opportunity;
    } else {
      _opportunities.insert(0, opportunity);
    }
    
    if (_opportunities.length > 50) {
      _opportunities.removeLast();
    }
    
    notifyListeners();
    _addLog('🔍 Opportunity found: ${opportunity.symbol} (${opportunity.profitPercent.toStringAsFixed(2)}%)');
  }

  void _handleStatusChange(String newStatus) {
    _status = newStatus;
    _addLog('📡 Status: $newStatus');
    notifyListeners();
  }

  void _handleBackendTrade(dynamic data) {
    // Convert backend trade data to our local PaperTrade model
    try {
      final String tradeId = data['id'];
      final oppJson = data['opportunity'];
      final opportunity = Opportunity.fromJson(oppJson);
      final String status = data['status'];
      
      final existingIndex = _paperTrades.indexWhere((t) => t.id == tradeId);
      
      if (existingIndex != -1) {
        // Update existing trade
        final trade = _paperTrades[existingIndex];
        trade.status = status == 'OPEN' ? TradeStatus.open : TradeStatus.closed;
        if (status == 'CLOSED') {
          trade.realizedProfit = (data['profitActual'] ?? 0.0).toDouble();
          trade.exitTime = DateTime.now();
          _addLog('📉 [BACKEND] Closed trade: ${trade.entryOpportunity.symbol} | Profit: \$${trade.realizedProfit?.toStringAsFixed(2)}');
        }
      } else {
        // Insert new trade
        final trade = PaperTrade(
          id: tradeId,
          entryOpportunity: opportunity,
          quantity: opportunity.tradableSize,
          entryTime: DateTime.fromMillisecondsSinceEpoch(data['timestamp']),
          entryProfitPercent: opportunity.profitPercent,
          targetProfit: opportunity.potentialProfit,
          entrySpreadPercent: opportunity.profitPercent,
          entryBuyPrice: opportunity.buyPrice,
          entrySellPrice: opportunity.sellPrice,
          entryFees: 0, 
          status: status == 'OPEN' ? TradeStatus.open : TradeStatus.closed,
        );

        _paperTrades.insert(0, trade);
        _addLog('🚀 [BACKEND] Executed trade: ${trade.entryOpportunity.symbol} @ ${trade.entryProfitPercent.toStringAsFixed(2)}%');
      }
      
      notifyListeners();
      debugPrint('Backend Trade Update Received: $tradeId ($status)');
    } catch (e) {
      debugPrint('Error parsing backend trade: $e');
    }
  }

  void _addLog(String message) {
    final time = DateFormat('HH:mm:ss').format(DateTime.now());
    _logs.insert(0, '[$time] $message');
    if (_logs.length > 100) _logs.removeLast();
    notifyListeners();
  }

  void executePaperTrade(Opportunity opportunity, double quantity) {
    // 1. Calculate Entry Fees (0.03% for each leg)
    final buyCost = opportunity.buyPrice * quantity;
    final sellValue = opportunity.sellPrice * quantity;
    final entryFees = (buyCost + sellValue) * _takerFeeRate;
    
    // Target profit is the raw spread profit at entry minus the estimated entry AND exit fees
    final expectedExitFees = entryFees; // assume exit fees are same as entry for estimation
    final targetProfit = (sellValue - buyCost) - entryFees - expectedExitFees;

    // Check balances (simplified for paper trading)
    if (opportunity.buyExchange == 'Bybit' && (_balances['Bybit'] ?? 0) < buyCost) return;
    
    // Update balances (Entry)
    if (opportunity.buyExchange == 'Bybit') {
      _balances['Bybit'] = (_balances['Bybit'] ?? 0) - buyCost - (buyCost * _takerFeeRate);
      _balances['Deribit'] = (_balances['Deribit'] ?? 0) + (opportunity.sellPrice / opportunity.sellUnderlying * quantity); 
    } else {
      // Buy Deribit, Sell Bybit
      _balances['Bybit'] = (_balances['Bybit'] ?? 0) + sellValue - (sellValue * _takerFeeRate);
      _balances['Deribit'] = (_balances['Deribit'] ?? 0) - (opportunity.buyPrice / opportunity.buyUnderlying * quantity);
    }

    final trade = PaperTrade(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      entryOpportunity: opportunity,
      quantity: quantity,
      entryTime: DateTime.now(),
      entryProfitPercent: opportunity.profitPercent,
      targetProfit: targetProfit,
      entrySpreadPercent: opportunity.profitPercent,
      entryBuyPrice: opportunity.buyPrice,
      entrySellPrice: opportunity.sellPrice,
      entryFees: entryFees,
      status: TradeStatus.open,
    );
    
    _paperTrades.insert(0, trade);
    notifyListeners();
  }

  void closePaperTrade(PaperTrade trade) {
    if (trade.status == TradeStatus.closed) return;

    // To close, we need current market prices. 
    // We'll look for the latest ticker for this symbol.
    final ticker = _tickers.firstWhere(
      (t) => t.symbol == trade.entryOpportunity.symbol,
      orElse: () => Ticker(
        symbol: trade.entryOpportunity.symbol,
        bid: trade.entryOpportunity.sellPrice, // fallback to entry if no live data
        bidExchange: trade.entryOpportunity.sellExchange,
        ask: trade.entryOpportunity.buyPrice,
        askExchange: trade.entryOpportunity.buyExchange,
        spreadPercent: 0,
        ivSpread: 0,
        indexMismatch: 0,
        movingBasis: 0,
        adjustedProfitPercent: 0,
      ),
    );

    // Closing logic: 
    // We bought at entryBuyPrice on buyExchange -> now we SELL at ticker.bid on buyExchange
    // We sold at entrySellPrice on sellExchange -> now we BUY at ticker.ask on sellExchange
    
    // For simplicity, let's assume we can always exit at the current spread
    final exitSellPrice = ticker.bid; // price we sell our "bought" leg
    final exitBuyPrice = ticker.ask;  // price we buy back our "sold" leg
    
    final exitSellValue = exitSellPrice * trade.quantity;
    final exitBuyCost = exitBuyPrice * trade.quantity;
    final exitFees = (exitSellValue + exitBuyCost) * _takerFeeRate;
    
    final realizedProfit = (exitSellValue - (trade.entryBuyPrice * trade.quantity)) + 
                           ((trade.entrySellPrice * trade.quantity) - exitBuyCost) - 
                           trade.entryFees - exitFees;

    trade.status = TradeStatus.closed;
    trade.exitTime = DateTime.now();
    trade.exitSellPrice = exitSellPrice;
    trade.exitBuyPrice = exitBuyPrice;
    trade.exitFees = exitFees;
    trade.realizedProfit = realizedProfit;

    // Final balance settlement
    _balances['Bybit'] = (_balances['Bybit'] ?? 0) + realizedProfit;

    notifyListeners();
  }

  double get totalRealizedProfit => _paperTrades
      .where((t) => t.status == TradeStatus.closed)
      .fold(0, (sum, t) => sum + (t.realizedProfit ?? 0));

  double get currentUnrealizedProfit {
    double total = 0;
    for (var trade in _paperTrades.where((t) => t.status == TradeStatus.open)) {
      final ticker = _tickers.firstWhere(
        (t) => t.symbol == trade.entryOpportunity.symbol,
        orElse: () => Ticker(
          symbol: trade.entryOpportunity.symbol,
          bid: trade.entryOpportunity.sellPrice,
          bidExchange: trade.entryOpportunity.sellExchange,
          ask: trade.entryOpportunity.buyPrice,
          askExchange: trade.entryOpportunity.buyExchange,
          spreadPercent: 0,
          ivSpread: 0,
          indexMismatch: 0,
          movingBasis: 0,
          adjustedProfitPercent: 0,
        ),
      );
      total += trade.calculateCurrentPnL(ticker.ask, ticker.bid);
    }
    return total;
  }

  @override
  void dispose() {
    _webSocketService.dispose();
    super.dispose();
  }
}
