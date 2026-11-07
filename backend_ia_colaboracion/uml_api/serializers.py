from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Project, ProjectMember, Session, ChatMessage, SessionEvent

class UserSerializer(serializers.ModelSerializer):
    nombre = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'nombre']

    def get_nombre(self, obj):
        return obj.first_name if obj.first_name else obj.username


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=6)
    nombre = serializers.CharField(write_only=True, required=False, default='')

    class Meta:
        model = User
        fields = ['email', 'password', 'nombre']

    def validate_email(self, value):
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("Este correo ya se encuentra registrado.")
        return normalized

    def create(self, validated_data):
        email = validated_data['email'].strip().lower()
        password = validated_data['password']
        nombre = validated_data.get('nombre', '').strip()
        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=nombre
        )
        return user


class ProjectMemberSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True, required=False)
    email = serializers.EmailField(write_only=True, required=False)

    class Meta:
        model = ProjectMember
        fields = ['id', 'user', 'user_id', 'email', 'rol', 'joined_at']


class ProjectSerializer(serializers.ModelSerializer):
    owner = UserSerializer(read_only=True)
    members = ProjectMemberSerializer(many=True, read_only=True)
    my_role = serializers.SerializerMethodField()
    members_count = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ['id', 'nombre', 'room_id', 'owner', 'created_at', 'updated_at', 'my_role', 'members_count', 'members']
        read_only_fields = ['id', 'room_id', 'owner', 'created_at', 'updated_at']

    def get_my_role(self, obj):
        request = self.context.get('request')
        if not request or not request.user or not request.user.is_authenticated:
            return None
        if obj.owner_id == request.user.id:
            return ProjectMember.ROLE_DESIGNER
        member = obj.members.filter(user=request.user).first()
        return member.rol if member else None

    def get_members_count(self, obj):
        return obj.members.count()


class ChatMessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatMessage
        fields = ['id', 'project_id', 'session_id', 'author_id', 'author_name', 'author_type', 'content', 'intent', 'created_at']
        read_only_fields = ['id', 'created_at']


class SessionEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = SessionEvent
        fields = ['id', 'session_id', 'tipo', 'payload', 'actor_id', 'actor_name', 'created_at']
        read_only_fields = ['id', 'created_at']

    def get_actor_name(self, obj):
        if obj.actor:
            return obj.actor.first_name if obj.actor.first_name else obj.actor.username
        return "Sistema / IA"


class SessionSerializer(serializers.ModelSerializer):
    events_count = serializers.SerializerMethodField()
    messages_count = serializers.SerializerMethodField()
    duration_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            'id', 'project_id', 'started_at', 'ended_at', 'is_active',
            'summary', 'events_count', 'messages_count', 'duration_minutes', 'snapshot'
        ]
        read_only_fields = ['id', 'started_at', 'ended_at', 'is_active', 'snapshot']

    def get_events_count(self, obj):
        return obj.events.count()

    def get_messages_count(self, obj):
        return obj.messages.count()

    def get_duration_minutes(self, obj):
        from django.utils import timezone
        end = obj.ended_at or timezone.now()
        diff = (end - obj.started_at).total_seconds() / 60.0
        return round(diff, 1)


# Serializers complementarios para documentación OpenAPI / Swagger
class LoginRequestSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True, help_text="Correo electrónico registrado")
    password = serializers.CharField(required=True, write_only=True, help_text="Contraseña")


class TokenResponseSerializer(serializers.Serializer):
    access = serializers.CharField(help_text="Token JWT de acceso")
    refresh = serializers.CharField(help_text="Token JWT de refresco")
    user = UserSerializer(help_text="Datos del usuario autenticado")


class ProfileUpdateSerializer(serializers.Serializer):
    nombre = serializers.CharField(required=False, help_text="Nombre para mostrar")
    password = serializers.CharField(required=False, min_length=6, write_only=True, help_text="Nueva contraseña (opcional)")


class ProjectCreateSerializer(serializers.Serializer):
    nombre = serializers.CharField(required=True, help_text="Nombre del proyecto UML")


class ProjectMemberInviteSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False, help_text="Correo del usuario a invitar")
    user_id = serializers.IntegerField(required=False, help_text="ID de usuario alternativo")
    rol = serializers.ChoiceField(
        choices=ProjectMember.ROLE_CHOICES,
        default=ProjectMember.ROLE_COLLABORATOR,
        help_text="Rol asignado ('designer', 'collaborator', 'viewer')"
    )


class ChatMessageCreateSerializer(serializers.Serializer):
    content = serializers.CharField(required=True, help_text="Contenido del mensaje de chat o comando a la IA (@ia ...)")


class ModeratorRequestSerializer(serializers.Serializer):
    instruction = serializers.CharField(required=True, help_text="Instrucción en lenguaje natural dirigida a la IA Moderadora")


class ModeratorResponseSerializer(serializers.Serializer):
    is_ai = serializers.BooleanField()
    reply = serializers.CharField()
    mutation = serializers.JSONField(required=False)
    suggestions = serializers.ListField(required=False)


class NormalizationAuditResponseSerializer(serializers.Serializer):
    cumple_todas = serializers.BooleanField(help_text="Indica si todo el modelo cumple 1FN–4FN")
    reporte_markdown = serializers.CharField(help_text="Reporte detallado en formato Markdown")
    clases = serializers.ListField(help_text="Detalle estructurado por clase")


class GenerateUMLRequestSerializer(serializers.Serializer):
    prompt = serializers.CharField(required=True, help_text="Prompt para generar o modificar clases")
    currentDiagram = serializers.JSONField(required=False, help_text="Diagrama JSON actual")


