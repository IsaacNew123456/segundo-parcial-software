from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import GenerateUMLView, set_backupUML, get_backupUML, analyze_uml_image, generar_flutter
from .views_auth import RegisterView, LoginView, UserProfileView
from .views_projects import (
    ProjectListCreateView,
    ProjectDetailView,
    ProjectMemberInviteView,
    ProjectMemberDetailView,
    ProjectMessagesView,
    ProjectModeratorView,
    ProjectSessionsListView,
    ProjectSessionDetailView,
    ProjectSessionSnapshotView,
    ProjectNormalizationAuditView,
)

urlpatterns = [
    # Auth (CU13)
    path('auth/register/', RegisterView.as_view(), name='auth-register'),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/profile/', UserProfileView.as_view(), name='auth-profile'),

    # Projects & Members (CU14)
    path('projects/', ProjectListCreateView.as_view(), name='projects-list-create'),
    path('projects/<int:pk>/', ProjectDetailView.as_view(), name='project-detail'),
    path('projects/<int:pk>/members/', ProjectMemberInviteView.as_view(), name='project-members-invite'),
    path('projects/<int:pk>/members/<int:user_id>/', ProjectMemberDetailView.as_view(), name='project-member-detail'),

    # Chat Messages (CU15)
    path('projects/<int:pk>/messages/', ProjectMessagesView.as_view(), name='project-messages'),

    # IA Moderadora (CU16, CU17, S2-7)
    path('projects/<int:pk>/moderator/', ProjectModeratorView.as_view(), name='project-moderator'),

    # Historial y Sesiones (CU19, S3-3, S3-5, S3-7)
    path('projects/<int:pk>/sessions/', ProjectSessionsListView.as_view(), name='project-sessions-list'),
    path('projects/<int:pk>/sessions/<int:session_id>/', ProjectSessionDetailView.as_view(), name='project-session-detail'),
    path('projects/<int:pk>/sessions/<int:session_id>/snapshot/', ProjectSessionSnapshotView.as_view(), name='project-session-snapshot'),

    # Normalización Relacional 1FN–4FN (CU18, S3-1, S3-2)
    path('projects/<int:pk>/normalization/', ProjectNormalizationAuditView.as_view(), name='project-normalization-audit'),

    # Heredado Primer Parcial (CU1-CU12)
    path('chatbot/', GenerateUMLView.as_view(), name='generate-uml'),
    path("set_backup_uml/<uuid:room_id>/", set_backupUML, name="backup_uml-id"),
    path("get_backup_uml/<uuid:room_id>/", get_backupUML, name="backup_uml-id"),
    path("uml_from_image/", analyze_uml_image, name="uml-from-image"),
    path("generar_flutter/", generar_flutter, name="generar-flutter"),
]
