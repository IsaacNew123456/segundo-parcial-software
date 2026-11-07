import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import '../config/api_config.dart';

/// Servicio de WebSocket para el Lienzo en Tiempo Real (CU21 / S4-3).
/// Se conecta en modo espectador (client_type=mobile) a /ws/canvas/{roomId}/.
class CanvasSocketService {
  WebSocketChannel? _channel;
  StreamSubscription? _subscription;
  Timer? _heartbeatTimer;

  final _updateController = StreamController<dynamic>.broadcast();
  Stream<dynamic> get onDiagramUpdate => _updateController.stream;

  final _errorController = StreamController<String>.broadcast();
  Stream<String> get onError => _errorController.stream;

  bool _isConnected = false;
  bool get isConnected => _isConnected;

  void connect(String roomId) {
    disconnect();

    final uri = Uri.parse('${ApiConfig.wsBaseUrl}/ws/canvas/$roomId/?client_type=mobile');

    try {
      _channel = WebSocketChannel.connect(uri);
      _isConnected = true;

      _subscription = _channel!.stream.listen(
        (data) {
          try {
            final json = jsonDecode(data);
            final type = json['type'];

            if (type == 'broadcast' || type == 'diagram_update') {
              _updateController.add(json['payload'] ?? json);
            } else if (type == 'error') {
              final err = json['error'] ?? 'Error en WebSocket';
              _errorController.add(err.toString());
            }
          } catch (e) {
            debugPrint('[CanvasSocket] Error parseando datos: $e');
          }
        },
        onDone: () {
          _isConnected = false;
          _stopHeartbeat();
        },
        onError: (err) {
          debugPrint('[CanvasSocket] Error socket: $err');
          _isConnected = false;
          _stopHeartbeat();
        },
      );

      _startHeartbeat();
    } catch (e) {
      debugPrint('[CanvasSocket] Error al conectar: $e');
      _isConnected = false;
    }
  }

  /// Intento intencional de mutación para comprobar que el servidor devuelve 403 (S4-5)
  void attemptDiagramWrite(Map<String, dynamic> dummyData) {
    if (_channel != null && _isConnected) {
      _channel!.sink.add(jsonEncode({
        'type': 'broadcast',
        'payload': dummyData,
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
    _updateController.close();
    _errorController.close();
  }
}
