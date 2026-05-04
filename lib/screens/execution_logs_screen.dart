import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/arbitrage_provider.dart';

class ExecutionLogsScreen extends StatelessWidget {
  const ExecutionLogsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ArbitrageProvider>(
      builder: (context, provider, child) {
        return Column(
          children: [
            Container(
              padding: const EdgeInsets.all(16.0),
              color: Colors.black26,
              width: double.infinity,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Real-Time Execution Logs',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.greenAccent),
                  ),
                  IconButton(
                    icon: const Icon(Icons.delete_sweep_outlined, color: Colors.grey),
                    onPressed: () {
                      // Logic to clear logs if needed
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: provider.logs.isEmpty
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.terminal, size: 48, color: Colors.grey),
                          SizedBox(height: 16),
                          Text('No logs yet. Waiting for backend activity...', style: TextStyle(color: Colors.grey)),
                        ],
                      ),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.all(8),
                      itemCount: provider.logs.length,
                      itemBuilder: (context, index) {
                        final log = provider.logs[index];
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 2.0),
                          child: Text(
                            log,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 12,
                              color: Colors.lightGreenAccent,
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
