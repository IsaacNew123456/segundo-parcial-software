import 'package:flutter/material.dart';
import '../models/project_model.dart';
import '../services/auth_service.dart';
import '../services/project_service.dart';
import 'spectator_canvas_screen.dart';
import 'chat_screen.dart';
import 'sessions_history_screen.dart';

class ProjectViewScreen extends StatefulWidget {
  final ProjectModel project;
  final AuthService authService;

  const ProjectViewScreen({
    super.key,
    required this.project,
    required this.authService,
  });

  @override
  State<ProjectViewScreen> createState() => _ProjectViewScreenState();
}

class _ProjectViewScreenState extends State<ProjectViewScreen> {
  int _currentIndex = 0;
  late ProjectService _projectService;

  @override
  void initState() {
    super.initState();
    _projectService = ProjectService(token: widget.authService.token);
  }

  /// Prueba explícita en vivo de la Regla Inviolable 1 y S4-5 (DoD: intento de escritura desde móvil devuelve 403)
  Future<void> _verifyServerSideEnforcement() async {
    final status = await _projectService.attemptDiagramWrite(widget.project.roomId, {
      'classes': [{'name': 'ClasePruebaIlegal', 'x': 0, 'y': 0}],
      'relationships': [],
    });

    if (!mounted) return;

    if (status == 403) {
      showDialog(
        context: context,
        builder: (_) => AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          title: const Row(
            children: [
              Icon(Icons.shield_outlined, color: Color(0xFF10B981)),
              SizedBox(width: 8),
              Text('Enforcement 403 OK', style: TextStyle(color: Colors.white, fontSize: 16)),
            ],
          ),
          content: const Text(
            'El servidor rechazó exitosamente el intento de escritura con código 403 Forbidden.\n\n'
            'Regla Inviolable 1 & S4-5 comprobada: El cliente móvil es estrictamente de solo lectura.',
            style: TextStyle(color: Color(0xFFCBD5E1), fontSize: 13),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Entendido', style: TextStyle(color: Color(0xFF818CF8))),
            ),
          ],
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Respuesta del servidor: $status'),
          backgroundColor: Colors.amber,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.project.nombre,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            Row(
              children: [
                const Icon(Icons.remove_red_eye_outlined, size: 12, color: Color(0xFF38BDF8)),
                const SizedBox(width: 4),
                Text(
                  'Modo Espectador (${widget.project.myRole})',
                  style: const TextStyle(fontSize: 10, color: Color(0xFF38BDF8)),
                ),
              ],
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.security, color: Color(0xFF38BDF8), size: 20),
            tooltip: 'Verificar Seguridad (403 Enforcement)',
            onPressed: _verifyServerSideEnforcement,
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: [
          SpectatorCanvasScreen(
            roomId: widget.project.roomId,
            token: widget.authService.token,
          ),
          ChatScreen(
            projectId: widget.project.id,
            token: widget.authService.token,
          ),
          SessionsHistoryScreen(
            projectId: widget.project.id,
            token: widget.authService.token,
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        backgroundColor: const Color(0xFF0F172A),
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        selectedItemColor: const Color(0xFF818CF8),
        unselectedItemColor: Colors.white38,
        selectedLabelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
        unselectedLabelStyle: const TextStyle(fontSize: 11),
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard_outlined),
            activeIcon: Icon(Icons.dashboard),
            label: 'Lienzo UML',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.chat_bubble_outline),
            activeIcon: Icon(Icons.chat_bubble),
            label: 'Chat Grupal',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history_outlined),
            activeIcon: Icon(Icons.history),
            label: 'Historial',
          ),
        ],
      ),
    );
  }
}
