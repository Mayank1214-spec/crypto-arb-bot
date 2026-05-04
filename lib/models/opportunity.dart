class Opportunity {
  final String asset;
  final String expiry;
  final double strike;
  final String type;
  final String buyExchange;
  final double buyPrice;
  final double buyUnderlying;
  final double buyIv;
  final String sellExchange;
  final double sellPrice;
  final double sellUnderlying;
  final double sellIv;
  final double profitPercent;
  final double ivSpread;
  final double indexMismatch;
  final double adjustedProfitPercent;
  final double tradableSize;
  final double potentialProfit;
  final DateTime timestamp;

  Opportunity({
    required this.asset,
    required this.expiry,
    required this.strike,
    required this.type,
    required this.buyExchange,
    required this.buyPrice,
    required this.buyUnderlying,
    required this.buyIv,
    required this.sellExchange,
    required this.sellPrice,
    required this.sellUnderlying,
    required this.sellIv,
    required this.profitPercent,
    required this.ivSpread,
    required this.indexMismatch,
    required this.adjustedProfitPercent,
    required this.tradableSize,
    required this.potentialProfit,
    required this.timestamp,
  });

  factory Opportunity.fromJson(Map<String, dynamic> json) {
    final contract = json['contract'] ?? {};
    return Opportunity(
      asset: contract['asset'] ?? '',
      expiry: contract['expiry'] ?? '',
      strike: (contract['strike'] ?? 0).toDouble(),
      type: contract['type'] ?? '',
      buyExchange: json['buyExchange'] ?? '',
      buyPrice: (json['buyPrice'] ?? 0).toDouble(),
      buyUnderlying: (json['buyUnderlying'] ?? 0).toDouble(),
      buyIv: (json['buyIv'] ?? 0).toDouble(),
      sellExchange: json['sellExchange'] ?? '',
      sellPrice: (json['sellPrice'] ?? 0).toDouble(),
      sellUnderlying: (json['sellUnderlying'] ?? 0).toDouble(),
      sellIv: (json['sellIv'] ?? 0).toDouble(),
      profitPercent: (json['profitPercent'] ?? 0).toDouble(),
      ivSpread: (json['ivSpread'] ?? 0).toDouble(),
      indexMismatch: (json['indexMismatch'] ?? 0).toDouble(),
      adjustedProfitPercent: (json['adjustedProfitPercent'] ?? 0).toDouble(),
      tradableSize: (json['tradableSize'] ?? 0).toDouble(),
      potentialProfit: (json['potentialProfit'] ?? 0).toDouble(),
      timestamp: DateTime.now(),
    );
  }

  String get symbol => '$asset-$expiry-$strike-$type';
}
