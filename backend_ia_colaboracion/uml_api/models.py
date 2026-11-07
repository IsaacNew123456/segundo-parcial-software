import uuid
from django.db import models
from django.contrib.auth.models import User

# Modelo para persistir el diagrama UML asociado a una sala UUID (heredado del Primer Parcial)
class BackupUML(models.Model):
    room_id = models.UUIDField(unique=True)
    data = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return str(self.room_id)


# Modelo de Proyecto (Segundo Parcial)
class Project(models.Model):
    nombre = models.CharField(max_length=150)
    room_id = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='owned_projects')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.nombre} ({self.room_id})"


# Miembros y roles por proyecto
class ProjectMember(models.Model):
    ROLE_DESIGNER = 'designer'
    ROLE_COLLABORATOR = 'collaborator'
    ROLE_VIEWER = 'viewer'

    ROLE_CHOICES = [
        (ROLE_DESIGNER, 'Diseñador'),
        (ROLE_COLLABORATOR, 'Colaborador'),
        (ROLE_VIEWER, 'Espectador'),
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='project_memberships')
    rol = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_COLLABORATOR)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('project', 'user')
        ordering = ['joined_at']

    def __str__(self):
        return f"{self.user.username} - {self.project.nombre} ({self.rol})"


# Sesiones de trabajo colaborativo
class Session(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='sessions')
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    snapshot = models.JSONField(default=dict, blank=True)
    summary = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-started_at']

    def __str__(self):
        return f"Sesión {self.id} - {self.project.nombre} ({'Activa' if self.is_active else 'Cerrada'})"


# Mensajes del chat grupal del proyecto
class ChatMessage(models.Model):
    AUTHOR_USER = 'user'
    AUTHOR_AI = 'ai'

    AUTHOR_TYPE_CHOICES = [
        (AUTHOR_USER, 'Usuario'),
        (AUTHOR_AI, 'IA'),
    ]

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='messages', null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='chat_messages')
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='chat_messages')
    author_name = models.CharField(max_length=150, blank=True)
    author_type = models.CharField(max_length=10, choices=AUTHOR_TYPE_CHOICES, default=AUTHOR_USER)
    content = models.TextField()
    intent = models.CharField(max_length=50, default='chat', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.author_type}] {self.author_name}: {self.content[:30]}"


# Trazabilidad de eventos de sesión sobre el diagrama
class SessionEvent(models.Model):
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='events')
    tipo = models.CharField(max_length=50)  # 'class_add', 'class_update', 'link_add', etc.
    payload = models.JSONField(default=dict, blank=True)
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.tipo} en sesión {self.session_id}"
