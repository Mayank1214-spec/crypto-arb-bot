import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/arbitrage_provider.dart';
import '../models/opportunity.dart';

class LiveOpportunitiesScreen extends StatelessWidget {
  const LiveOpportunitiesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(symbol: r'$');
    final percentFormat = NumberFormat.decimalPercentPattern(decimalDigits: 2);

    return Consumer<ArbitrageProvider>(
      builder: (context, provider, child) {
        return Column(
          children: [
            if (provider.engineStatus != null)
              Container(
                padding: const EdgeInsets.all(16.0),
                decoration: BoxDecoration(
                  color: Colors.deepPurple.shade900,
                  borderRadius: const BorderRadius.only(
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(16),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _StatColumn(
                      label: 'Matching Pairs',
                      value: provider.engineStatus!.matchedPairs.toString(),
                      icon: Icons.auto_awesome_mosaic,
                      color: Colors.blueAccent,
                    ),
                    _StatColumn(
                      label: 'Scanned Prices',
                      value: provider.engineStatus!.priceCount.toString(),
                      icon: Icons.speed,
                      color: Colors.amberAccent,
                    ),
                    _StatColumn(
                      label: 'Network',
                      value: 'LIVE',
                      icon: Icons.sensors,
                      color: Colors.greenAccent,
                    ),
                  ],
                ),
              )
            else
              Container(
                padding: const EdgeInsets.all(8.0),
                color: Colors.black12,
                width: double.infinity,
                child: Text(
                  'Status: ${provider.status}',
                  style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
                ),
              ),
            Expanded(
              child: provider.opportunities.isEmpty
                  ? const Center(child: Text('Waiting for opportunities...'))
                  : ListView.builder(
                      itemCount: provider.opportunities.length,
                      itemBuilder: (context, index) {
                        final opportunity = provider.opportunities[index];
                        return _OpportunityCard(
                          opportunity: opportunity,
                          currencyFormat: currencyFormat,
                          percentFormat: percentFormat,
                          onTrade: () => provider.executePaperTrade(opportunity, opportunity.tradableSize),
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

class _OpportunityCard extends StatelessWidget {
  final Opportunity opportunity;
  final NumberFormat currencyFormat;
  final NumberFormat percentFormat;
  final VoidCallback onTrade;

  const _OpportunityCard({
    required this.opportunity,
    required this.currencyFormat,
    required this.percentFormat,
    required this.onTrade,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header row: symbol + IV spread + profit %
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        opportunity.symbol,
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      Text(
                        'IV Spread: ${opportunity.ivSpread.toStringAsFixed(2)}%',
                        style: const TextStyle(fontSize: 12, color: Colors.purpleAccent, fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.green.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    '${opportunity.profitPercent.toStringAsFixed(2)}%',
                    style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
                  ),
                ),
              ],
            ),
            const Divider(),
            // Buy/Sell legs
            Row(
              children: [
                Expanded(
                  child: _TradeInfo(
                    label: 'BUY',
                    exchange: opportunity.buyExchange,
                    price: currencyFormat.format(opportunity.buyPrice),
                    underlying: currencyFormat.format(opportunity.buyUnderlying),
                    iv: '${opportunity.buyIv.toStringAsFixed(1)}%',
                    color: Colors.blue,
                  ),
                ),
                const Icon(Icons.arrow_forward, color: Colors.grey),
                Expanded(
                  child: _TradeInfo(
                    label: 'SELL',
                    exchange: opportunity.sellExchange,
                    price: currencyFormat.format(opportunity.sellPrice),
                    underlying: currencyFormat.format(opportunity.sellUnderlying),
                    iv: '${opportunity.sellIv.toStringAsFixed(1)}%',
                    color: Colors.orange,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Footer: size, profit, trade button
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Size: ${opportunity.tradableSize}', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                    Text('Profit: ${currencyFormat.format(opportunity.potentialProfit)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                  ],
                ),
                ElevatedButton(
                  onPressed: onTrade,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.green, foregroundColor: Colors.white),
                  child: const Text('PAPER TRADE'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _TradeInfo extends StatelessWidget {
  final String label;
  final String exchange;
  final String price;
  final String underlying;
  final String iv;
  final Color color;

  const _TradeInfo({
    required this.label,
    required this.exchange,
    required this.price,
    required this.underlying,
    required this.iv,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: label == 'BUY' ? CrossAxisAlignment.start : CrossAxisAlignment.end,
      children: [
        Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 10)),
        Text(exchange, style: const TextStyle(fontWeight: FontWeight.bold)),
        Text(price, style: const TextStyle(fontSize: 14)),
        Text('IV: $iv', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.purpleAccent)),
        Text('Idx: $underlying', style: const TextStyle(fontSize: 10, color: Colors.grey)),
      ],
    );
  }
}

class _StatColumn extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatColumn({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Icon(icon, color: color, size: 24),
        const SizedBox(height: 8),
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12)),
      ],
    );
  }
}
