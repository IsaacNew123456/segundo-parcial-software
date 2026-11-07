import uuid
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Project, ProjectMember, Session, ChatMessage, BackupUML, SessionEvent
from drf_spectacular.utils import extend_schema, OpenApiResponse
from .serializers import (
    ProjectSerializer, ProjectMemberSerializer, ChatMessageSerializer,
    SessionSerializer, SessionEventSerializer, ProjectCreateSerializer,
    ProjectMemberInviteSerializer, ChatMessageCreateSerializer,
    ModeratorRequestSerializer, ModeratorResponseSerializer,
    NormalizationAuditResponseSerializer
)
from .services.session_service import SessionService
from .services.normalization_service import NormalizationService


def get_user_role_in_project(project: Project, user: User):
    """Devuelve el rol del usuario en el proyecto ('designer', 'collaborator', 'viewer') o None si no es miembro."""
    if project.owner_id == user.id:
        return ProjectMember.ROLE_DESIGNER
    member = project.members.filter(user=user).first()
    return member.rol if member else None


class ProjectListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Proyectos (CU14)'],
        summary='Listar proyectos del usuario',
        description='Devuelve la lista de proyectos donde el usuario autenticado es propietario o miembro.',
        responses={200: ProjectSerializer(many=True)}
    )
    def get(self, request):
        user = request.user
        # Proyectos donde el usuario es dueño o miembro
        projects = Project.objects.filter(
            id__in=ProjectMember.objects.filter(user=user).values_list('project_id', flat=True)
        ).distinct()

        serializer = ProjectSerializer(projects, many=True, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['Proyectos (CU14)'],
        summary='Crear un nuevo proyecto',
        description='Crea un nuevo proyecto con su lienzo asociado, asigna al creador como diseñador e inicia una sesión colaborativa.',
        request=ProjectCreateSerializer,
        responses={201: ProjectSerializer, 400: OpenApiResponse(description="Datos inválidos"), 403: OpenApiResponse(description="Acceso denegado (ej. cliente móvil)")}
    )
    def post(self, request):
        # Regla Inviolable 1 y S4-5: El cliente móvil es estrictamente de solo lectura (espectador)
        if request.headers.get('X-Client-Type', '').strip().lower() == 'mobile':
            return Response(
                {"error": "Escritura denegada: El cliente móvil es estrictamente de solo lectura (espectador)."},
                status=status.HTTP_403_FORBIDDEN
            )

        nombre = request.data.get('nombre', '').strip()
        if not nombre:
            return Response({"error": "El nombre del proyecto es requerido."}, status=status.HTTP_400_BAD_REQUEST)

        room_id = uuid.uuid4()

        # 1. Crear el proyecto
        project = Project.objects.create(
            nombre=nombre,
            room_id=room_id,
            owner=request.user
        )

        # 2. Agregar al creador como miembro con rol 'designer'
        ProjectMember.objects.create(
            project=project,
            user=request.user,
            rol=ProjectMember.ROLE_DESIGNER
        )

        # 3. Inicializar el lienzo en PostgreSQL asociado al room_id
        BackupUML.objects.create(
            room_id=room_id,
            data={"classes": [], "relationships": []}
        )

        # 4. Iniciar sesión colaborativa base
        Session.objects.create(
            project=project,
            is_active=True,
            snapshot={"classes": [], "relationships": []}
        )

        serializer = ProjectSerializer(project, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ProjectDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Proyectos (CU14)'],
        summary='Detalle del proyecto',
        responses={200: ProjectSerializer, 403: OpenApiResponse(description="No es miembro del proyecto")}
    )
    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        serializer = ProjectSerializer(project, context={'request': request})
        return Response(serializer.data)

    @extend_schema(
        tags=['Proyectos (CU14)'],
        summary='Eliminar proyecto (Solo propietario)',
        responses={204: OpenApiResponse(description="Proyecto eliminado"), 403: OpenApiResponse(description="Solo el propietario")}
    )
    def delete(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        if project.owner_id != request.user.id:
            return Response(
                {"error": "Solo el propietario puede eliminar el proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )
        project.delete()
        return Response({"message": "Proyecto eliminado correctamente."}, status=status.HTTP_204_NO_CONTENT)


class ProjectMemberInviteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Miembros (CU14)'],
        summary='Invitar miembro al proyecto',
        description='Asigna o actualiza el rol de un miembro por correo electrónico o ID. Solo el diseñador/propietario puede invitar.',
        request=ProjectMemberInviteSerializer,
        responses={201: ProjectMemberSerializer, 200: ProjectMemberSerializer, 403: OpenApiResponse(description="Permiso denegado")}
    )
    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        my_role = get_user_role_in_project(project, request.user)

        # Validación estricta en servidor: Solo diseñadores pueden invitar miembros
        if my_role != ProjectMember.ROLE_DESIGNER:
            return Response(
                {"error": "Solo los usuarios con rol Diseñador pueden invitar miembros."},
                status=status.HTTP_403_FORBIDDEN
            )

        email = request.data.get('email', '').strip().lower()
        rol = request.data.get('rol', ProjectMember.ROLE_COLLABORATOR)

        if not email:
            return Response({"error": "Debe especificar el correo del miembro a invitar."}, status=status.HTTP_400_BAD_REQUEST)

        valid_roles = [ProjectMember.ROLE_DESIGNER, ProjectMember.ROLE_COLLABORATOR, ProjectMember.ROLE_VIEWER]
        if rol not in valid_roles:
            rol = ProjectMember.ROLE_COLLABORATOR

        target_user = User.objects.filter(email__iexact=email).first()
        if not target_user:
            # Fallback por username
            target_user = User.objects.filter(username__iexact=email).first()

        if not target_user:
            return Response(
                {"error": f"No se encontró ningún usuario registrado con el correo '{email}'."},
                status=status.HTTP_404_NOT_FOUND
            )

        # Si ya es miembro, actualizar rol
        member, created = ProjectMember.objects.update_or_create(
            project=project,
            user=target_user,
            defaults={'rol': rol}
        )

        return Response({
            "message": "Miembro añadido correctamente" if created else "Rol de miembro actualizado",
            "member": ProjectMemberSerializer(member).data
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class ProjectMemberDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Miembros (CU14)'],
        summary='Modificar rol de miembro',
        request=ProjectMemberInviteSerializer,
        responses={200: ProjectMemberSerializer, 403: OpenApiResponse(description="Permiso denegado")}
    )
    def patch(self, request, pk, user_id):
        project = get_object_or_404(Project, pk=pk)
        my_role = get_user_role_in_project(project, request.user)

        if my_role != ProjectMember.ROLE_DESIGNER:
            return Response(
                {"error": "Solo los diseñadores pueden modificar roles."},
                status=status.HTTP_403_FORBIDDEN
            )

        target_user = get_object_or_404(User, id=user_id)
        if target_user.id == project.owner_id:
            return Response(
                {"error": "No se puede cambiar el rol del propietario del proyecto."},
                status=status.HTTP_400_BAD_REQUEST
            )

        member = get_object_or_404(ProjectMember, project=project, user=target_user)
        new_role = request.data.get('rol')
        if new_role in [ProjectMember.ROLE_DESIGNER, ProjectMember.ROLE_COLLABORATOR, ProjectMember.ROLE_VIEWER]:
            member.rol = new_role
            member.save()

        return Response(ProjectMemberSerializer(member).data)

    @extend_schema(
        tags=['Miembros (CU14)'],
        summary='Expulsar o salir del proyecto',
        responses={204: OpenApiResponse(description="Miembro removido")}
    )
    def delete(self, request, pk, user_id):
        project = get_object_or_404(Project, pk=pk)
        my_role = get_user_role_in_project(project, request.user)

        # Puede remover si es diseñador o si el usuario decide salir del proyecto él mismo
        if my_role != ProjectMember.ROLE_DESIGNER and request.user.id != user_id:
            return Response(
                {"error": "No tiene permisos para expulsar miembros."},
                status=status.HTTP_403_FORBIDDEN
            )

        if user_id == project.owner_id:
            return Response(
                {"error": "No se puede remover al propietario del proyecto."},
                status=status.HTTP_400_BAD_REQUEST
            )

        member = get_object_or_404(ProjectMember, project=project, user_id=user_id)
        member.delete()
        return Response({"message": "Miembro removido."}, status=status.HTTP_204_NO_CONTENT)


class ProjectMessagesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Chat Grupal (CU15)'],
        summary='Obtener mensajes recientes de chat',
        responses={200: ChatMessageSerializer(many=True), 403: OpenApiResponse(description="No es miembro")}
    )
    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Obtener los últimos 100 mensajes
        messages = project.chat_messages.all()[:100]
        serializer = ChatMessageSerializer(messages, many=True)
        return Response(serializer.data)

    @extend_schema(
        tags=['Chat Grupal (CU15)'],
        summary='Enviar mensaje al chat grupal (con soporte para IA Moderadora)',
        description='Envía un mensaje al chat. Si incluye una orden a la IA (@ia ...), el moderador la procesa y responde.',
        request=ChatMessageCreateSerializer,
        responses={201: ChatMessageSerializer, 400: OpenApiResponse(description="Contenido vacío")}
    )
    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        content = request.data.get('content', '').strip()
        if not content:
            return Response({"error": "El contenido no puede estar vacío."}, status=status.HTTP_400_BAD_REQUEST)

        # Sesión activa
        session = project.sessions.filter(is_active=True).first()
        author_name = request.user.first_name if request.user.first_name else request.user.username

        msg = ChatMessage.objects.create(
            project=project,
            session=session,
            author=request.user,
            author_name=author_name,
            author_type=ChatMessage.AUTHOR_USER,
            content=content,
            intent='chat'
        )

        msg_data = ChatMessageSerializer(msg).data

        # Notificar en tiempo real por el canal WebSocket del chat
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    f"chat_{pk}",
                    {
                        "type": "chat_broadcast",
                        "message": msg_data
                    }
                )
        except Exception as e:
            print("[ProjectMessagesView] Error enviando a channel_layer:", e)

        # Procesar con IA Moderadora si aplica (S2-1 / CU15 / CU16)
        is_mobile = (request.headers.get('X-Client-Type', '').strip().lower() == 'mobile')
        from .services.moderator_service import ModeratorService
        ai_res = ModeratorService.process_chat_message(project.id, request.user, content, is_mobile=is_mobile)
        if ai_res and ai_res.get("is_ai"):
            ai_reply = ai_res.get("reply", "")
            if ai_reply:
                ai_msg = ChatMessage.objects.create(
                    project=project,
                    session=session,
                    author=None,
                    author_name="IA Moderadora",
                    author_type=ChatMessage.AUTHOR_AI,
                    content=ai_reply,
                    intent="moderator"
                )
                ai_msg_data = ChatMessageSerializer(ai_msg).data
                try:
                    if channel_layer:
                        async_to_sync(channel_layer.group_send)(
                            f"chat_{pk}",
                            {
                                "type": "chat_broadcast",
                                "message": ai_msg_data
                            }
                        )
                except Exception as e:
                    print("[ProjectMessagesView] Error enviando broadcast IA:", e)

        return Response(msg_data, status=status.HTTP_201_CREATED)


class ProjectModeratorView(APIView):
    """
    Endpoint REST para invocar directamente a la IA Moderadora (CU16, CU17, S2-7).
    Valida pertenencia, rol de espectador y rechaza mutaciones desde clientes móviles.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['IA Moderadora (CU16, CU17)'],
        summary='Comando directo a la IA Moderadora',
        description='Ejecuta órdenes de mutación, sugerencia, revisión de relaciones o resumen. Los clientes móviles o con rol espectador solo pueden consultar.',
        request=ModeratorRequestSerializer,
        responses={200: ModeratorResponseSerializer, 403: OpenApiResponse(description="Permiso denegado")}
    )
    def post(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        instruction = request.data.get('instruction') or request.data.get('content', '')
        instruction = instruction.strip()
        if not instruction:
            return Response(
                {"error": "Se requiere el campo 'instruction' o 'content'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        is_mobile = (request.headers.get('X-Client-Type', '').strip().lower() == 'mobile')
        prompt_lower = instruction.lower()
        is_query = any(k in prompt_lower for k in ("sugiere", "sugerir", "revisa", "revisar", "resum"))

        # Regla Inviolable 1 y S2-7: El móvil nunca escribe en el diagrama
        if is_mobile and not is_query:
            return Response(
                {"error": "Escritura denegada: El cliente móvil es estrictamente de solo lectura (espectador)."},
                status=status.HTTP_403_FORBIDDEN
            )

        # S2-7: Rechazo de mutaciones para rol espectador
        if role == ProjectMember.ROLE_VIEWER and not is_query:
            return Response(
                {"error": "Permiso denegado: Tu rol es de solo lectura (Espectador)."},
                status=status.HTTP_403_FORBIDDEN
            )

        from .services.moderator_service import ModeratorService
        result = ModeratorService.process_chat_message(project.id, request.user, instruction, is_mobile=is_mobile)

        # Si hubo respuesta, guardarla en el chat y difundirla
        if result and result.get("is_ai") and result.get("reply"):
            session = project.sessions.filter(is_active=True).first()
            ai_msg = ChatMessage.objects.create(
                project=project,
                session=session,
                author=None,
                author_name="IA Moderadora",
                author_type=ChatMessage.AUTHOR_AI,
                content=result["reply"],
                intent="moderator"
            )
            ai_msg_data = ChatMessageSerializer(ai_msg).data
            try:
                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        f"chat_{pk}",
                        {
                            "type": "chat_broadcast",
                            "message": ai_msg_data
                        }
                    )
            except Exception as e:
                print("[ProjectModeratorView] Error enviando broadcast IA:", e)

        return Response(result, status=status.HTTP_200_OK)


class ProjectSessionsListView(APIView):
    """
    S3-3 / S3-5 / CU19: Lista de sesiones históricas y cierre de sesión activa.
    Acceso de solo lectura para todos los miembros (incluido espectador móvil).
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Historial y Sesiones (CU19)'],
        summary='Listar sesiones del proyecto',
        responses={200: SessionSerializer(many=True)}
    )
    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        sessions = project.sessions.all().order_by('-started_at')
        serializer = SessionSerializer(sessions, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(
        tags=['Historial y Sesiones (CU19)'],
        summary='Cerrar la sesión activa del proyecto con snapshot y resumen',
        responses={200: SessionSerializer}
    )
    def post(self, request, pk):
        """Cierra la sesión activa actual del proyecto generando snapshot y resumen."""
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        if role == ProjectMember.ROLE_VIEWER:
            return Response(
                {"error": "Permiso denegado: Los espectadores no pueden gestionar sesiones."},
                status=status.HTTP_403_FORBIDDEN
            )

        closed_session = SessionService.close_session(project)
        if not closed_session:
            return Response({"message": "No había ninguna sesión activa para cerrar."}, status=status.HTTP_200_OK)

        return Response(SessionSerializer(closed_session).data, status=status.HTTP_200_OK)


class ProjectSessionDetailView(APIView):
    """
    S3-5 / CU19: Detalle de una sesión con su línea de tiempo completa.
    Estrictamente de SOLO LECTURA.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Historial y Sesiones (CU19)'],
        summary='Detalle de una sesión histórica con su timeline',
        responses={200: OpenApiResponse(description="Detalle de sesión, timeline y snapshot")}
    )
    def get(self, request, pk, session_id):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        session = get_object_or_404(Session, pk=session_id, project=project)
        session_data = SessionSerializer(session).data
        timeline = SessionService.get_session_timeline(session)
        snapshot = SessionService.get_session_snapshot(session)

        return Response({
            "session": session_data,
            "timeline": timeline,
            "snapshot": snapshot
        }, status=status.HTTP_200_OK)

    def put(self, request, pk, session_id):
        return Response({"error": "El historial es de solo lectura y no puede modificarse."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    def delete(self, request, pk, session_id):
        return Response({"error": "El historial es de solo lectura y no puede eliminarse."}, status=status.HTTP_405_METHOD_NOT_ALLOWED)


class ProjectSessionSnapshotView(APIView):
    """
    S3-7: Vista del diagrama en el momento exacto de una sesión (snapshot JSON).
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Historial y Sesiones (CU19)'],
        summary='Snapshot del diagrama UML de una sesión',
        responses={200: OpenApiResponse(description="Diagrama UML JSON en el momento de la sesión")}
    )
    def get(self, request, pk, session_id):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        session = get_object_or_404(Session, pk=session_id, project=project)
        snapshot = SessionService.get_session_snapshot(session)
        return Response(snapshot, status=status.HTTP_200_OK)


class ProjectNormalizationAuditView(APIView):
    """
    S3-1 / S3-2 / CU18: Auditoría de normalización relacional 1FN a 4FN del proyecto.
    Consulta de solo lectura abierta a todos los miembros.
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=['Normalización Relacional (CU18)'],
        summary='Auditar normalización 1FN–4FN del diagrama UML',
        description='Evalúa el diagrama actual contra 1FN, 2FN, 3FN y 4FN, devolviendo un reporte por clase y sugerencias.',
        responses={200: NormalizationAuditResponseSerializer}
    )
    def get(self, request, pk):
        project = get_object_or_404(Project, pk=pk)
        role = get_user_role_in_project(project, request.user)
        if not role:
            return Response(
                {"error": "Acceso denegado: No es miembro de este proyecto."},
                status=status.HTTP_403_FORBIDDEN
            )

        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        data = backup.data if backup and isinstance(backup.data, dict) else {"classes": [], "relationships": []}

        audit_res = NormalizationService.audit_normalization(data)
        return Response(audit_res, status=status.HTTP_200_OK)



