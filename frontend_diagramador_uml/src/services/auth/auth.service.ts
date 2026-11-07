import { Injectable, signal, computed, PLATFORM_ID, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserProfile {
  id: number;
  email: string;
  nombre: string;
  username: string;
}

export interface AuthResponse {
  message?: string;
  access: string;
  refresh: string;
  user: UserProfile;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  public token = signal<string | null>(null);
  public refreshToken = signal<string | null>(null);
  public currentUser = signal<UserProfile | null>(null);
  public isAuthenticated = computed(() => !!this.token());

  constructor() {
    if (this.isBrowser) {
      this.loadFromStorage();
    }
  }

  private loadFromStorage(): void {
    try {
      const savedToken = localStorage.getItem('uml_jwt_access');
      const savedRefresh = localStorage.getItem('uml_jwt_refresh');
      const savedUser = localStorage.getItem('uml_jwt_user');

      if (savedToken) this.token.set(savedToken);
      if (savedRefresh) this.refreshToken.set(savedRefresh);
      if (savedUser) this.currentUser.set(JSON.parse(savedUser));
    } catch (e) {
      console.warn('[AuthService] Error cargando sesión local:', e);
    }
  }

  private saveToStorage(access: string, refresh: string, user: UserProfile): void {
    this.token.set(access);
    this.refreshToken.set(refresh);
    this.currentUser.set(user);

    if (this.isBrowser) {
      try {
        localStorage.setItem('uml_jwt_access', access);
        localStorage.setItem('uml_jwt_refresh', refresh);
        localStorage.setItem('uml_jwt_user', JSON.stringify(user));
      } catch (e) {
        console.warn('[AuthService] Error guardando sesión:', e);
      }
    }
  }

  register(data: { email: string; password: string; nombre?: string }): Observable<AuthResponse> {
    const url = `${environment.endpoint_python}api/auth/register/`;
    return this.http.post<AuthResponse>(url, data).pipe(
      tap(res => this.saveToStorage(res.access, res.refresh, res.user))
    );
  }

  login(data: { email: string; password: string }): Observable<AuthResponse> {
    const url = `${environment.endpoint_python}api/auth/login/`;
    return this.http.post<AuthResponse>(url, data).pipe(
      tap(res => this.saveToStorage(res.access, res.refresh, res.user))
    );
  }

  logout(): void {
    this.token.set(null);
    this.refreshToken.set(null);
    this.currentUser.set(null);

    if (this.isBrowser) {
      try {
        localStorage.removeItem('uml_jwt_access');
        localStorage.removeItem('uml_jwt_refresh');
        localStorage.removeItem('uml_jwt_user');
      } catch (e) {
        console.warn('[AuthService] Error al limpiar sesión:', e);
      }
    }
  }
}
