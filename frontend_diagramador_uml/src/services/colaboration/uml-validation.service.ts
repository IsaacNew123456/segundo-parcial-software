import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UmlValidationService {
  private socket?: WebSocket;
  private pendingModel: any = null;

  connect(onResult: (data: any) => void) {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host =
      window.location.protocol === 'https:'
        ? environment.WebSocket_python
        : window.location.hostname;

    const port =
      window.location.protocol === 'https:'
        ? ''
        : environment.wsPort
          ? `:${environment.wsPort}`
          : '';

    this.socket = new WebSocket(`${scheme}://${host}${port}/ws/uml/`);

    this.socket.onopen = () => {
      // Si había una validación pendiente durante la conexión inicial, ejecutarla de inmediato
      if (this.pendingModel) {
        this.validateModel(this.pendingModel);
        this.pendingModel = null;
      }
    };

    this.socket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.action === 'validation_result') {
          onResult(data);
        }
      } catch (e) {
        console.error('Error parseando mensaje de validación', e);
      }
    };
  }

  validateModel(umlJson: any) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      // Guardar en cola el último estado del modelo para enviarlo en cuanto el canal esté listo
      this.pendingModel = umlJson;
      return;
    }

    const payload = {
      action: 'validate_model',
      uml: umlJson
    };

    try {
      this.socket.send(JSON.stringify(payload));
    } catch {
      this.pendingModel = umlJson;
    }
  }
}
