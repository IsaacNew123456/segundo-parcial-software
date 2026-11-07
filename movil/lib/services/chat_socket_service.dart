import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/api_config.dart';
import '../models/chat_message_model.dart';

class ChatSocketService {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _heartbeatTimer;

  final _messageController = StreamController<ChatMessageModel>.broadcast();
  Stream<ChatMessageModel> get onMessage => _messageController.stream;

  bool _isConnected = false;
  bool get isConnected => _isConnected;

  void connect(int projectId, String? token) {
    disconnect();

    final uri = Uri.parse('${ApiConfig.wsBaseUrl}/ws/chat/$projectId/?token=${token ?? ''}');

    try {
      _channel = WebSocketChannel.connect(uri);
      _isConnected = true;

      _subscription = _channel!.stream.listen(
        (data) {
          try {
            final json = jsonDecode(data);
            if (json['type'] == 'message' && json['message'] != null) {
              final msg = ChatMessageModel.fromJson(json['message']);
              _messageController.add(msg);
            }
          } catch (e) {
            debugPrint('[ChatSocket] Error parseando mensaje: $e');
          }
        },
        onDone: () {
          _isConnected = false;
          _stopHeartbeat();
        },
        onError: (err) {
          debugPrint('[ChatSocket] Error socket: $err');
          _isConnected = false;
          _stopHeartbeat();
        },
      );

      _startHeartbeat();
    } catch (e) {
      debugPrint('[ChatSocket] Error al conectar: $e');
      _isConnected = false;
    }
  }

  void sendMessage(String content) {
    if (_channel != null && _isConnected && content.trim().isNotEmpty) {
      _channel!.sink.add(jsonEncode({
        'type': 'chat_message',
        'content': content.trim(),
      }));
    }
  }

  void disconnect() {
    _stopHeartbeat();
    _subscription?.cancel();
    _channel?.sink.close();
    _subscription = null;
    _channel = null;
    _isConnected = false;
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (_channel != null && _isConnected) {
        _channel!.sink.add(jsonEncode({'type': 'ping'}));
      }
    });
  }

  void _stopHeartbeat() {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
  }

  void dispose() {
    disconnect();
    _messageController.close();
  }
}
