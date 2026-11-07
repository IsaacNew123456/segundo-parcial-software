import uuid
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from .models import Project, ProjectMember, Session, ChatMessage, SessionEvent, BackupUML
from .services.normalization_service import NormalizationService
from .services.session_service import SessionService
from .services.moderator_service import ModeratorService


class Sprint3Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario Diseñador
        self.designer = User.objects.create_user(
            username="designer_s3@test.com",
            email="designer_s3@test.com",
            password="password123",
            first_name="Jairo"
        )

        # Usuario Espectador
        self.viewer = User.objects.create_user(
            username="viewer_s3@test.com",
            email="viewer_s3@test.com",
            password="password123",
            first_name="Carlos"
        )

        # Proyecto y lienzo
        self.project = Project.objects.create(
            nombre="Proyecto UML Sprint 3 Normalización",
            owner=self.designer,
            room_id=uuid.uuid4()
        )

        ProjectMember.objects.create(
            project=self.project,
            user=self.viewer,
            rol=ProjectMember.ROLE_VIEWER
        )

        # Diagrama con relaciones
        self.backup = BackupUML.objects.create(
            room_id=self.project.room_id,
            data={
                "classes": [
                    {
                        "id": "c-factura",
                        "name": "Factura",
                        "attributes": [
                            {"name": "id", "type": "int"},
                            {"name": "numero", "type": "string"},
                            {"name": "fecha", "type": "date"}
                        ],
                        "methods": []
                    },
                    {
                        "id": "c-cliente",
                        "name": "Cliente",
                        "attributes": [
                            {"name": "id", "type": "int"},
                            {"name": "nombre", "type": "string"},
                            {"name": "email", "type": "string"}
                        ],
                        "methods": []
                    }
                ],
                "relationships": [
                    {
                        "id": "rel-1",
                        "type": "association",
                        "sourceId": "c-cliente",
                        "targetId": "c-factura",
                        "labels": ["1", "*"]
                    }
                ]
            }
        )

    def test_s3_1_convertidor_uml_a_esquema_relacional(self):
        """S3-1: Convierte clases y relaciones UML a tablas relacionales con PKs y FKs."""
        schema = NormalizationService.uml_to_relational_schema(self.backup.data)
        tables = schema.get("tables", {})

        # 1. Verificar creación de tablas
        self.assertIn("factura", tables)
        self.assertIn("cliente", tables)

        # 2. Clave primaria en cliente y factura
        self.assertEqual(tables["cliente"]["primary_key"], ["id"])
        self.assertEqual(tables["factura"]["primary_key"], ["id"])

        # 3. Foreign Key: Relación 1 a * de Cliente a Factura debe colocar FK en 'factura'
        factura_fks = tables["factura"]["foreign_keys"]
        self.assertTrue(any(fk["references_table"] == "cliente" for fk in factura_fks))

    def test_s3_2_auditoria_normalizacion_1fn_a_4fn(self):
        """S3-2: Evalúa y reporta cumplimiento de 1FN a 4FN con sugerencias asistidas."""
        # 1. Modelo con violaciones:
        # - 1FN: Cliente con 'telefonos' multivaluado
        # - 3FN: Cliente con 'ciudad' dependiente de 'codigo_postal'
        unnormalized_diagram = {
            "classes": [
                {
                    "id": "c-bad",
                    "name": "Cliente",
                    "attributes": [
                        {"name": "id", "type": "int"},
                        {"name": "telefonos", "type": "string"},
                        {"name": "codigo_postal", "type": "string"},
                        {"name": "ciudad", "type": "string"}
                    ],
                    "methods": []
                }
            ],
            "relationships": []
        }

        audit_bad = NormalizationService.audit_normalization(unnormalized_diagram)
        self.assertFalse(audit_bad["cumple_todas"])
        clase_rep = audit_bad["clases"][0]

        # 1FN violada por telefonos
        self.assertFalse(clase_rep["1FN"]["cumple"])
        self.assertIn("telefonos", clase_rep["1FN"]["violacion"])

        # 3FN violada por ciudad y codigo_postal
        self.assertFalse(clase_rep["3FN"]["cumple"])
        self.assertIn("codigo_postal", clase_rep["3FN"]["violacion"])

        # 2. Modelo normalizado:
        audit_good = NormalizationService.audit_normalization(self.backup.data)
        self.assertTrue(audit_good["cumple_todas"])
        self.assertIn("1FN–4FN", audit_good["reporte_markdown"])

    def test_s3_3_and_s3_7_gestion_sesiones_cierre_y_snapshot(self):
        """S3-3 y S3-7: Apertura de sesión, cierre con snapshot de diagrama y resumen."""
        # 1. Abrir sesión
        session = SessionService.get_or_create_active_session(self.project)
        self.assertTrue(session.is_active)

        # 2. Registrar evento en la sesión
        SessionEvent.objects.create(
            session=session,
            tipo="class_add",
            payload={"name": "Factura"},
            actor=self.designer
        )

        # 3. Cerrar sesión
        closed = SessionService.close_session(self.project, session.id)
        self.assertFalse(closed.is_active)
        self.assertIsNotNone(closed.ended_at)
        self.assertIn("Factura", str(closed.snapshot))
        self.assertGreater(len(closed.summary), 10)

        # S3-7: Recuperar snapshot
        snapshot = SessionService.get_session_snapshot(closed)
        self.assertIn("classes", snapshot)
        self.assertEqual(len(snapshot["classes"]), 2)

    def test_s3_4_vinculo_eventos_y_chat_con_sesion(self):
        """S3-4: Registro de session_events y su vínculo con chat_messages en la sesión."""
        session = SessionService.get_or_create_active_session(self.project)

        # Crear mensaje de chat y evento
        msg = ChatMessage.objects.create(
            project=self.project,
            session=session,
            author=self.designer,
            author_name="Jairo",
            author_type=ChatMessage.AUTHOR_USER,
            content="@ia resume el lienzo",
            intent="resumir"
        )
        ev = SessionEvent.objects.create(
            session=session,
            tipo="summary_request",
            payload={"query": "@ia resume el lienzo"},
            actor=self.designer
        )

        self.assertEqual(msg.session_id, session.id)
        self.assertEqual(ev.session_id, session.id)

        # Verificar en timeline unificado
        timeline = SessionService.get_session_timeline(session)
        self.assertEqual(len(timeline), 2)
        kinds = [item["kind"] for item in timeline]
        self.assertIn("message", kinds)
        self.assertIn("event", kinds)

    def test_s3_5_api_historial_sesiones_solo_lectura(self):
        """S3-5: Endpoints de historial de sesiones y verificación de solo lectura."""
        session = SessionService.get_or_create_active_session(self.project)
        SessionService.close_session(self.project, session.id)

        self.client.force_authenticate(user=self.viewer)

        # 1. Listar sesiones
        res_list = self.client.get(f'/api/projects/{self.project.id}/sessions/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(res_list.data), 1)

        # 2. Detalle de sesión con timeline
        res_detail = self.client.get(f'/api/projects/{self.project.id}/sessions/{session.id}/')
        self.assertEqual(res_detail.status_code, status.HTTP_200_OK)
        self.assertIn("timeline", res_detail.data)
        self.assertIn("snapshot", res_detail.data)

        # 3. Solo lectura: PUT y DELETE deben retornar 405 Method Not Allowed
        res_put = self.client.put(f'/api/projects/{self.project.id}/sessions/{session.id}/', {"summary": "Hacked"})
        self.assertEqual(res_put.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

        res_del = self.client.delete(f'/api/projects/{self.project.id}/sessions/{session.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_s3_6_intencion_resumir_lienzo_por_chat(self):
        """S3-6 y DoD: '@ia resume el lienzo' o '@ia ¿qué avanzamos hoy?' responde resumen coherente."""
        # 1. Diseñador pregunta resumen
        res_sum = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia resume el lienzo"
        )
        self.assertTrue(res_sum.get("is_ai"))
        self.assertIn("Resumen Ejecutivo", res_sum.get("reply", ""))
        self.assertIn("Factura", res_sum.get("reply", ""))
        self.assertIn("Cliente", res_sum.get("reply", ""))

        # 2. Espectador pregunta '¿qué avanzamos hoy?' (disponible para todos los roles)
        res_av = ModeratorService.process_chat_message(
            self.project.id, self.viewer, "@ia ¿qué avanzamos hoy?"
        )
        self.assertTrue(res_av.get("is_ai"))
        self.assertIn("Resumen Ejecutivo", res_av.get("reply", ""))

        # 3. Endpoint REST de auditoría de normalización
        self.client.force_authenticate(user=self.designer)
        res_norm = self.client.get(f'/api/projects/{self.project.id}/normalization/')
        self.assertEqual(res_norm.status_code, status.HTTP_200_OK)
        self.assertIn("cumple_todas", res_norm.data)
        self.assertIn("clases", res_norm.data)

    def test_s3_2_desglose_completo_1fn_a_4fn_y_sin_alterar_lienzo(self):
        """Verifica que la auditoría de normalización desglosa 1FN-4FN con causa y sugerencia, y no altera el lienzo."""
        initial_classes_count = len(self.backup.data["classes"])
        initial_rels_count = len(self.backup.data["relationships"])

        res = ModeratorService.process_chat_message(
            self.project.id, self.designer, "@ia verifica la normalización"
        )
        self.assertTrue(res.get("is_ai"))
        reply = res.get("reply", "")

        # Verificar desglose de las 4 formas normales
        self.assertIn("1FN", reply)
        self.assertIn("2FN", reply)
        self.assertIn("3FN", reply)
        self.assertIn("4FN", reply)
        self.assertIn("Estado:", reply)

        # Verificar que el lienzo NO fue alterado
        self.backup.refresh_from_db()
        self.assertEqual(len(self.backup.data["classes"]), initial_classes_count)
        self.assertEqual(len(self.backup.data["relationships"]), initial_rels_count)
