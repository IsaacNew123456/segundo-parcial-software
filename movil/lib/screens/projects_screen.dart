import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/project_service.dart';
import '../models/project_model.dart';
import 'project_view_screen.dart';
import 'login_screen.dart';

class ProjectsScreen extends StatefulWidget {
  final AuthService authService;

  const ProjectsScreen({super.key, required this.authService});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  late ProjectService _projectService;
  List<ProjectModel> _projects = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _projectService = ProjectService(token: widget.authService.token);
    _loadProjects();
  }

  Future<void> _loadProjects() async {
    setState(() => _isLoading = true);
    final list = await _projectService.getProjects();
    if (mounted) {
      setState(() {
        _projects = list;
        _isLoading = false;
      });
    }
  }

  void _logout() async {
    await widget.authService.logout();
    if (mounted) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => LoginScreen(authService: widget.authService)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.authService.currentUser;

    return Scaffold(
      backgroundColor: const Color(0xFF020617), // slate-950
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A), // slate-900
        elevation: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'UML STUDIO',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            if (user != null)
              Text(
                user.nombre.isNotEmpty ? user.nombre : user.email,
                style: const TextStyle(fontSize: 11, color: Colors.white54),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh, color: Colors.white70),
            onPressed: _loadProjects,
            tooltip: 'Actualizar',
          ),
          IconButton(
            icon: const Icon(Icons.logout, color: Color(0xFFF43F5E)),
            onPressed: _logout,
            tooltip: 'Cerrar sesión',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: Color(0xFF6366F1)),
            )
          : _projects.isEmpty
              ? Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.folder_open, size: 54, color: Colors.white.withOpacity(0.2)),
                      const SizedBox(height: 12),
                      const Text(
                        'No perteneces a ningún proyecto aún',
                        style: TextStyle(color: Colors.white70, fontSize: 14),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Pide a un diseñador que te invite a su grupo',
                        style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12),
                      ),
                    ],
                  ),
                )
              : RefreshIndicator(
                  color: const Color(0xFF6366F1),
                  onRefresh: _loadProjects,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                    itemCount: _projects.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final project = _projects[index];
                      return _buildProjectCard(project);
                    },
                  ),
                ),
    );
  }

  Widget _buildProjectCard(ProjectModel project) {
    Color badgeColor;
    String badgeText;

    if (project.myRole == 'designer') {
      badgeColor = const Color(0xFFA855F7); // purple
      badgeText = 'Diseñador';
    } else if (project.myRole == 'collaborator') {
      badgeColor = const Color(0xFF10B981); // emerald
      badgeText = 'Colaborador';
    } else {
      badgeColor = const Color(0xFFF59E0B); // amber
      badgeText = 'Espectador';
    }

    return InkWell(
      onTap: () {
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (_) => ProjectViewScreen(
              project: project,
              authService: widget.authService,
            ),
          ),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFF1E293B)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Role Badge
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: badgeColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: badgeColor.withOpacity(0.35)),
                  ),
                  child: Text(
                    badgeText,
                    style: TextStyle(color: badgeColor, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ),

                // Members
                Row(
                  children: [
                    Icon(Icons.people_outline, size: 14, color: Colors.white.withOpacity(0.4)),
                    const SizedBox(width: 4),
                    Text(
                      '${project.membersCount}',
                      style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 11),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 12),

            Text(
              project.nombre,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),

            Row(
              children: [
                Text(
                  'Room: ',
                  style: TextStyle(fontSize: 10, color: Colors.white.withOpacity(0.35), fontFamily: 'monospace'),
                ),
                Expanded(
                  child: Text(
                    project.roomId,
                    style: TextStyle(
                      fontSize: 10,
                      color: const Color(0xFF818CF8).withOpacity(0.8),
                      fontFamily: 'monospace',
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const Icon(Icons.chevron_right, color: Colors.white38, size: 18),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
