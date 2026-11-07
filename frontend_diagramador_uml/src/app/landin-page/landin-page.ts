import { Component, OnInit, PLATFORM_ID, Inject, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { v4 as uuid } from 'uuid';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BackupService } from '../../services/exports/backup.service';
import { AuthService } from '../../services/auth/auth.service';
import { AuthModal } from '../auth/auth-modal/auth-modal';

@Component({
  selector: 'app-landin-page',
  standalone: true,
  imports: [CommonModule, FormsModule, AuthModal],
  templateUrl: './landin-page.html',
  styleUrls: ['./landin-page.css']
})
export class LandinPage implements OnInit {
  public authService = inject(AuthService);
  private router = inject(Router);
  private backupService = inject(BackupService);

  showAuthModal = signal<boolean>(false);
  joinCode: string = '';
  recentRooms: string[] = [];
  errorMessage: string = '';
  isVerifying: boolean = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadRecentRooms();
    }
  }

  loadRecentRooms(): void {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('diagram-'));
      this.recentRooms = keys.map(k => k.replace('diagram-', '')).slice(-4).reverse();
    } catch (e) {
      console.warn('No se pudieron cargar salas recientes', e);
    }
  }

  private isValidUUID(code: string): boolean {
    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidPattern.test(code.trim());
  }

  crearNuevoLienzo(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/projects']);
      return;
    }

    const roomId = uuid();
    // Registrar sala en PostgreSQL inicializada limpia
    this.backupService.setBackupUml(roomId, { classes: [], relationships: [] }).subscribe({
      next: () => console.log('Sala registrada en PostgreSQL:', roomId),
      error: (e) => console.warn('Aviso creación inicial de sala:', e)
    });
    this.router.navigate(['/diagram', roomId]);
  }

  unirseAlLienzo(): void {
    this.errorMessage = '';
    const code = this.joinCode.trim();

    if (!code) return;

    if (!this.isValidUUID(code)) {
      this.errorMessage = 'Código inválido (debe ser un formato UUID válido).';
      return;
    }

    this.router.navigate(['/diagram', code]);
  }

  abrirSala(roomId: string): void {
    this.router.navigate(['/diagram', roomId]);
  }

  abrirProyectos(): void {
    this.router.navigate(['/projects']);
  }

  openLogin(): void {
    this.showAuthModal.set(true);
  }

  closeLogin(): void {
    this.showAuthModal.set(false);
  }

  onAuthSuccess(): void {
    this.showAuthModal.set(false);
    this.router.navigate(['/projects']);
  }

  logout(): void {
    this.authService.logout();
  }

  cerrarAlerta(): void {
    this.errorMessage = '';
  }
}
