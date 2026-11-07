import uuid
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from uml_api.models import Project, ProjectMember, BackupUML, Session, ChatMessage
from uml_api.services.moderator_service import ModeratorService


class Sprint4MobileSpectatorTests(TestCase):
    """
    Pruebas automatizadas para el Sprint 4:
    - S4-1: Autenticación compartida con las mismas credenciales
    - S4-2 & S4-3: Acceso de lectura al lienzo y actualización
    - S4-4: Chat de consulta (resumen por IA) e historial
    - S4-5: Enforcement estricto en servidor: 403 a toda escritura desde cliente móvil
    - Regla Inviolable 1: El móvil nunca escribe en el diagrama.
    """

    def setUp(self):
        self.client = APIClient()
        self.password = "Password123!"

        # Crear usuarios para web y móvil
        self.designer = User.objects.create_user(
            username="designer4@example.com",
            email="designer4@example.com",
            password=self.password,
            first_name="Diseñador Principal"
        )
        self.mobile_user = User.objects.create_user(
            username="espectador_movil@example.com",
            email="espectador_movil@example.com",
            password=self.password,
            first_name="Espectador Móvil"
        )

        # Crear proyecto
        self.room_id = uuid.uuid4()
        self.project = Project.objects.create(
            nombre="Proyecto Móvil Espectador",
            room_id=self.room_id,
            owner=self.designer
        )

        # Membresía del espectador móvil
        ProjectMember.objects.create(
            project=self.project,
            user=self.mobile_user,
            rol=ProjectMember.ROLE_VIEWER
        )

        # Lienzo inicial
        self.initial_data = {
            "classes": [
                {
                    "id": "c1",
                    "name": "Cliente",
                    "attributes": ["+ id: int", "+ nombre: string"],
                    "methods": [],
                    "x": 100,
                    "y": 100
                },
                {
                    "id": "c2",
                    "name": "Factura",
                    "attributes": ["+ id: int", "+ total: float"],
                    "methods": [],
                    "x": 300,
                    "y": 100
                }
            ],
            "relationships": [
                {
                    "id": "r1",
                    "type": "association",
                    "sourceId": "c1",
                    "targetId": "c2",
                    "labels": ["1", "*"]
                }
            ]
        }
        BackupUML.objects.create(room_id=self.room_id, data=self.initial_data)

        # Obtener tokens JWT
        res_login = self.client.post("/api/auth/login/", {
            "email": "espectador_movil@example.com",
            "password": self.password
        })
        self.assertEqual(res_login.status_code, status.HTTP_200_OK)
        self.mobile_token = res_login.data["access"]

    def test_s4_1_shared_authentication(self):
        """S4-1 / DoD: El mismo usuario inicia sesión en web y móvil con las mismas credenciales."""
        # 1. Login exitoso desde cliente web
        web_res = self.client.post("/api/auth/login/", {
            "email": "espectador_movil@example.com",
            "password": self.password
        })
        self.assertEqual(web_res.status_code, status.HTTP_200_OK)
        self.assertIn("access", web_res.data)

        # 2. Login exitoso desde cliente móvil (con header X-Client-Type: mobile)
        mobile_res = self.client.post(
            "/api/auth/login/",
            {"email": "espectador_movil@example.com", "password": self.password},
            HTTP_X_CLIENT_TYPE="mobile"
        )
        self.assertEqual(mobile_res.status_code, status.HTTP_200_OK)
        self.assertEqual(mobile_res.data["user"]["email"], "espectador_movil@example.com")

    def test_s4_5_server_enforces_403_on_mobile_canvas_write(self):
        """S4-5 / DoD / Regla Inviolable 1: Todo intento de escritura en el lienzo desde móvil devuelve 403."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.mobile_token}")

        # Intento de modificar el lienzo mediante POST /api/set_backup_uml/ con header móvil
        write_payload = {
            "classes": [{"id": "c3", "name": "ClaseHacker", "attributes": [], "methods": []}],
            "relationships": []
        }
        res = self.client.post(
            f"/api/set_backup_uml/{self.room_id}/",
            write_payload,
            format="json",
            HTTP_X_CLIENT_TYPE="mobile"
        )

        # Debe responder 403 FORBIDDEN
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Escritura denegada", res.data["error"])

        # Verificar que el diagrama en BD NO fue alterado
        backup = BackupUML.objects.get(room_id=self.room_id)
        class_names = [c["name"] for c in backup.data["classes"]]
        self.assertNotIn("ClaseHacker", class_names)

    def test_s4_5_server_enforces_403_on_mobile_project_creation(self):
        """S4-5: El cliente móvil es espectador y no puede crear proyectos."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.mobile_token}")
        res = self.client.post(
            "/api/projects/",
            {"nombre": "Proyecto Ilegal Móvil"},
            format="json",
            HTTP_X_CLIENT_TYPE="mobile"
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_s4_2_mobile_can_read_canvas(self):
        """S4-2: El cliente móvil puede leer y obtener el lienzo sin restricciones."""
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.mobile_token}")
        res = self.client.get(
            f"/api/get_backup_uml/{self.room_id}/",
            HTTP_X_CLIENT_TYPE="mobile"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["classes"]), 2)

    def test_s4_4_mobile_can_query_ai_moderator_summary_and_audit(self):
        """S4-4: Chat de consulta desde móvil: @ia resume el lienzo y auditoría están permitidas."""
        # 1. Resumen desde móvil
        res_summary = ModeratorService.process_chat_message(
            self.project.id,
            self.mobile_user,
            "@ia resume el lienzo",
            is_mobile=True
        )
        self.assertTrue(res_summary["is_ai"])
        self.assertIn("Resumen", res_summary["reply"])
        self.assertIn("Cliente", res_summary["reply"])

        # 2. ¿Qué avanzamos hoy? desde móvil
        res_today = ModeratorService.process_chat_message(
            self.project.id,
            self.mobile_user,
            "@ia ¿qué avanzamos hoy?",
            is_mobile=True
        )
        self.assertTrue(res_today["is_ai"])
        self.assertIn("Resumen", res_today["reply"])

        # 3. Auditoría de normalización desde móvil
        res_norm = ModeratorService.process_chat_message(
            self.project.id,
            self.mobile_user,
            "@ia audita normalizacion",
            is_mobile=True
        )
        self.assertTrue(res_norm["is_ai"])
        self.assertIn("Normalización", res_norm["reply"])

    def test_s4_5_moderator_rejects_mutations_from_mobile(self):
        """S4-5: Si un cliente móvil solicita una mutación a la IA, se rechaza indicando rol espectador."""
        # Intento de agregar clase desde móvil
        res = ModeratorService.process_chat_message(
            self.project.id,
            self.mobile_user,
            "@ia agrega la clase Factura con id, fecha y total",
            is_mobile=True
        )
        self.assertTrue(res["is_ai"])
        self.assertIn("exclusivamente de solo lectura", res["reply"])

        # Intento de confirmar sugerencia desde móvil
        res_confirm = ModeratorService.process_chat_message(
            self.project.id,
            self.mobile_user,
            "@ia confirma la sugerencia 1",
            is_mobile=True
        )
        self.assertTrue(res_confirm["is_ai"])
        self.assertIn("exclusivamente de solo lectura", res_confirm["reply"])

    def test_s4_4_mobile_can_view_session_history_and_snapshot(self):
        """S4-4 / CU19: El cliente móvil puede consultar el historial de sesiones y snapshots en modo lectura."""
        # Crear una sesión cerrada con snapshot
        Session.objects.create(
            project=self.project,
            is_active=False,
            summary="Sesión de prueba cerrada con 2 clases.",
            snapshot=self.initial_data
        )

        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.mobile_token}")
        res = self.client.get(
            f"/api/projects/{self.project.id}/sessions/",
            HTTP_X_CLIENT_TYPE="mobile"
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["summary"], "Sesión de prueba cerrada con 2 clases.")
