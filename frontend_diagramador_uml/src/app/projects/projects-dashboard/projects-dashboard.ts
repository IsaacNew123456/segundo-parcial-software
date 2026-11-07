import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectService, Project, ProjectMember } from '../../../services/project/project.service';
import { AuthService } from '../../../services/auth/auth.service';
import { SessionsHistoryModal } from '../sessions-history/sessions-history';
import { InteractiveManualModalComponent } from '../../components/interactive-manual-modal/interactive-manual-modal';

@Component({
  selector: 'app-projects-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, SessionsHistoryModal, InteractiveManualModalComponent],
  templateUrl: './projects-dashboard.html'
})
export class ProjectsDashboard implements OnInit {
  public projectService = inject(ProjectService);
  public authService = inject(AuthService);
  private router = inject(Router);

  // Modales
  showCreateModal = signal<boolean>(false);
  newProjectName = signal<string>('');

  showMembersModal = signal<boolean>(false);
  selectedProject = signal<Project | null>(null);

  showSessionsModal = signal<boolean>(false);
  sessionsProject = signal<Project | null>(null);

  showManualModal = signal<boolean>(false);

  inviteEmail = signal<string>('');
  inviteRole = signal<'designer' | 'collaborator' | 'viewer'>('collaborator');
  inviteError = signal<string | null>(null);
  inviteSuccess = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
      return;
    }
    this.projectService.loadProjects().subscribe();
  }

  openCreateModal(): void {
    this.newProjectName.set('');
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  createProject(): void {
    const name = this.newProjectName().trim();
    if (!name) return;

    this.projectService.createProject(name).subscribe({
      next: (proj) => {
        this.closeCreateModal();
        this.openDiagram(proj);
      },
      error: (err) => {
        alert(err?.error?.error || 'Error al crear proyecto.');
      }
    });
  }

  openDiagram(project: Project): void {
    this.router.navigate(['/diagram', project.room_id], {
      queryParams: { projectId: project.id }
    });
  }

  openMembers(project: Project): void {
    this.selectedProject.set(project);
    this.inviteEmail.set('');
    this.inviteRole.set('collaborator');
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    this.showMembersModal.set(true);
  }

  closeMembersModal(): void {
    this.showMembersModal.set(false);
    this.selectedProject.set(null);
  }

  openSessions(project: Project): void {
    this.sessionsProject.set(project);
    this.showSessionsModal.set(true);
  }

  closeSessionsModal(): void {
    this.showSessionsModal.set(false);
    this.sessionsProject.set(null);
  }

  openManual(): void {
    this.showManualModal.set(true);
  }

  closeManual(): void {
    this.showManualModal.set(false);
  }

  inviteMember(): void {
    const proj = this.selectedProject();
    const email = this.inviteEmail().trim();
    if (!proj || !email) return;

    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    this.projectService.inviteMember(proj.id, email, this.inviteRole()).subscribe({
      next: (res) => {
        this.inviteSuccess.set(res?.message || 'Miembro añadido correctamente.');
        this.inviteEmail.set('');
        // Recargar proyecto para actualizar lista de miembros
        this.projectService.getProject(proj.id).subscribe(updated => {
          this.selectedProject.set(updated);
        });
        this.projectService.loadProjects().subscribe();
      },
      error: (err) => {
        this.inviteError.set(err?.error?.error || 'Error al invitar miembro.');
      }
    });
  }

  changeRole(userId: number, event: any): void {
    const proj = this.selectedProject();
    const newRole = event.target.value;
    if (!proj) return;

    this.projectService.updateMemberRole(proj.id, userId, newRole).subscribe({
      next: () => {
        this.projectService.getProject(proj.id).subscribe(updated => {
          this.selectedProject.set(updated);
        });
      }
    });
  }

  removeMember(userId: number): void {
    const proj = this.selectedProject();
    if (!proj || !confirm('¿Estás seguro de remover a este miembro?')) return;

    this.projectService.removeMember(proj.id, userId).subscribe({
      next: () => {
        this.projectService.getProject(proj.id).subscribe(updated => {
          this.selectedProject.set(updated);
        });
        this.projectService.loadProjects().subscribe();
      }
    });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}
