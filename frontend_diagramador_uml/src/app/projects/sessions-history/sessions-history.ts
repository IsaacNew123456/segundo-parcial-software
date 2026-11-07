import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectService, Project, ProjectSession, SessionTimelineItem } from '../../../services/project/project.service';

@Component({
  selector: 'app-sessions-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sessions-history.html'
})
export class SessionsHistoryModal implements OnInit {
  private projectService = inject(ProjectService);

  @Input({ required: true }) project!: Project;
  @Output() close = new EventEmitter<void>();

  sessions = signal<ProjectSession[]>([]);
  selectedSession = signal<ProjectSession | null>(null);
  timeline = signal<SessionTimelineItem[]>([]);
  snapshotData = signal<any>(null);
  loading = signal<boolean>(false);
  activeTab = signal<'timeline' | 'snapshot'>('timeline');

  ngOnInit(): void {
    this.loadSessions();
  }

  loadSessions(): void {
    this.loading.set(true);
    this.projectService.getSessions(this.project.id).subscribe({
      next: (data) => {
        this.sessions.set(data);
        if (data.length > 0) {
          this.selectSession(data[0]);
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  selectSession(session: ProjectSession): void {
    this.selectedSession.set(session);
    this.loading.set(true);
    this.projectService.getSessionDetail(this.project.id, session.id).subscribe({
      next: (res) => {
        this.timeline.set(res.timeline);
        this.snapshotData.set(res.snapshot);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  closeActiveSession(): void {
    if (!confirm('¿Deseas cerrar la sesión activa actual y capturar su snapshot definitivo?')) return;
    this.projectService.closeSession(this.project.id).subscribe({
      next: () => {
        this.loadSessions();
      }
    });
  }
}
