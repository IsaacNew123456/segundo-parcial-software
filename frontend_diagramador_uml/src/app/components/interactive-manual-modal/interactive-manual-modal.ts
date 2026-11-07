import { Component, EventEmitter, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-interactive-manual-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './interactive-manual-modal.html',
})
export class InteractiveManualModalComponent {
  @Output() close = new EventEmitter<void>();

  activeTab = signal<'segundo_parcial' | 'apk_movil' | 'ia_moderadora' | 'normalizacion' | 'primer_parcial'>('segundo_parcial');

  setTab(tab: 'segundo_parcial' | 'apk_movil' | 'ia_moderadora' | 'normalizacion' | 'primer_parcial') {
    this.activeTab.set(tab);
  }

  onClose() {
    this.close.emit();
  }
}
