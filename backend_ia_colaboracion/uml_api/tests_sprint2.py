import uuid
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from .models import Project, ProjectMember, Session, ChatMessage, SessionEvent, BackupUML
from .services.moderator_service import ModeratorService, sanitize_uml_rules


class Sprint2Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario 1: Propietario / Diseñador
        self.designer = User.objects.create_user(
            username="jairo_designer@test.com",
            email="jairo_designer@test.com",
            password="password123",
            first_name="Jairo"
        )

        # Usuario 2: Colaborador
        self.collaborator = User.objects.create_user(
            username="maria_collab@test.com",
            email="maria_collab@test.com",
            password="password123",
            first_name="Maria"
        )

        # Usuario 3: Espectador (solo lectura)
        self.viewer = User.objects.create_user(
            username="carlos_viewer@test.com",
            email="carlos_viewer@test.com",
            password="password123",
            first_name="Carlos"
        )

        # Crear Proyecto
        self.project = Project.objects.create(
            nombre="Proyecto UML Sprint 2",
            owner=self.designer,
            room_id=uuid.uuid4()
        )

        # Crear Sesión Activa
        self.session = Session.objects.create(
            project=self.project,
            is_active=True,
            snapshot={}
        )

        # Crear BackupUML inicial
        self.backup = BackupUML.objects.create(
            room_id=self.project.room_id,
            data={
                "classes": [
                    {
                        "id": "c-docente-1",
                        "name": "Docente",
                        "attributes": [{"name": "id", "type": "int"}, {"name": "nombre", "type": "string"}],
                        "methods": []
                    },
                    {
                        "id": "c-materia-2",
                        "name": "Materia",
                        "attributes": [{"name": "id", "type": "int"}, {"name": "sigla", "type": "string"}],
                        "methods": []
                    }
                ],
                "relationships": []
            }
        )

        # Asociar membresías
        ProjectMember.objects.create(
            project=self.project,
            user=self.collaborator,
            rol=ProjectMember.ROLE_COLLABORATOR
        )
        ProjectMember.objects.create(
            project=self.project,
            user=self.viewer,
            rol=ProjectMember.ROLE_VIEWER
        )

    def test_s2_1_clasificador_de_intencion_y_orden_ambigua(self):
        """S2-1 y DoD: Clasificador de intención y manejo de órdenes ambiguas sin inventar cambios."""
        # 1. Mensaje de chat ordinario entre humanos sin @ia ni comandos
        res_chat = ModeratorService.process_chat_message(
            self.project.id, self.designer, "Hola equipo, ¿cómo están hoy?"
        )
        self.assertFalse(res_chat.get("is_ai"))

        # 2. Orden ambigua: '@ia agrega'
        res_ambiguous = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia agrega"
        )
        self.assertTrue(res_ambiguous.get("is_ai"))
        self.assertIn("ambigua", res_ambiguous.get("reply", "").lower())

        # 3. Orden ambigua: '@ia crea una clase'
        res_ambiguous2 = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia crea una clase"
        )
        self.assertTrue(res_ambiguous2.get("is_ai"))
        self.assertIn("ambigua", res_ambiguous2.get("reply", "").lower())

        # Verificar que el diagrama no fue alterado por órdenes ambiguas
        self.backup.refresh_from_db()
        self.assertEqual(len(self.backup.data["classes"]), 2)

    def test_s2_2_and_s2_4_mutacion_incremental_agrega_clase(self):
        """S2-2, S2-4 y DoD: '@ia agrega la clase Factura con id, fecha y total' sin borrar el resto."""
        res = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia agrega la clase Factura con id, fecha y total"
        )
        self.assertTrue(res.get("is_ai"))
        self.assertIn("Factura", res.get("reply", ""))

        self.backup.refresh_from_db()
        classes = self.backup.data.get("classes", [])
        class_names = [c["name"] for c in classes]

        # Verificar que las clases previas no fueron borradas (edición incremental)
        self.assertIn("Docente", class_names)
        self.assertIn("Materia", class_names)
        self.assertIn("Factura", class_names)

        # Verificar atributos de Factura
        factura = next(c for c in classes if c["name"] == "Factura")
        attr_names = [a["name"] for a in factura.get("attributes", [])]
        self.assertIn("id", attr_names)
        self.assertIn("fecha", attr_names)
        self.assertIn("total", attr_names)

        # Verificar trazabilidad en SessionEvent
        event = SessionEvent.objects.filter(session=self.session, tipo="ia_mutation").first()
        self.assertIsNotNone(event)
        self.assertEqual(event.actor, self.designer)

    def test_s2_3_regla_inviolable_4_sin_multiplicidades_en_herencia(self):
        """S2-3: Regla 4: Herencia y dependencia no admiten multiplicidades (anti-patrón bloqueado y rechazado)."""
        classes = [
            {"id": "1", "name": "Vehiculo", "attributes": []},
            {"id": "2", "name": "Auto", "attributes": []}
        ]
        bad_relationships = [
            {
                "id": "rel-1",
                "type": "generalization",
                "sourceId": "2",
                "targetId": "1",
                "labels": ["1", "*"]  # Multiplicidad inválida en herencia
            },
            {
                "id": "rel-2",
                "type": "dependency",
                "sourceId": "2",
                "targetId": "1",
                "labels": ["0..1", "1..*"]  # Multiplicidad inválida en dependencia
            },
            {
                "id": "rel-3",
                "type": "association",
                "sourceId": "2",
                "targetId": "1",
                "labels": ["1", "*"]  # Asociación válida con multiplicidad
            }
        ]

        valid_classes, sanitized_rels = sanitize_uml_rules(classes, bad_relationships)

        # Herencia y dependencia deben tener labels vacíos
        rel_gen = next(r for r in sanitized_rels if r["type"] == "generalization")
        self.assertEqual(rel_gen["labels"], [])

        rel_dep = next(r for r in sanitized_rels if r["type"] == "dependency")
        self.assertEqual(rel_dep["labels"], [])

        # Asociación conserva sus etiquetas
        rel_assoc = next(r for r in sanitized_rels if r["type"] == "association")
        self.assertEqual(rel_assoc["labels"], ["1", "*"])

        # Verificación explícita de rechazo por chat de la IA al solicitar anti-patrón
        res_antipattern = ModeratorService.process_chat_message(
            self.project.id,
            self.designer,
            "@ia relaciona Docente y Materia por herencia con multiplicidad 1 a *"
        )
        self.assertTrue(res_antipattern.get("is_ai"))
        self.assertIn("anti-patrón", res_antipattern.get("reply", "").lower())
        self.assertIn("no admite multiplicidades", res_antipattern.get("reply", "").lower())

        # El lienzo debe quedar intacto sin relaciones
        self.backup.refresh_from_db()
        self.assertEqual(len(self.backup.data.get("relationships", [])), 0)

    def test_s2_4_mutacion_directa_relacionar_clases(self):
        """S2-4 y DoD: '@ia relaciona Docente con Materia' crea la relación y la anuncia en el chat."""
        res = ModeratorService.process_chat_message(
            self.project.id, self.collaborator, "@ia relaciona Docente con Materia"
        )
        self.assertTrue(res.get("is_ai"))
        self.assertIn("relacionado", res.get("reply", "").lower())

        self.backup.refresh_from_db()
        rels = self.backup.data.get("relationships", [])
        self.assertEqual(len(rels), 1)
        rel = rels[0]
        self.assertEqual(rel["sourceId"], "c-docente-1")
        self.assertEqual(rel["targetId"], "c-materia-2")

    def test_s2_5_flujo_sugerir_confirmar_aplicar(self):
        """S2-5 y DoD: Una sugerencia no modifica el lienzo hasta confirmarla explícitamente."""
        # 1. Solicitar sugerencias
        res_sug = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia sugiere relaciones"
        )
        self.assertTrue(res_sug.get("is_ai"))
        self.assertIn("propongo", res_sug.get("reply", "").lower())
        self.assertIn("suggestions", res_sug)

        # El lienzo no debe haberse modificado aún
        self.backup.refresh_from_db()
        self.assertEqual(len(self.backup.data.get("relationships", [])), 0)

        # Verificar que se guardaron sugerencias en la sesión
        self.session.refresh_from_db()
        pending = self.session.snapshot.get("pending_suggestions", [])
        self.assertGreater(len(pending), 0)

        # 2. Confirmar y aplicar la sugerencia #1
        res_conf = ModeratorService.process_chat_message(
            self.project.id, self.collaborator, "@ia aplica la 1"
        )
        self.assertTrue(res_conf.get("is_ai"))
        self.assertIn("confirmó la sugerencia #1", res_conf.get("reply", ""))

        # Ahora el lienzo SÍ debe contener la relación
        self.backup.refresh_from_db()
        self.assertEqual(len(self.backup.data.get("relationships", [])), 1)

        # Verificar registro de evento link_add
        event = SessionEvent.objects.filter(session=self.session, tipo="link_add").first()
        self.assertIsNotNone(event)
        self.assertEqual(event.actor, self.collaborator)

    def test_s2_6_revision_de_relaciones(self):
        """S2-6: Auditoría de clases huérfanas, dependencias circulares y anti-patrones."""
        # Inicialmente Docente y Materia son clases huérfanas
        res_rev = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia revisa las relaciones"
        )
        self.assertTrue(res_rev.get("is_ai"))
        self.assertIn("huérfanas", res_rev.get("reply", "").lower())

        # Conectar las clases con una relación válida
        self.backup.data["relationships"] = [
            {
                "id": "rel-ok",
                "type": "association",
                "sourceId": "c-docente-1",
                "targetId": "c-materia-2",
                "labels": ["1", "*"]
            }
        ]
        self.backup.save()

        # Revisar de nuevo: debe indicar que no hay anomalías
        res_clean = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia revisa las relaciones"
        )
        self.assertIn("no presenta anomalías", res_clean.get("reply", "").lower())

    def test_s2_7_rechazo_de_mutaciones_para_rol_viewer_y_cliente_movil(self):
        """S2-7 y Regla Inviolable 1: Rechazo de mutaciones para rol viewer y móvil."""
        # 1. Espectador intentando modificar por chat directo
        res_viewer = ModeratorService.process_chat_message(
            self.project.id, self.viewer, "@ia agrega la clase Alumno con id y nombre"
        )
        self.assertTrue(res_viewer.get("is_ai"))
        self.assertIn("solo lectura", res_viewer.get("reply", "").lower())

        # El lienzo no debe contener la clase Alumno
        self.backup.refresh_from_db()
        class_names = [c["name"] for c in self.backup.data["classes"]]
        self.assertNotIn("Alumno", class_names)

        # 2. Cliente móvil intentando mutar por chat
        res_mobile = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia agrega la clase Alumno con id y nombre", is_mobile=True
        )
        self.assertTrue(res_mobile.get("is_ai"))
        self.assertIn("dispositivo móvil", res_mobile.get("reply", "").lower())

        # 3. Endpoint REST /api/projects/{id}/moderator/ con rol viewer -> 403
        self.client.force_authenticate(user=self.viewer)
        res_rest_viewer = self.client.post(f'/api/projects/{self.project.id}/moderator/', {
            "instruction": "@ia agrega la clase Nota"
        })
        self.assertEqual(res_rest_viewer.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Endpoint REST con header móvil -> 403
        self.client.force_authenticate(user=self.designer)
        res_rest_mobile = self.client.post(
            f'/api/projects/{self.project.id}/moderator/',
            {"instruction": "@ia agrega la clase Nota"},
            HTTP_X_CLIENT_TYPE="mobile"
        )
        self.assertEqual(res_rest_mobile.status_code, status.HTTP_403_FORBIDDEN)
