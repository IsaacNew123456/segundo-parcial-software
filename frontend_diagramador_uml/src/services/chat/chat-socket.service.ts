import { Injectable, signal, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { ChatMessage } from '../project/project.service';

@Injectable({ providedIn: 'root' })
export class ChatSocketService {
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private socket?: WebSocket;
  private currentProjectId?: number;
  private heartbeatTimer: any = null;

  public messages = signal<ChatMessage[]>([]);
  public isConnected = signal<boolean>(false);
  public currentUserInfo = signal<any>(null);

  connect(projectId: number): void {
    if (!this.isBrowser) return;
    this.currentProjectId = projectId;
    const token = this.authService.token();

    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.disconnect();
    }

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const host = window.location.protocol === 'https:'
      ? environment.WebSocket_python
      : window.location.hostname;
    const port = window.location.protocol === 'https:'
      ? ''
      : environment.wsPort ? `:${environment.wsPort}` : '';

    const wsUrl = `${scheme}://${host}${port}/ws/chat/${projectId}/?token=${encodeURIComponent(token || '')}`;

    try {
      this.socket = new WebSocket(wsUrl);
    } catch (err) {
      console.warn('[ChatSocket] Error conectando:', err);
      return;
    }

    this.socket.onopen = () => {
      this.isConnected.set(true);
      this.startHeartbeat();
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'welcome') {
          this.currentUserInfo.set(data.user);
        } else if (data.type === 'message' && data.message) {
          this.messages.update(msgs => {
            // Evitar duplicados por id
            if (msgs.some(m => m.id === data.message.id)) return msgs;
            return [...msgs, data.message];
          });
        }
      } catch (e) {
        console.error('[ChatSocket] Error parseando mensaje:', e);
      }
    };

    this.socket.onclose = () => {
      this.isConnected.set(false);
      this.stopHeartbeat();
    };

    this.socket.onerror = (err) => {
      console.warn('[ChatSocket] Error:', err);
    };
  }

  setInitialMessages(messages: ChatMessage[]): void {
    this.messages.set(messages);
  }

  sendMessage(content: string): void {
    if (!content.trim() || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }
    this.socket.send(JSON.stringify({
      type: 'chat_message',
      content: content.trim()
    }));
  }

  disconnect(): void {
    this.stopHeartbeat();
    if (this.socket) {
      this.socket.close();
      this.socket = undefined;
    }
    this.isConnected.set(false);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
