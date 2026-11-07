import 'package:flutter/material.dart';
import '../models/diagram_model.dart';
import '../services/project_service.dart';
import '../services/canvas_socket_service.dart';

/// Pantalla del Lienzo en Modo Espectador (CU21 / S4-2 / S4-3 / S4-5).
/// Solo Lectura: Permite Zoom y Desplazamiento (Pan).
/// Se actualiza en tiempo real vía WebSocket sin recargar.
class SpectatorCanvasScreen extends StatefulWidget {
  final String roomId;
  final String? token;

  const SpectatorCanvasScreen({
    super.key,
    required this.roomId,
    this.token,
  });

  @override
  State<SpectatorCanvasScreen> createState() => _SpectatorCanvasScreenState();
}

class _SpectatorCanvasScreenState extends State<SpectatorCanvasScreen> {
  late ProjectService _projectService;
  late CanvasSocketService _canvasSocket;
  UmlDiagramModel? _diagram;
  bool _isLoading = true;
  bool _isWsConnected = false;

  @override
  void initState() {
    super.initState();
    _projectService = ProjectService(token: widget.token);
    _canvasSocket = CanvasSocketService();

    _loadDiagram();
    _connectWebSocket();
  }

  void _connectWebSocket() {
    _canvasSocket.connect(widget.roomId);

    // S4-3: Actualización en tiempo real del lienzo por WebSocket
    _canvasSocket.onDiagramUpdate.listen((_) {
      if (mounted) {
        _loadDiagram(silent: true);
      }
    });

    _canvasSocket.onError.listen((err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(err),
            backgroundColor: const Color(0xFFEF4444),
            duration: const Duration(seconds: 3),
          ),
        );
      }
    });

    setState(() {
      _isWsConnected = _canvasSocket.isConnected;
    });
  }

  Future<void> _loadDiagram({bool silent = false}) async {
    if (!silent) {
      setState(() => _isLoading = true);
    }
    final d = await _projectService.getDiagram(widget.roomId);
    if (mounted) {
      setState(() {
        _diagram = d;
        _isLoading = false;
        _isWsConnected = _canvasSocket.isConnected;
      });
    }
  }

  @override
  void dispose() {
    _canvasSocket.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A), // slate-900 canvas bg
      body: Stack(
        children: [
          // Canvas Area con Pan y Zoom (S4-2)
          _isLoading
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
              : (_diagram == null || _diagram!.classes.isEmpty)
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.dashboard_outlined, size: 48, color: Colors.white.withOpacity(0.2)),
                          const SizedBox(height: 12),
                          const Text(
                            'El lienzo se encuentra vacío',
                            style: TextStyle(color: Colors.white70, fontSize: 13),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Los cambios hechos en la web aparecerán aquí en tiempo real.',
                            style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11),
                          ),
                        ],
                      ),
                    )
                  : InteractiveViewer(
                      boundaryMargin: const EdgeInsets.all(1000),
                      minScale: 0.2,
                      maxScale: 3.0,
                      child: SizedBox(
                        width: 2500,
                        height: 2500,
                        child: CustomPaint(
                          painter: DiagramPainter(diagram: _diagram!),
                          child: Stack(
                            children: _diagram!.classes.map((c) => _buildClassWidget(c)).toList(),
                          ),
                        ),
                      ),
                    ),

          // Top Floating Spectator Banner (RNF1 / Regla 1 / S4-2 / S4-3)
          Positioned(
            top: 12,
            left: 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF020617).withOpacity(0.92),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFF334155)),
                boxShadow: [
                  BoxShadow(color: Colors.black.withOpacity(0.4), blurRadius: 10),
                ],
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.visibility, size: 16, color: Color(0xFF38BDF8)),
                      const SizedBox(width: 8),
                      const Text(
                        'MODO ESPECTADOR',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: const Color(0xFF38BDF8).withOpacity(0.12),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: const Text(
                          'Solo Lectura',
                          style: TextStyle(color: Color(0xFF38BDF8), fontSize: 9, fontWeight: FontWeight.bold),
                        ),
                      ),
                      const SizedBox(width: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: (_isWsConnected ? const Color(0xFF10B981) : Colors.amber).withOpacity(0.15),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 5,
                              height: 5,
                              decoration: BoxDecoration(
                                color: _isWsConnected ? const Color(0xFF10B981) : Colors.amber,
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              _isWsConnected ? 'En vivo' : 'Conectando...',
                              style: TextStyle(
                                color: _isWsConnected ? const Color(0xFF10B981) : Colors.amber,
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                  IconButton(
                    icon: const Icon(Icons.sync, color: Colors.white70, size: 18),
                    onPressed: () => _loadDiagram(),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    tooltip: 'Sincronizar Lienzo',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildClassWidget(UmlClassModel umlClass) {
    return Positioned(
      left: umlClass.x,
      top: umlClass.y,
      child: Container(
        width: umlClass.width > 0 ? umlClass.width : 160,
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B), // slate-800
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: const Color(0xFF4F46E5), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.35),
              blurRadius: 8,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Class Name Header
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
              decoration: const BoxDecoration(
                color: Color(0xFF312E81), // indigo-900
                borderRadius: BorderRadius.vertical(top: Radius.circular(8)),
              ),
              child: Text(
                umlClass.name,
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
                textAlign: TextAlign.center,
              ),
            ),

            // Attributes Compartment
            Container(
              padding: const EdgeInsets.all(8),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: Color(0xFF334155), width: 1)),
              ),
              child: umlClass.attributes.isEmpty
                  ? Text(
                      'sin atributos',
                      style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10, fontStyle: FontStyle.italic),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: umlClass.attributes
                          .map((a) => Text(
                                a,
                                style: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 10, fontFamily: 'monospace'),
                              ))
                          .toList(),
                    ),
            ),

            // Methods Compartment
            Container(
              padding: const EdgeInsets.all(8),
              child: umlClass.methods.isEmpty
                  ? Text(
                      'sin métodos',
                      style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10, fontStyle: FontStyle.italic),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: umlClass.methods
                          .map((m) => Text(
                                m,
                                style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 10, fontFamily: 'monospace'),
                              ))
                          .toList(),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class DiagramPainter extends CustomPainter {
  final UmlDiagramModel diagram;

  DiagramPainter({required this.diagram});

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF818CF8) // indigo-400
      ..strokeWidth = 1.8
      ..style = PaintingStyle.stroke;

    final classMap = {for (var c in diagram.classes) c.id: c};

    for (var rel in diagram.relationships) {
      final src = classMap[rel.sourceId];
      final tgt = classMap[rel.targetId];

      if (src != null && tgt != null) {
        final p1 = Offset(src.x + src.width / 2, src.y + src.height / 2);
        final p2 = Offset(tgt.x + tgt.width / 2, tgt.y + tgt.height / 2);
        canvas.drawLine(p1, p2, paint);
      }
    }
  }

  @override
  bool shouldRepaint(covariant DiagramPainter oldDelegate) => true;
}
