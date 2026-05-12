class EngineStatus {
  final int priceCount;
  final int matchedPairs;
  final int lastUpdate;
  final List<String> exchanges;

  EngineStatus({
    required this.priceCount,
    required this.matchedPairs,
    required this.lastUpdate,
    required this.exchanges,
  });

  factory EngineStatus.fromJson(Map<String, dynamic> json) {
    return EngineStatus(
      priceCount: json['priceCount'] ?? 0,
      matchedPairs: json['matchedPairs'] ?? 0,
      lastUpdate: json['lastUpdate'] ?? 0,
      exchanges: List<String>.from(json['exchanges'] ?? []),
    );
  }
}

class Ticker {
  final String symbol;
  final double bid;
  final String bidExchange;
  final double ask;
  final String askExchange;
  final double spreadPercent;
  final double ivSpread;
  final double indexMismatch;
  final double movingBasis;
  final double adjustedProfitPercent;

  Ticker({
    required this.symbol,
    required this.bid,
    required this.bidExchange,
    required this.ask,
    required this.askExchange,
    required this.spreadPercent,
    required this.ivSpread,
    required this.indexMismatch,
    required this.movingBasis,
    required this.adjustedProfitPercent,
  });

  factory Ticker.fromJson(Map<String, dynamic> json) {
    final contract = json['contract'];
    final symbol = contract != null 
        ? '${contract['asset']}-${contract['expiry']}-${contract['strike']}-${contract['type']}'
        : 'Unknown';

    return Ticker(
      symbol: symbol,
      bid: (json['bid'] ?? 0).toDouble(),
      bidExchange: json['bidExchange'] ?? '',
      ask: (json['ask'] ?? 0).toDouble(),
      askExchange: json['askExchange'] ?? '',
      spreadPercent: (json['spreadPercent'] ?? 0).toDouble(),
      ivSpread: (json['ivSpread'] ?? 0).toDouble(),
      indexMismatch: (json['indexMismatch'] ?? 0).toDouble(),
      movingBasis: (json['movingBasis'] ?? 0).toDouble(),
      adjustedProfitPercent: (json['adjustedProfitPercent'] ?? 0).toDouble(),
    );
  }
}
