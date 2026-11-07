import uuid
from django.test import TestCase
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from .models import Project, ProjectMember, Session, ChatMessage, BackupUML


class Sprint1Tests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Usuario 1 (Diseñador)
        self.user1 = User.objects.create_user(
            username="jairo@test.com",
            email="jairo@test.com",
            password="password123",
            first_name="Jairo Camacho"
        )

        # Usuario 2 (Colaborador / Espectador)
        self.user2 = User.objects.create_user(
            username="maria@test.com",
            email="maria@test.com",
            password="password123",
            first_name="Maria Lopez"
        )

        # Usuario 3 (Externo / No miembro)
        self.user3 = User.objects.create_user(
            username="externo@test.com",
            email="externo@test.com",
            password="password123",
            first_name="Usuario Externo"
        )

    def test_s1_1_registro_y_login_jwt(self):
        # 1. Registro
        res_reg = self.client.post('/api/auth/register/', {
            "email": "nuevo@test.com",
            "password": "secreto123",
            "nombre": "Nuevo Usuario"
        })
        self.assertEqual(res_reg.status_code, status.HTTP_201_CREATED)
        self.assertIn("access", res_reg.data)
        self.assertIn("refresh", res_reg.data)
        self.assertEqual(res_reg.data["user"]["email"], "nuevo@test.com")

        # 2. Login
        res_login = self.client.post('/api/auth/login/', {
            "email": "jairo@test.com",
            "password": "password123"
        })
        self.assertEqual(res_login.status_code, status.HTTP_200_OK)
        self.assertIn("access", res_login.data)
        token = res_login.data["access"]

        # 3. Perfil autenticado
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        res_profile = self.client.get('/api/auth/profile/')
        self.assertEqual(res_profile.status_code, status.HTTP_200_OK)
        self.assertEqual(res_profile.data["email"], "jairo@test.com")

    def test_s1_2_crear_proyecto_y_membresia(self):
        # Login como user1
        self.client.force_authenticate(user=self.user1)

        res = self.client.post('/api/projects/', {
            "nombre": "Sistema de Ventas UML"
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        project_id = res.data["id"]
        room_id = res.data["room_id"]
        self.assertEqual(res.data["my_role"], "designer")

        # Verificar que se creó BackupUML y Session automáticamente
        self.assertTrue(BackupUML.objects.filter(room_id=room_id).exists())
        self.assertTrue(Session.objects.filter(project_id=project_id, is_active=True).exists())

        # Listar proyectos: user1 debe verlo
        res_list = self.client.get('/api/projects/')
        self.assertEqual(len(res_list.data), 1)

        # user2 no es miembro aún, no debe ver este proyecto
        self.client.force_authenticate(user=self.user2)
        res_list_u2 = self.client.get('/api/projects/')
        self.assertEqual(len(res_list_u2.data), 0)

    def test_s1_3_invitar_miembros_y_roles(self):
        # user1 crea proyecto
        self.client.force_authenticate(user=self.user1)
        res_proj = self.client.post('/api/projects/', {"nombre": "CASE UML"})
        project_id = res_proj.data["id"]

        # user1 invita a user2 como colaborador
        res_inv = self.client.post(f'/api/projects/{project_id}/members/', {
            "email": "maria@test.com",
            "rol": "collaborator"
        })
        self.assertEqual(res_inv.status_code, status.HTTP_201_CREATED)

        # Ahora user2 debe ver el proyecto en su lista con rol collaborator
        self.client.force_authenticate(user=self.user2)
        res_u2_proj = self.client.get('/api/projects/')
        self.assertEqual(len(res_u2_proj.data), 1)
        self.assertEqual(res_u2_proj.data[0]["my_role"], "collaborator")

        # user2 intenta invitar (no es diseñador) -> Debe recibir 403
        res_unauth_inv = self.client.post(f'/api/projects/{project_id}/members/', {
            "email": "externo@test.com",
            "rol": "viewer"
        })
        self.assertEqual(res_unauth_inv.status_code, status.HTTP_403_FORBIDDEN)

    def test_s1_4_permisos_servidor_y_escritura_movil(self):
        # user1 crea proyecto
        self.client.force_authenticate(user=self.user1)
        res_proj = self.client.post('/api/projects/', {"nombre": "Hospital UML"})
        project_id = res_proj.data["id"]
        room_id = res_proj.data["room_id"]

        # Invitar a user2 como 'viewer' (espectador)
        self.client.post(f'/api/projects/{project_id}/members/', {
            "email": "maria@test.com",
            "rol": "viewer"
        })

        # 1. user1 (designer) puede escribir en el lienzo
        res_write1 = self.client.post(f'/api/set_backup_uml/{room_id}/', {
            "classes": [{"name": "Paciente"}],
            "relationships": []
        }, format='json')
        self.assertEqual(res_write1.status_code, status.HTTP_200_OK)

        # 2. user2 (viewer) intenta escribir en el lienzo -> Recibe 403 FORBIDDEN
        self.client.force_authenticate(user=self.user2)
        res_write2 = self.client.post(f'/api/set_backup_uml/{room_id}/', {
            "classes": [{"name": "Hack"}],
            "relationships": []
        }, format='json')
        self.assertEqual(res_write2.status_code, status.HTTP_403_FORBIDDEN)

        # 3. user3 (no miembro) intenta leer o escribir -> Recibe 403 FORBIDDEN
        self.client.force_authenticate(user=self.user3)
        res_get_unauth = self.client.get(f'/api/get_backup_uml/{room_id}/')
        self.assertEqual(res_get_unauth.status_code, status.HTTP_403_FORBIDDEN)
        res_set_unauth = self.client.post(f'/api/set_backup_uml/{room_id}/', {"data": 123}, format='json')
        self.assertEqual(res_set_unauth.status_code, status.HTTP_403_FORBIDDEN)

        # 4. Regla RNF1 / Regla 1: Cliente móvil NUNCA escribe -> Recibe 403
        self.client.force_authenticate(user=self.user1)
        res_mobile_write = self.client.post(
            f'/api/set_backup_uml/{room_id}/',
            {"classes": []},
            format='json',
            HTTP_X_CLIENT_TYPE='mobile'
        )
        self.assertEqual(res_mobile_write.status_code, status.HTTP_403_FORBIDDEN)

    def test_s1_5_chat_grupal_rest(self):
        # Crear proyecto
        self.client.force_authenticate(user=self.user1)
        res_proj = self.client.post('/api/projects/', {"nombre": "Ecommerce"})
        project_id = res_proj.data["id"]

        # Enviar mensaje
        res_msg = self.client.post(f'/api/projects/{project_id}/messages/', {
            "content": "¡Hola equipo, bienvenidos al proyecto!"
        })
        self.assertEqual(res_msg.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_msg.data["content"], "¡Hola equipo, bienvenidos al proyecto!")

        # Obtener mensajes
        res_list = self.client.get(f'/api/projects/{project_id}/messages/')
        self.assertEqual(res_list.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_list.data), 1)

    def test_retrocompatibilidad_parcial_1(self):
        # Lienzo anónimo (sin proyecto) de Parcial 1 sigue funcionando sin autenticación
        anon_room = uuid.uuid4()
        self.client.force_authenticate(user=None)  # No autenticado

        res_anon_write = self.client.post(f'/api/set_backup_uml/{anon_room}/', {
            "classes": [{"name": "Legacy"}],
            "relationships": []
        }, format='json')
        self.assertEqual(res_anon_write.status_code, status.HTTP_201_CREATED)

        res_anon_read = self.client.get(f'/api/get_backup_uml/{anon_room}/')
        self.assertEqual(res_anon_read.status_code, status.HTTP_200_OK)
        self.assertEqual(res_anon_read.data["classes"][0]["name"], "Legacy")
