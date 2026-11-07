import { Component, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../services/auth/auth.service';

@Component({
  selector: 'app-auth-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-modal.html'
})
export class AuthModal {
  public authService = inject(AuthService);

  @Output() close = new EventEmitter<void>();
  @Output() success = new EventEmitter<void>();

  isRegister = signal<boolean>(false);
  email: string = '';
  password: string = '';
  nombre: string = '';
  errorMessage = signal<string | null>(null);
  isLoading = signal<boolean>(false);

  toggleMode(): void {
    this.isRegister.set(!this.isRegister());
    this.errorMessage.set(null);
  }

  onSubmit(): void {
    this.errorMessage.set(null);
    if (!this.email || !this.password) {
      this.errorMessage.set('Por favor completa todos los campos requeridos.');
      return;
    }

    this.isLoading.set(true);

    if (this.isRegister()) {
      this.authService.register({
        email: this.email,
        password: this.password,
        nombre: this.nombre
      }).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.success.emit();
          this.close.emit();
        },
        error: (err) => {
          this.isLoading.set(false);
          const msg = err?.error?.email?.[0] || err?.error?.error || 'Error al registrar usuario.';
          this.errorMessage.set(msg);
        }
      });
    } else {
      this.authService.login({
        email: this.email,
        password: this.password
      }).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.success.emit();
          this.close.emit();
        },
        error: (err) => {
          this.isLoading.set(false);
          const msg = err?.error?.error || 'Credenciales inválidas. Verifica tu correo y contraseña.';
          this.errorMessage.set(msg);
        }
      });
    }
  }
}
