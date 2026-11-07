import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/chat_message_model.dart';
import '../services/project_service.dart';
import '../services/chat_socket_service.dart';

/// Pantalla de Chat Grupal en Móvil con Moderación de IA (CU14 / CU15 / CU20 / CU21 / S4-4).
/// Permite enviar consultas (@ia resume el lienzo, ¿qué avanzamos hoy?, etc.)
/// y recibir respuestas de la IA Moderadora en tiempo real.
class ChatScreen extends StatefulWidget {
  final int projectId;
  final String? token;

  const ChatScreen({
    super.key,
    required this.projectId,
    this.token,
  });

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  late ProjectService _projectService;
  late ChatSocketService _chatSocket;
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<ChatMessageModel> _messages = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _projectService = ProjectService(token: widget.token);
    _chatSocket = ChatSocketService();

    _loadHistory();
    _connectSocket();
  }

  Future<void> _loadHistory() async {
    final history = await _projectService.getMessages(widget.projectId);
    if (mounted) {
      setState(() {
        _messages.addAll(history);
        _isLoading = false;
      });
      _scrollToBottom();
    }
  }

  void _connectSocket() {
    _chatSocket.connect(widget.projectId, widget.token);
    _chatSocket.onMessage.listen((msg) {
      if (mounted) {
        setState(() {
          if (!_messages.any((m) => m.id == msg.id)) {
            _messages.add(msg);
          }
        });
        _scrollToBottom();
      }
    });
  }

  void _sendMessage([String? quickText]) {
    final text = (quickText ?? _inputCtrl.text).trim();
    if (text.isEmpty) return;

    _chatSocket.sendMessage(text);
    if (quickText == null) {
      _inputCtrl.clear();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    _chatSocket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617), // slate-950
      body: Column(
        children: [
          // Messages List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
                : _messages.isEmpty
                    ? Center(
                        child: Text(
                          'No hay mensajes aún en este proyecto',
                          style: TextStyle(color: Colors.white.withOpacity(0.35), fontSize: 12),
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollCtrl,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        itemCount: _messages.length,
                        itemBuilder: (context, index) {
                          final msg = _messages[index];
                          final isAi = msg.authorType == 'ai';
                          final timeStr = DateFormat('HH:mm').format(msg.createdAt);

                          return Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: isAi
                                  ? const Color(0xFF3B0764).withOpacity(0.4) // purple-950
                                  : const Color(0xFF0F172A), // slate-900
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: isAi
                                    ? const Color(0xFFA855F7).withOpacity(0.35)
                                    : const Color(0xFF1E293B),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(
                                      isAi ? '🤖 IA Moderadora' : msg.authorName,
                                      style: TextStyle(
                                        color: isAi ? const Color(0xFFD8B4FE) : const Color(0xFF818CF8),
                                        fontSize: 11,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                    Text(
                                      timeStr,
                                      style: TextStyle(color: Colors.white.withOpacity(0.35), fontSize: 10),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  msg.content,
                                  style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 13, height: 1.35),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
          ),

          // S4-4: Quick Action Chips para Consultas a la IA desde móvil
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            color: const Color(0xFF0B132B),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _buildQuickChip('📌 Resumen', '@ia resume el lienzo'),
                  const SizedBox(width: 6),
                  _buildQuickChip('⏱️ ¿Qué avanzamos?', '@ia ¿qué avanzamos hoy?'),
                  const SizedBox(width: 6),
                  _buildQuickChip('📊 Normalización', '@ia audita normalizacion'),
                  const SizedBox(width: 6),
                  _buildQuickChip('🔍 Revisar', '@ia revisa relaciones'),
                ],
              ),
            ),
          ),

          // Input Bar
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              color: Color(0xFF0F172A),
              border: Border(top: BorderSide(color: Color(0xFF1E293B))),
            ),
            child: SafeArea(
              child: Row(
                children: [
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      decoration: BoxDecoration(
                        color: const Color(0xFF020617),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFF334155)),
                      ),
                      child: TextField(
                        controller: _inputCtrl,
                        onSubmitted: (_) => _sendMessage(),
                        style: const TextStyle(color: Colors.white, fontSize: 13),
                        decoration: InputDecoration(
                          hintText: 'Pregunta a @ia (ej: @ia resume el lienzo)...',
                          hintStyle: TextStyle(color: Colors.white.withOpacity(0.35), fontSize: 12),
                          border: InputBorder.none,
                          contentPadding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  IconButton(
                    onPressed: () => _sendMessage(),
                    icon: const Icon(Icons.send, color: Color(0xFF6366F1), size: 22),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildQuickChip(String label, String prompt) {
    return ActionChip(
      label: Text(
        label,
        style: const TextStyle(fontSize: 11, color: Color(0xFFA5B4FC), fontWeight: FontWeight.bold),
      ),
      backgroundColor: const Color(0xFF1E1B4B),
      side: const BorderSide(color: Color(0xFF4338CA), width: 0.8),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 0),
      visualDensity: VisualDensity.compact,
      onPressed: () => _sendMessage(prompt),
    );
  }
}
