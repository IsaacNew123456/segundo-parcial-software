import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProjectMember {
  id: number;
  user: {
    id: number;
    email: string;
    nombre: string;
    username: string;
  };
  rol: 'designer' | 'collaborator' | 'viewer';
  joined_at: string;
}

export interface Project {
  id: number;
  nombre: string;
  room_id: string;
  owner: {
    id: number;
    email: string;
    nombre: string;
    username: string;
  };
  created_at: string;
  updated_at: string;
  my_role: 'designer' | 'collaborator' | 'viewer';
  members_count: number;
  members: ProjectMember[];
}

export interface ChatMessage {
  id: number;
  project_id: number;
  session_id?: number;
  author_id?: number;
  author_name: string;
  author_type: 'user' | 'ai';
  content: string;
  intent: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private http = inject(HttpClient);

  public projects = signal<Project[]>([]);
  public currentProject = signal<Project | null>(null);
  public loading = signal<boolean>(false);
  public error = signal<string | null>(null);

  loadProjects(): Observable<Project[]> {
    this.loading.set(true);
    this.error.set(null);
    const url = `${environment.endpoint_python}api/projects/`;
    return this.http.get<Project[]>(url).pipe(
      tap({
        next: (data) => {
          this.projects.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.error || 'Error al cargar proyectos.');
          this.loading.set(false);
        }
      })
    );
  }

  createProject(nombre: string): Observable<Project> {
    this.loading.set(true);
    const url = `${environment.endpoint_python}api/projects/`;
    return this.http.post<Project>(url, { nombre }).pipe(
      tap({
        next: (newProj) => {
          this.projects.update(list => [newProj, ...list]);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.error || 'Error al crear proyecto.');
          this.loading.set(false);
        }
      })
    );
  }

  getProject(id: number): Observable<Project> {
    const url = `${environment.endpoint_python}api/projects/${id}/`;
    return this.http.get<Project>(url).pipe(
      tap(proj => this.currentProject.set(proj))
    );
  }

  inviteMember(projectId: number, email: string, rol: string): Observable<any> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/members/`;
    return this.http.post(url, { email, rol }).pipe(
      tap(() => this.getProject(projectId).subscribe())
    );
  }

  updateMemberRole(projectId: number, userId: number, rol: string): Observable<any> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/members/${userId}/`;
    return this.http.patch(url, { rol }).pipe(
      tap(() => this.getProject(projectId).subscribe())
    );
  }

  removeMember(projectId: number, userId: number): Observable<any> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/members/${userId}/`;
    return this.http.delete(url).pipe(
      tap(() => this.getProject(projectId).subscribe())
    );
  }

  getMessages(projectId: number): Observable<ChatMessage[]> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/messages/`;
    return this.http.get<ChatMessage[]>(url);
  }

  sendMessage(projectId: number, content: string): Observable<ChatMessage> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/messages/`;
    return this.http.post<ChatMessage>(url, { content });
  }

  // S3-3 / S3-5: Sesiones e Historial
  getSessions(projectId: number): Observable<ProjectSession[]> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/sessions/`;
    return this.http.get<ProjectSession[]>(url);
  }

  getSessionDetail(projectId: number, sessionId: number): Observable<{ session: ProjectSession; timeline: SessionTimelineItem[]; snapshot: any }> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/sessions/${sessionId}/`;
    return this.http.get<{ session: ProjectSession; timeline: SessionTimelineItem[]; snapshot: any }>(url);
  }

  getSessionSnapshot(projectId: number, sessionId: number): Observable<any> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/sessions/${sessionId}/snapshot/`;
    return this.http.get<any>(url);
  }

  closeSession(projectId: number): Observable<ProjectSession> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/sessions/close/`;
    return this.http.post<ProjectSession>(url, {});
  }

  // S3-1 / S3-2: Normalización
  getNormalizationAudit(projectId: number): Observable<NormalizationReport> {
    const url = `${environment.endpoint_python}api/projects/${projectId}/normalization/`;
    return this.http.get<NormalizationReport>(url);
  }
}

export interface ProjectSession {
  id: number;
  project_id: number;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  summary: string;
  events_count: number;
  messages_count: number;
  duration_minutes: number;
  snapshot?: any;
}

export interface SessionTimelineItem {
  id: string;
  kind: 'event' | 'message';
  tipo?: string;
  actor_id?: number;
  actor_name?: string;
  author_id?: number;
  author_name?: string;
  author_type?: 'user' | 'ai';
  content?: string;
  intent?: string;
  payload?: any;
  created_at: string;
}

export interface NormalizationReport {
  cumple_todas: boolean;
  resumen: string;
  reporte_markdown: string;
  schema?: any;
  clases: Array<{
    clase: string;
    cumple_todas: boolean;
    '1FN': { cumple: boolean; violacion: string; sugerencia: string };
    '2FN': { cumple: boolean; violacion: string; sugerencia: string };
    '3FN': { cumple: boolean; violacion: string; sugerencia: string };
    '4FN': { cumple: boolean; violacion: string; sugerencia: string };
  }>;
}

