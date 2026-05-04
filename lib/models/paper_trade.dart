import 'opportunity.dart';

enum TradeStatus { open, closed }

class PaperTrade {
  final String id;
  final Opportunity entryOpportunity;
  final double quantity;
  final DateTime entryTime;
  final double entryProfitPercent;
  final double targetProfit; // Net profit target at entry
  final double entrySpreadPercent;
  
  // Real-like data
  final double entryBuyPrice;
  final double entrySellPrice;
  final double entryFees;

  TradeStatus status;
  DateTime? exitTime;
  double? exitBuyPrice; // Reversing the sell
  double? exitSellPrice; // Reversing the buy
  double? exitFees;
  double? realizedProfit;
  int scaleCount; // How many times we scaled in

  PaperTrade({
    required this.id,
    required this.entryOpportunity,
    required this.quantity,
    required this.entryTime,
    required this.entryProfitPercent,
    required this.targetProfit,
    required this.entrySpreadPercent,
    required this.entryBuyPrice,
    required this.entrySellPrice,
    required this.entryFees,
    this.status = TradeStatus.open,
    this.exitTime,
    this.exitBuyPrice,
    this.exitSellPrice,
    this.exitFees,
    this.realizedProfit,
    this.scaleCount = 0,
  });

  // Calculate current unrealized profit based on live tickers
  double calculateCurrentPnL(double currentBuyPrice, double currentSellPrice) {
    if (status == TradeStatus.closed) return realizedProfit ?? 0.0;
    
    // To close: we SELL what we bought and BUY what we sold.
    // currentSellPrice is the price we can SELL the asset we bought at entryBuyPrice.
    // currentBuyPrice is the price we can BUY the asset we sold at entrySellPrice.
    final sellSidePnL = (currentSellPrice - entryBuyPrice) * quantity;
    final buySidePnL = (entrySellPrice - currentBuyPrice) * quantity;
    
    return sellSidePnL + buySidePnL - entryFees;
  }
}
