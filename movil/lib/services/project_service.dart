import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';
import '../models/project_model.dart';
import '../models/chat_message_model.dart';
import '../models/diagram_model.dart';
import '../models/session_model.dart';

class ProjectService {
  final String? token;

  ProjectService({this.token});

  Future<List<ProjectModel>> getProjects() async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/projects/'),
        headers: ApiConfig.baseHeaders(token),
      );

      if (response.statusCode == 200) {
        final List list = jsonDecode(response.body);
        return list.map((item) => ProjectModel.fromJson(item)).toList();
      }
    } catch (e) {
      debugPrint('[ProjectService] Error getProjects: $e');
    }
    return [];
  }

  Future<UmlDiagramModel?> getDiagram(String roomId) async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/get_backup_uml/$roomId/'),
        headers: ApiConfig.baseHeaders(token),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return UmlDiagramModel.fromJson(data);
      }
    } catch (e) {
      debugPrint('[ProjectService] Error getDiagram: $e');
    }
    return null;
  }

  Future<List<ChatMessageModel>> getMessages(int projectId) async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/projects/$projectId/messages/'),
        headers: ApiConfig.baseHeaders(token),
      );

      if (response.statusCode == 200) {
        final List list = jsonDecode(response.body);
        return list.map((item) => ChatMessageModel.fromJson(item)).toList();
      }
    } catch (e) {
      debugPrint('[ProjectService] Error getMessages: $e');
    }
    return [];
  }

  Future<ChatMessageModel?> sendMessage(int projectId, String content) async {
    try {
      final response = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/projects/$projectId/messages/'),
        headers: ApiConfig.baseHeaders(token),
        body: jsonEncode({'content': content}),
      );

      if (response.statusCode == 201) {
        final data = jsonDecode(response.body);
        return ChatMessageModel.fromJson(data);
      }
    } catch (e) {
      debugPrint('[ProjectService] Error sendMessage: $e');
    }
    return null;
  }

  /// Historial de sesiones (CU19 / S3-5 / S4-4) - Solo lectura
  Future<List<SessionModel>> getSessions(int projectId) async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/projects/$projectId/sessions/'),
        headers: ApiConfig.baseHeaders(token),
      );

      if (response.statusCode == 200) {
        final List list = jsonDecode(response.body);
        return list.map((item) => SessionModel.fromJson(item)).toList();
      }
    } catch (e) {
      debugPrint('[ProjectService] Error getSessions: $e');
    }
    return [];
  }

  /// Detalle de sesión con timeline y snapshot (CU19 / S4-4)
  Future<Map<String, dynamic>?> getSessionDetail(int projectId, int sessionId) async {
    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/projects/$projectId/sessions/$sessionId/'),
        headers: ApiConfig.baseHeaders(token),
      );

      if (response.statusCode == 200) {
        return jsonDecode(response.body);
      }
    } catch (e) {
      debugPrint('[ProjectService] Error getSessionDetail: $e');
    }
    return null;
  }

  /// Prueba de Regla Inviolable 1 y S4-5: Un intento de escritura desde el móvil devuelve 403
  Future<int> attemptDiagramWrite(String roomId, Map<String, dynamic> data) async {
    try {
      final response = await http.post(
        Uri.parse('${ApiConfig.baseUrl}/set_backup_uml/$roomId/'),
        headers: ApiConfig.baseHeaders(token),
        body: jsonEncode(data),
      );
      return response.statusCode;
    } catch (e) {
      debugPrint('[ProjectService] Error attemptDiagramWrite: $e');
      return 500;
    }
  }
}
