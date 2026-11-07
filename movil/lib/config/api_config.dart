import 'dart:io';
import 'package:flutter/foundation.dart';

class ApiConfig {
  // En emulador Android estándar se usa 10.0.2.2 para acceder a localhost del host.
  // En emulador iOS, Desktop o Web se usa 127.0.0.1 o localhost.
  static String get defaultHost {
    if (kIsWeb) return '127.0.0.1:8000';
    if (Platform.isAndroid) return '10.0.2.2:8000';
    return '127.0.0.1:8000';
  }

  static String baseUrl = 'http://$defaultHost/api';
  static String wsBaseUrl = 'ws://$defaultHost';

  // Regla RNF1 / Regla 1: Encabezado obligatorio para clientes móviles
  static Map<String, String> baseHeaders([String? token]) {
    final headers = {
      'Content-Type': 'application/json',
      'X-Client-Type': 'mobile',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }
}
