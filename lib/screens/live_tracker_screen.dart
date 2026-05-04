import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/arbitrage_provider.dart';

class LiveTrackerScreen extends StatelessWidget {
  const LiveTrackerScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(symbol: r'$');

    return Consumer<ArbitrageProvider>(
      builder: (context, provider, child) {
        return Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16.0),
              color: Colors.black12,
              width: double.infinity,
              child: const Text(
                'Live Market Spreads (Deribit vs Bybit)',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.teal),
              ),
            ),
            Expanded(
              child: provider.tickers.isEmpty
                  ? const Center(child: Text('Connecting to data feeds...'))
                  : ListView.builder(
                      itemCount: provider.tickers.length,
                      itemBuilder: (context, index) {
                        final ticker = provider.tickers[index];
                        final isPositive = ticker.spreadPercent > 0;
                        return ListTile(
                          title: Text(ticker.symbol, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Text('${ticker.bidExchange} bid ', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  Text(currencyFormat.format(ticker.bid), style: const TextStyle(fontSize: 12, color: Colors.teal, fontWeight: FontWeight.bold)),
                                  const Text(' vs ', style: TextStyle(fontSize: 12, color: Colors.grey)),
                                  Text('${ticker.askExchange} ask ', style: const TextStyle(fontSize: 12, color: Colors.grey)),
                                  Text(currencyFormat.format(ticker.ask), style: const TextStyle(fontSize: 12, color: Colors.blueAccent, fontWeight: FontWeight.bold)),
                                ],
                              ),
                              const SizedBox(height: 4),
                              Row(
                                children: [
                                  Text('IV Spread: ${ticker.ivSpread > 0 ? '+' : ''}${ticker.ivSpread.toStringAsFixed(2)}%', 
                                    style: const TextStyle(fontSize: 11, color: Colors.purpleAccent, fontWeight: FontWeight.bold)),
                                  const SizedBox(width: 10),
                                  Text('Basis Dev: ${(ticker.indexMismatch - ticker.movingBasis).toStringAsFixed(2)}', 
                                    style: TextStyle(fontSize: 11, color: (ticker.indexMismatch - ticker.movingBasis).abs() > 10 ? Colors.redAccent : Colors.orangeAccent)),
                                  const SizedBox(width: 10),
                                  Text('Adj Profit: ${ticker.adjustedProfitPercent.toStringAsFixed(3)}%', 
                                    style: TextStyle(fontSize: 11, color: ticker.adjustedProfitPercent > 0 ? Colors.green : Colors.red)),
                                ],
                              ),
                            ],
                          ),
                          trailing: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            decoration: BoxDecoration(
                              color: isPositive ? Colors.green.withOpacity(0.2) : Colors.red.withOpacity(0.2),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: Text(
                              '${ticker.spreadPercent > 0 ? '+' : ''}${ticker.spreadPercent.toStringAsFixed(3)}%',
                              style: TextStyle(
                                color: isPositive ? Colors.green : Colors.redAccent,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        );
      },
    );
  }
}
