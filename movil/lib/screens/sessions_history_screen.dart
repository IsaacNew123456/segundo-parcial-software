import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/session_model.dart';
import '../services/project_service.dart';

/// Pantalla de Historial de Sesiones en Móvil (CU19 / S4-4).
/// Solo Lectura: Trazabilidad de sesiones pasadas con snapshot y línea de tiempo.
class SessionsHistoryScreen extends StatefulWidget {
  final int projectId;
  final String? token;

  const SessionsHistoryScreen({
    super.key,
    required this.projectId,
    this.token,
  });

  @override
  State<SessionsHistoryScreen> createState() => _SessionsHistoryScreenState();
}

class _SessionsHistoryScreenState extends State<SessionsHistoryScreen> {
  late ProjectService _projectService;
  List<SessionModel> _sessions = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _projectService = ProjectService(token: widget.token);
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    setState(() => _isLoading = true);
    final list = await _projectService.getSessions(widget.projectId);
    if (mounted) {
      setState(() {
        _sessions = list;
        _isLoading = false;
      });
    }
  }

  void _showSessionDetails(SessionModel session) async {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A), // slate-900
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      isScrollControlled: true,
      builder: (context) {
        final startStr = DateFormat('dd/MM/yyyy HH:mm').format(session.startedAt);
        final endStr = session.endedAt != null
            ? DateFormat('dd/MM/yyyy HH:mm').format(session.endedAt!)
            : 'En curso';

        return DraggableScrollableSheet(
          initialChildSize: 0.7,
          minChildSize: 0.4,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollCtrl) {
            return Container(
              padding: const EdgeInsets.all(20),
              child: ListView(
                controller: scrollCtrl,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      decoration: BoxDecoration(
                        color: Colors.white24,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Sesión #${session.id}',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: session.isActive
                              ? const Color(0xFF10B981).withOpacity(0.15)
                              : Colors.white10,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          session.isActive ? 'Activa' : 'Cerrada',
                          style: TextStyle(
                            color: session.isActive ? const Color(0xFF10B981) : Colors.white60,
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _buildDetailRow('Inicio:', startStr),
                  _buildDetailRow('Cierre:', endStr),
                  _buildDetailRow('Duración:', '${session.durationMinutes} min'),
                  _buildDetailRow('Eventos del lienzo:', '${session.eventsCount} mutaciones'),
                  _buildDetailRow('Mensajes de chat:', '${session.messagesCount} mensajes'),
                  const SizedBox(height: 14),
                  const Text(
                    'Resumen de la Sesión',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF818CF8)),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFF020617),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: Text(
                      session.summary.isNotEmpty ? session.summary : 'Sin resumen generado aún.',
                      style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 12, height: 1.4),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (session.snapshot != null) ...[
                    const Text(
                      'Snapshot Congelado del Diagrama',
                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Color(0xFF38BDF8)),
                    ),
                    const SizedBox(height: 6),
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: const Color(0xFF020617),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFF1E293B)),
                      ),
                      child: Text(
                        'Clases guardadas: ${(session.snapshot!['classes'] as List?)?.length ?? 0} | '
                        'Relaciones: ${(session.snapshot!['relationships'] as List?)?.length ?? 0}',
                        style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11, fontFamily: 'monospace'),
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF1E1B4B),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: const Color(0xFF4338CA)),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.lock_outline, size: 14, color: Color(0xFFA5B4FC)),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'Historial Inmutable: Esta sesión está congelada y no puede ser modificada (CU19 / Regla 5).',
                            style: TextStyle(fontSize: 10, color: Color(0xFFA5B4FC)),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11)),
          Text(value, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617), // slate-950
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
          : _sessions.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.history, size: 52, color: Colors.white.withOpacity(0.2)),
                      const SizedBox(height: 12),
                      const Text(
                        'No hay sesiones registradas en este proyecto',
                        style: TextStyle(color: Colors.white70, fontSize: 13),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Las sesiones se abren al ingresar al lienzo y se guardan al cerrarse.',
                        style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: const Color(0xFF6366F1),
                  onRefresh: _loadSessions,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: _sessions.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 10),
                    itemBuilder: (context, index) {
                      final s = _sessions[index];
                      final dateStr = DateFormat('dd/MM/yyyy HH:mm').format(s.startedAt);

                      return InkWell(
                        onTap: () => _showSessionDetails(s),
                        borderRadius: BorderRadius.circular(14),
                        child: Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F172A),
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: s.isActive ? const Color(0xFF10B981).withOpacity(0.4) : const Color(0xFF1E293B),
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'Sesión #${s.id}',
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                                  ),
                                  Container(
                                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                                    decoration: BoxDecoration(
                                      color: s.isActive
                                          ? const Color(0xFF10B981).withOpacity(0.15)
                                          : Colors.white.withOpacity(0.06),
                                      borderRadius: BorderRadius.circular(10),
                                    ),
                                    child: Text(
                                      s.isActive ? 'En Curso' : 'Cerrada',
                                      style: TextStyle(
                                        color: s.isActive ? const Color(0xFF10B981) : Colors.white60,
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Text(
                                dateStr,
                                style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11),
                              ),
                              const SizedBox(height: 8),
                              Row(
                                children: [
                                  Icon(Icons.touch_app_outlined, size: 12, color: Colors.white.withOpacity(0.4)),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${s.eventsCount} eventos',
                                    style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11),
                                  ),
                                  const SizedBox(width: 14),
                                  Icon(Icons.chat_bubble_outline, size: 12, color: Colors.white.withOpacity(0.4)),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${s.messagesCount} msgs',
                                    style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11),
                                  ),
                                  const SizedBox(width: 14),
                                  Icon(Icons.timer_outlined, size: 12, color: Colors.white.withOpacity(0.4)),
                                  const SizedBox(width: 4),
                                  Text(
                                    '${s.durationMinutes} min',
                                    style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11),
                                  ),
                                ],
                              ),
                              if (s.summary.isNotEmpty) ...[
                                const SizedBox(height: 8),
                                Text(
                                  s.summary,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 11),
                                ),
                              ],
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
    );
  }
}
