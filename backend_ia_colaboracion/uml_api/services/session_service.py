from django.utils import timezone
from typing import Dict, Any, List
from ..models import Project, Session, SessionEvent, ChatMessage, BackupUML


class SessionService:
    """
    Servicio de Gestión de Sesiones e Historial (CU19 / S3-3 / S3-4 / S3-5 / S3-7).
    - Apertura y cierre de sesiones con snapshot.
    - Registro de eventos y trazabilidad.
    - Generación de resúmenes de sesión.
    - Línea de tiempo unificada (eventos + chat).
    - Historial estrictamente de solo lectura.
    """

    @staticmethod
    def get_or_create_active_session(project: Project) -> Session:
        session = project.sessions.filter(is_active=True).first()
        if not session:
            # Capturar snapshot inicial
            backup = BackupUML.objects.filter(room_id=project.room_id).first()
            snapshot_data = backup.data if backup and isinstance(backup.data, dict) else {"classes": [], "relationships": []}
            session = Session.objects.create(
                project=project,
                is_active=True,
                snapshot=snapshot_data,
                summary="Sesión iniciada."
            )
        return session

    @staticmethod
    def close_session(project: Project, session_id: int = None) -> Session:
        """
        S3-3: Cierra la sesión activa:
        - Captura snapshot exacto del lienzo al cierre.
        - Calcula duración y genera resumen automático.
        - Marca is_active=False y ended_at.
        """
        if session_id:
            session = project.sessions.filter(id=session_id, is_active=True).first()
        else:
            session = project.sessions.filter(is_active=True).first()

        if not session:
            return None

        # 1. Snapshot del diagrama
        backup = BackupUML.objects.filter(room_id=project.room_id).first()
        current_data = backup.data if backup and isinstance(backup.data, dict) else {"classes": [], "relationships": []}
        session.snapshot = current_data

        # 2. Resumen automático de la sesión
        events = session.events.all()
        messages = session.messages.all()

        classes_count = len(current_data.get("classes", []))
        rels_count = len(current_data.get("relationships", []))
        mutations_count = events.filter(tipo__in=["ia_mutation", "class_add", "link_add"]).count()

        summary_text = (
            f"Sesión finalizada con {classes_count} clases y {rels_count} relaciones. "
            f"Se registraron {events.count()} eventos de lienzo y {messages.count()} mensajes en el chat grupal "
            f"({mutations_count} mutaciones aplicadas)."
        )

        session.summary = summary_text
        session.ended_at = timezone.now()
        session.is_active = False
        session.save()

        return session

    @staticmethod
    def get_session_timeline(session: Session) -> List[Dict[str, Any]]:
        """
        S3-5: Genera la línea de tiempo unificada (eventos + mensajes) ordenada cronológicamente.
        """
        timeline = []

        # Eventos del lienzo
        for ev in session.events.all().select_related('actor'):
            actor_name = ev.actor.first_name if ev.actor and ev.actor.first_name else (ev.actor.username if ev.actor else "Sistema / IA")
            timeline.append({
                "id": f"event-{ev.id}",
                "kind": "event",
                "tipo": ev.tipo,
                "actor_id": ev.actor_id,
                "actor_name": actor_name,
                "payload": ev.payload,
                "created_at": ev.created_at.isoformat()
            })

        # Mensajes del chat
        for msg in session.messages.all().select_related('author'):
            author_name = msg.author_name or (msg.author.first_name if msg.author and msg.author.first_name else (msg.author.username if msg.author else "IA Moderadora"))
            timeline.append({
                "id": f"msg-{msg.id}",
                "kind": "message",
                "author_id": msg.author_id,
                "author_name": author_name,
                "author_type": msg.author_type,
                "content": msg.content,
                "intent": msg.intent,
                "created_at": msg.created_at.isoformat()
            })

        # Ordenar por fecha de creación ascendente
        timeline.sort(key=lambda x: x["created_at"])
        return timeline

    @staticmethod
    def get_session_snapshot(session: Session) -> Dict[str, Any]:
        """
        S3-7: Retorna el snapshot guardado del diagrama en el momento de la sesión.
        """
        if session.snapshot and isinstance(session.snapshot, dict) and (session.snapshot.get("classes") or session.snapshot.get("relationships")):
            return session.snapshot

        # Si está activa y aún no guardó snapshot de cierre, devolver el estado del lienzo actual
        backup = BackupUML.objects.filter(room_id=session.project.room_id).first()
        return backup.data if backup and isinstance(backup.data, dict) else {"classes": [], "relationships": []}
