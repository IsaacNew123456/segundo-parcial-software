import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

type Msg =
  | { type: 'welcome'; peer: string; room: string }
  | { type: 'presence'; action: 'join' | 'leave'; peer: string }
  | { type: 'signal'; from: string; payload: any }
  | { type: 'broadcast'; from: string; payload: any }
  | { type: 'pong' };

@Injectable({ providedIn: 'root' })
export class SignalingService {
  private socket?: WebSocket;
  private _roomId!: string;
  private messageQueue: string[] = [];
  private isExplicitlyClosed = false;
  private reconnectTimer: any = null;
  private heartbeatTimer: any = null;
  public onMessage?: (msg: Msg) => void;

  connect(roomId: string) {
    this._roomId = roomId;
    this.isExplicitlyClosed = false;

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.protocol === 'https:'
      ? environment.WebSocket_python
      : window.location.hostname;

    const port = window.location.protocol === 'https:'
      ? ''
      : environment.wsPort
        ? `:${environment.wsPort}`
        : '';
    const wsUrl = `${scheme}://${host}${port}${environment.wsPath}${roomId}/`;

    console.log('[Signaling] Conectando a:', wsUrl);
    try {
      this.socket = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[Signaling] Error iniciando WebSocket:', err);
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      console.log('[Signaling] WebSocket conectado con éxito a:', wsUrl);
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.startHeartbeat();

      // Vaciar cola de mensajes en espera
      while (this.messageQueue.length > 0) {
        const item = this.messageQueue.shift();
        if (item && this.socket && this.socket.readyState === WebSocket.OPEN) {
          this.socket.send(item);
        }
      }
    };

    this.socket.onmessage = (ev) => {
      try {
        const msg: Msg = JSON.parse(ev.data);
        if (msg.type === 'pong') return; // Heartbeat recibido
        if (this.onMessage) this.onMessage(msg);
      } catch (e) {
        console.error('[Signaling] Error parsing message:', e);
      }
    };

    this.socket.onclose = () => {
      console.log('[Signaling] WebSocket desconectado.');
      this.stopHeartbeat();
      if (!this.isExplicitlyClosed) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = (err) => {
      console.warn('[Signaling] Error de transporte en WebSocket:', err);
    };
  }

  private scheduleReconnect() {
    if (this.isExplicitlyClosed || this.reconnectTimer) return;
    console.log('[Signaling] Programando reconexión automática en 2.5s...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed && this._roomId) {
        this.connect(this._roomId);
      }
    }, 2500);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    // Ping cada 25 segundos para evitar timeouts de proxies en la nube (Nginx/Cloudflare/AWS)
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          this.socket.send(JSON.stringify({ type: 'ping' }));
        } catch {}
      }
    }, 25000);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  sendSignal(to: string, payload: any) {
    const data = JSON.stringify({ type: 'signal', to, payload });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.messageQueue.push(data);
    }
  }

  broadcast(payload: any) {
    const data = JSON.stringify({ type: 'broadcast', payload });
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(data);
    } else if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      this.messageQueue.push(data);
    }
  }

  close() {
    this.isExplicitlyClosed = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.messageQueue = [];
    if (this.socket) {
      try { this.socket.close(); } catch {}
      this.socket = undefined;
    }
  }
}
