import 'package:flutter_test/flutter_test.dart';
import 'package:uml_studio_mobile/main.dart';
import 'package:uml_studio_mobile/services/auth_service.dart';
import 'package:uml_studio_mobile/config/api_config.dart';
import 'package:uml_studio_mobile/models/session_model.dart';
import 'package:uml_studio_mobile/models/diagram_model.dart';

void main() {
  testWidgets('Smoke test app launch', (WidgetTester tester) async {
    final authService = AuthService();
    await tester.pumpWidget(UmlStudioApp(authService: authService));
    expect(find.text('UML STUDIO'), findsOneWidget);
  });

  test('ApiConfig enforces X-Client-Type: mobile in baseHeaders', () {
    final headers = ApiConfig.baseHeaders('test-token');
    expect(headers['X-Client-Type'], 'mobile');
    expect(headers['Authorization'], 'Bearer test-token');
    expect(headers['Content-Type'], 'application/json');
  });

  test('SessionModel deserializes properly', () {
    final json = {
      'id': 1,
      'project': 10,
      'started_at': '2026-10-22T10:00:00Z',
      'ended_at': '2026-10-22T10:45:00Z',
      'is_active': false,
      'summary': 'Resumen de sesión con 3 clases y 2 relaciones.',
      'events_count': 5,
      'messages_count': 8,
      'duration_minutes': 45,
      'snapshot': {
        'classes': [{'name': 'Usuario'}, {'name': 'Rol'}],
        'relationships': []
      }
    };

    final session = SessionModel.fromJson(json);
    expect(session.id, 1);
    expect(session.projectId, 10);
    expect(session.isActive, false);
    expect(session.eventsCount, 5);
    expect(session.messagesCount, 8);
    expect(session.durationMinutes, 45);
    expect(session.summary, contains('Resumen de sesión'));
    expect(session.snapshot?['classes']?.length, 2);
  });

  test('UmlDiagramModel parses classes and relationships', () {
    final data = {
      'data': {
        'classes': [
          {
            'id': 'c1',
            'name': 'Factura',
            'position': {'x': 100, 'y': 200},
            'size': {'width': 180, 'height': 120},
            'attributes': ['+ id: int', '+ total: float'],
            'methods': ['+ calcular(): void']
          }
        ],
        'relationships': [
          {
            'id': 'r1',
            'type': 'association',
            'sourceId': 'c1',
            'targetId': 'c2',
            'labels': ['1', '*']
          }
        ]
      }
    };

    final diagram = UmlDiagramModel.fromJson(data);
    expect(diagram.classes.length, 1);
    expect(diagram.classes.first.name, 'Factura');
    expect(diagram.classes.first.x, 100);
    expect(diagram.classes.first.y, 200);
    expect(diagram.classes.first.attributes.length, 2);
    expect(diagram.relationships.length, 1);
    expect(diagram.relationships.first.sourceId, 'c1');
  });
}
