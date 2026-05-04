import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/arbitrage_provider.dart';
import '../models/live_data.dart';

class PaperTradingScreen extends StatelessWidget {
  const PaperTradingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final currencyFormat = NumberFormat.currency(symbol: r'$');

    return Consumer<ArbitrageProvider>(
      builder: (context, provider, child) {
        return Column(
          children: [
            _SummaryHeader(
              realizedProfit: currencyFormat.format(provider.totalRealizedProfit),
              floatingPnL: currencyFormat.format(provider.currentUnrealizedProfit),
              tradeCount: provider.paperTrades.length.toString(),
              balances: provider.balances,
              autoEnabled: provider.autoExecutionEnabled,
              onToggleAuto: provider.toggleAutoExecution,
              currencyFormat: currencyFormat,
            ),
            Expanded(
              child: provider.paperTrades.isEmpty
                  ? const Center(child: Text('No trades executed yet.'))
                    : ListView.builder(
                        itemCount: provider.paperTrades.length,
                        itemBuilder: (context, index) {
                          final trade = provider.paperTrades[index];
                          return _TradeDetailCard(
                            trade: trade,
                            currencyFormat: currencyFormat,
                            onClose: () => provider.closePaperTrade(trade),
                            latestTicker: provider.tickers.firstWhere(
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

class _SummaryHeader extends StatelessWidget {
  final String realizedProfit;
  final String floatingPnL;
  final String tradeCount;
  final Map<String, double> balances;
  final bool autoEnabled;
  final VoidCallback onToggleAuto;
  final NumberFormat currencyFormat;

  const _SummaryHeader({
    required this.realizedProfit,
    required this.floatingPnL,
    required this.tradeCount,
    required this.balances,
    required this.autoEnabled,
    required this.onToggleAuto,
    required this.currencyFormat,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      width: double.infinity,
      decoration: BoxDecoration(
        color: Colors.deepPurple.shade900,
        borderRadius: const BorderRadius.only(
          bottomLeft: Radius.circular(24),
          bottomRight: Radius.circular(24),
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Realized Profit', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Text(realizedProfit, style: const TextStyle(color: Colors.greenAccent, fontSize: 24, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  const Text('Floating PnL', style: TextStyle(color: Colors.white70, fontSize: 11)),
                  Text(floatingPnL, style: TextStyle(color: floatingPnL.contains('-') ? Colors.redAccent : Colors.orangeAccent, fontSize: 16, fontWeight: FontWeight.bold)),
                ],
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('Auto-Execution', style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Switch(
                    value: autoEnabled,
                    onChanged: (_) => onToggleAuto(),
                    activeColor: Colors.greenAccent,
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: balances.entries.map((e) {
              return _StatItem(
                label: '${e.key} Balance',
                value: currencyFormat.format(e.value),
                color: Colors.white,
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

class _TradeDetailCard extends StatelessWidget {
  final dynamic trade; // PaperTrade
  final NumberFormat currencyFormat;
  final VoidCallback onClose;
  final Ticker latestTicker;

  const _TradeDetailCard({
    required this.trade,
    required this.currencyFormat,
    required this.onClose,
    required this.latestTicker,
  });

  @override
  Widget build(BuildContext context) {
    final bool isOpen = trade.status.toString().contains('open');
    final double pnl = isOpen 
        ? trade.calculateCurrentPnL(latestTicker.ask, latestTicker.bid)
        : (trade.realizedProfit ?? 0.0);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(trade.entryOpportunity.symbol, style: const TextStyle(fontWeight: FontWeight.bold)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: isOpen ? Colors.blue.withOpacity(0.1) : Colors.grey.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    isOpen ? 'OPEN' : 'CLOSED',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: isOpen ? Colors.blue : Colors.grey),
                  ),
                ),
              ],
            ),
            const Divider(),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                _MiniStat(label: 'Qty', value: trade.quantity.toString()),
                _MiniStat(label: 'Target Profit', value: currencyFormat.format(trade.targetProfit)),
                _MiniStat(label: 'Scaled', value: '${trade.scaleCount}x'),
                _MiniStat(label: 'Fees Paid', value: currencyFormat.format(trade.entryFees + (trade.exitFees ?? 0))),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(isOpen ? 'Floating PnL:' : 'Realized PnL:', style: TextStyle(color: Colors.grey[600], fontSize: 12)),
                Text(
                  currencyFormat.format(pnl),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: pnl >= 0 ? Colors.green : Colors.red,
                  ),
                ),
              ],
            ),
            if (isOpen) ...[
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: onClose,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 36),
                ),
                child: const Text('CLOSE POSITION'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  const _MiniStat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey)),
        Text(value, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold)),
      ],
    );
  }
}

class _StatItem extends StatelessWidget {
  final String label;
  final String value;
  final Color color;

  const _StatItem({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(label, style: const TextStyle(color: Colors.white70, fontSize: 10)),
        const SizedBox(height: 5),
        Text(value, style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.bold)),
      ],
    );
  }
}
