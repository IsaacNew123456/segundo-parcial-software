import json
import asyncio
from urllib.parse import parse_qs
from channels.generic.websocket import AsyncWebsocketConsumer
from uml_api.services.services_gemini import call_gemini_analysis
import re

class CanvasConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"canvas_{self.room_name}"

        # Detectar cliente móvil (Regla Inviolable 1 & S4-5)
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        query_params = parse_qs(query_string)
        client_type_list = query_params.get("client_type", [])
        self.is_mobile = bool(client_type_list and client_type_list[0].lower() == 'mobile')
        headers_dict = dict(self.scope.get("headers", []))
        if b"x-client-type" in headers_dict and headers_dict[b"x-client-type"].decode("utf-8").lower() == "mobile":
            self.is_mobile = True

        # Unir al grupo
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        print(f"[CanvasConsumer] Conexión WebSocket aceptada para sala: {self.room_name}, peer: {self.channel_name}, is_mobile={self.is_mobile}")

        # Enviar mensaje de bienvenida directo a este cliente con su propio ID asignado
        await self.send(text_data=json.dumps({
            "type": "welcome",
            "peer": self.channel_name,
            "room": self.room_name
        }))

        # Notificar presencia al grupo
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "presence",
                "action": "join",
                "peer": self.channel_name
            }
        )

    async def disconnect(self, close_code):
        # Salir del grupo
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        # Notificar salida
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "presence",
                "action": "leave",
                "peer": self.channel_name
            }
        )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except Exception:
            return

        # Heartbeat para proxies en la nube (Nginx / Cloudflare / AWS)
        if data.get("type") == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return

        # Regla Inviolable 1 y S4-5: El cliente móvil es estrictamente de solo lectura (espectador)
        if getattr(self, 'is_mobile', False) and data.get("type") in ("broadcast", "signal"):
            await self.send(text_data=json.dumps({
                "type": "error",
                "code": 403,
                "error": "Escritura denegada: El cliente móvil es estrictamente de solo lectura (espectador)."
            }))
            return

        # Si es un broadcast → enviar a todos en la sala
        if data.get("type") == "broadcast":
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "broadcast_message",
                    "from": self.channel_name,
                    "payload": data.get("payload")
                }
            )

        # Si es una señal directa P2P → mandar al peer específico
        elif data.get("type") == "signal":
            to = data.get("to")
            if to:
                await self.channel_layer.send(
                    to,
                    {
                        "type": "signal_message",
                        "from": self.channel_name,
                        "payload": data.get("payload")
                    }
                )

    # Handlers para los eventos enviados
    async def broadcast_message(self, event):
        # En la nube: no retransmitir al mismo cliente que lo envió (ahorra ancho de banda y evita eco)
        if event.get("from") == self.channel_name:
            return

        await self.send(text_data=json.dumps({
            "type": "broadcast",
            "from": event["from"],
            "payload": event["payload"]
        }))

    async def signal_message(self, event):
        await self.send(text_data=json.dumps({
            "type": "signal",
            "from": event["from"],
            "payload": event["payload"]
        }))

    async def presence(self, event):
        await self.send(text_data=json.dumps({
            "type": "presence",
            "action": event["action"],
            "peer": event["peer"]
        }))


class UMLConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get("action")

        if action == "validate_model":
            uml_json = data.get("uml")

            prompt = f"""
Eres un experto en diseño de bases de datos.
Analiza si las relaciones de este UML son correctas en base a los nombres y atributos.

JSON UML:
{json.dumps(uml_json, indent=2)}
"""

            # Llamada segura y no bloqueante a Gemini en hilo secundario para no congelar el loop de WebSockets
            try:
                raw_output = await asyncio.to_thread(call_gemini_analysis, prompt)
                if isinstance(raw_output, str):
                    raw_output = re.sub(r"^```json\s*|\s*```$", "", raw_output.strip(), flags=re.MULTILINE)
                analysis = json.loads(raw_output)
            except Exception as ex:
                analysis = {
                    "resumen": "Auditoría en espera (Configure GEMINI_API_KEY en .env)",
                    "sugerencias": [],
                    "errores": []
                }

            # Enviar al front
            await self.send(text_data=json.dumps({
                "action": "validation_result",
                "analysis": analysis
            }, ensure_ascii=False))


from urllib.parse import parse_qs
from channels.db import database_sync_to_async
from rest_framework_simplejwt.tokens import AccessToken
from django.contrib.auth.models import User
from uml_api.models import Project, ProjectMember, Session, ChatMessage
from uml_api.serializers import ChatMessageSerializer


class ProjectChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.project_id = self.scope["url_route"]["kwargs"]["project_id"]
        self.room_group_name = f"chat_{self.project_id}"

        # 1. Autenticación por token JWT en Query Params o Headers
        query_string = self.scope.get("query_string", b"").decode("utf-8")
        query_params = parse_qs(query_string)
        token_list = query_params.get("token", [])
        token = token_list[0] if token_list else None
        client_type_list = query_params.get("client_type", [])
        self.is_mobile = bool(client_type_list and client_type_list[0].lower() == 'mobile')
        headers_dict = dict(self.scope.get("headers", []))
        if b"x-client-type" in headers_dict and headers_dict[b"x-client-type"].decode("utf-8").lower() == "mobile":
            self.is_mobile = True

        self.user = None
        self.user_role = None

        if token:
            user, role = await self.authenticate_and_get_role(token, self.project_id)
            if user:
                self.user = user
                self.user_role = role

        # RNF1 / CU15: Si no está autenticado o no es miembro, rechazar conexión
        if not self.user or not self.user_role:
            await self.close(code=4403)
            return

        # Unirse al grupo de chat del proyecto
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        author_name = self.user.first_name if self.user.first_name else self.user.username

        # Mensaje de bienvenida
        await self.send(text_data=json.dumps({
            "type": "welcome",
            "project_id": self.project_id,
            "user": {
                "id": self.user.id,
                "nombre": author_name,
                "rol": self.user_role
            }
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'room_group_name'):
            await self.channel_layer.group_discard(
                self.room_group_name,
                self.channel_name
            )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except Exception:
            return

        msg_type = data.get("type")

        # Heartbeat
        if msg_type == "ping":
            await self.send(text_data=json.dumps({"type": "pong"}))
            return

        if msg_type == "chat_message" or msg_type == "send_message":
            content = data.get("content", "").strip()
            if not content:
                return

            # Guardar el mensaje en BD y asociarlo a la sesión activa
            msg_data = await self.save_chat_message(self.project_id, self.user, content)

            # Difundir en tiempo real a todos los miembros conectados en el proyecto
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "chat_broadcast",
                    "message": msg_data
                }
            )

            # Procesar posible instrucción para la IA Moderadora (S2-1 / CU15 / CU16)
            ai_msg_data = await self.process_moderator_message(self.project_id, self.user, content, self.is_mobile)
            if ai_msg_data:
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        "type": "chat_broadcast",
                        "message": ai_msg_data
                    }
                )

    async def chat_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "message",
            "message": event["message"]
        }))

    @database_sync_to_async
    def process_moderator_message(self, project_id: str, user: User, content: str, is_mobile: bool):
        try:
            from uml_api.services.moderator_service import ModeratorService
            result = ModeratorService.process_chat_message(project_id, user, content, is_mobile=is_mobile)
            if not result or not result.get("is_ai"):
                return None

            reply = result.get("reply", "")
            if not reply:
                return None

            project = Project.objects.filter(id=project_id).first()
            if not project:
                return None
            session = project.sessions.filter(is_active=True).first()

            ai_msg = ChatMessage.objects.create(
                project=project,
                session=session,
                author=None,
                author_name="IA Moderadora",
                author_type=ChatMessage.AUTHOR_AI,
                content=reply,
                intent="moderator"
            )
            return ChatMessageSerializer(ai_msg).data
        except Exception as e:
            print("[ProjectChatConsumer] Error en moderador:", e)
            return None

    @database_sync_to_async
    def authenticate_and_get_role(self, token_str: str, project_id: str):
        try:
            token = AccessToken(token_str)
            user_id = token.get("user_id")
            if not user_id:
                return None, None
            user = User.objects.filter(id=user_id).first()
            if not user:
                return None, None

            # Verificar proyecto y membresía
            project = Project.objects.filter(id=project_id).first()
            if not project:
                return None, None

            if project.owner_id == user.id:
                return user, ProjectMember.ROLE_DESIGNER

            member = project.members.filter(user=user).first()
            if member:
                return user, member.rol

            return None, None
        except Exception:
            return None, None

    @database_sync_to_async
    def save_chat_message(self, project_id: str, user: User, content: str):
        project = Project.objects.get(id=project_id)
        session = project.sessions.filter(is_active=True).first()
        author_name = user.first_name if user.first_name else user.username

        msg = ChatMessage.objects.create(
            project=project,
            session=session,
            author=user,
            author_name=author_name,
            author_type=ChatMessage.AUTHOR_USER,
            content=content,
            intent='chat'
        )
        return ChatMessageSerializer(msg).data

