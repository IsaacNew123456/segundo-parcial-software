import 'package:flutter/material.dart';
import 'services/auth_service.dart';
import 'screens/login_screen.dart';
import 'screens/projects_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final authService = AuthService();
  await authService.init();

  runApp(UmlStudioApp(authService: authService));
}

class UmlStudioApp extends StatelessWidget {
  final AuthService authService;

  const UmlStudioApp({super.key, required this.authService});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'UML Studio Móvil',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF020617),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF4F46E5),
          secondary: Color(0xFF818CF8),
          surface: Color(0xFF0F172A),
        ),
        useMaterial3: true,
      ),
      home: authService.isAuthenticated
          ? ProjectsScreen(authService: authService)
          : LoginScreen(authService: authService),
    );
  }
}
