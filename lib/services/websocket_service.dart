import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../models/opportunity.dart';

import '../models/live_data.dart';

class WebSocketService {
  WebSocketChannel? _channel;
  final String url;
  final Function(Opportunity) onOpportunity;
  final Function(String) onStatus;
  final Function(EngineStatus)? onEngineStatus;
  final Function(Ticker)? onTicker;
  final Function(dynamic)? onTrade;

  WebSocketService({
    required this.url,
    required this.onOpportunity,
    required this.onStatus,
    this.onEngineStatus,
    this.onTicker,
    this.onTrade,
  });

  void connect() {
    try {
      _channel = WebSocketChannel.connect(Uri.parse(url));
      onStatus('Connected to $url');

      _channel!.stream.listen(
        (message) {
          final data = jsonDecode(message);
          if (data['type'] == 'OPPORTUNITY') {
            onOpportunity(Opportunity.fromJson(data['data']));
          } else if (data['type'] == 'WELCOME') {
            onStatus(data['message']);
          } else if (data['type'] == 'STATUS' && onEngineStatus != null) {
            onEngineStatus!(EngineStatus.fromJson(data['data']));
          } else if (data['type'] == 'TICKER' && onTicker != null) {
            onTicker!(Ticker.fromJson(data['data']));
          } else if (data['type'] == 'TRADE_EXECUTED' && onTrade != null) {
            onTrade!(data['data']);
          }
        },
        onError: (error) {
          onStatus('Error: $error');
          _reconnect();
        },
        onDone: () {
          onStatus('Disconnected');
          _reconnect();
        },
      );
    } catch (e) {
      onStatus('Connection Failed: $e');
      _reconnect();
    }
  }

  void _reconnect() {
    Future.delayed(const Duration(seconds: 5), () => connect());
  }

  void dispose() {
    _channel?.sink.close();
  }
}
