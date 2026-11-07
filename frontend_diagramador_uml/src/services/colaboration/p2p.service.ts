import { Injectable } from '@angular/core';
import { SignalingService } from './signaling.service';

type Peer = {
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
};

@Injectable({ providedIn: 'root' })
export class P2PService {
  private peers = new Map<string, Peer>();
  private localId = ''; // mi channel_name asignado por el servidor
  private lastProcessedOps = new Set<string>();
  // Timestamp map para Last-Write-Wins (LWW) en entornos cloud con latencias asimétricas
  private lastElementTimestamps = new Map<string, number>();
  public onData?: (from: string, data: any) => void;

  constructor(private signaling: SignalingService) {}

  init(roomId: string) {
    this.signaling.onMessage = (msg) => this.handleSignaling(msg);
    this.signaling.connect(roomId);
  }

  // Lista de servidores STUN de alta disponibilidad global para atravesar NATs corporativos y cloud
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  private newPeer(remoteId: string, isInitiator: boolean) {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = { pc };
    this.peers.set(remoteId, peer);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.sendSignal(remoteId, { type: 'ice', candidate: e.candidate });
      }
    };

    if (isInitiator) {
      const dc = pc.createDataChannel('canvas');
      this.attachDataChannel(remoteId, dc);
      pc.createOffer().then(offer => {
        pc.setLocalDescription(offer);
        this.signaling.sendSignal(remoteId, { type: 'offer', sdp: offer });
      }).catch(err => console.warn('[P2P] Error creando oferta:', err));
    } else {
      pc.ondatachannel = (ev) => this.attachDataChannel(remoteId, ev.channel);
    }

    return peer;
  }

  private attachDataChannel(remoteId: string, dc: RTCDataChannel) {
    const p = this.peers.get(remoteId);
    if (!p) {
      console.error(`[P2P] Peer no encontrado para ${remoteId}`);
      return;
    }
    p.dc = dc;
    dc.onopen = () => {
      console.log('[P2P] DataChannel abierto con', remoteId);
    };
    dc.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        this.dispatchOp(remoteId, data);
      } catch (e) {
        console.error('[P2P] Error parsing mensaje DataChannel:', e);
      }
    };
  }

  private dispatchOp(from: string, payload: any) {
    if (!payload || !this.onData) return;

    // 1. Algoritmo Last-Write-Wins (LWW): ordenar y rechazar paquetes atrasados por congestión cloud
    const opTimestamp = typeof payload.ts === 'number' ? payload.ts : 0;
    const targetEntityId = payload.id || payload.linkId || '';

    if (targetEntityId && opTimestamp > 0) {
      const key = `${targetEntityId}_${payload.t}`;
      const lastTs = this.lastElementTimestamps.get(key) || 0;
      // Si el paquete que llega es más antiguo que una modificación ya procesada para este elemento, descartar
      if (opTimestamp < lastTs) {
        return;
      }
      this.lastElementTimestamps.set(key, opTimestamp);
    }

    // 2. Deduplicación inteligente para evitar dobles ejecuciones si llega simultáneamente por WebRTC y WebSocket
    let opKey = `${payload.t}_${payload.id || payload.linkId || ''}_${payload.x ?? ''}_${payload.y ?? ''}_${payload.field ?? ''}_${payload.value ?? ''}_${payload.w ?? ''}_${payload.h ?? ''}_${opTimestamp}`;
    
    if (payload.t === 'update_vertices' && payload.vertices) {
      opKey += '_' + JSON.stringify(payload.vertices);
    }
    if (payload.t === 'move_link') {
      opKey += '_' + payload.sourceId + '_' + payload.targetId;
    }
    if (this.lastProcessedOps.has(opKey)) return;
    this.lastProcessedOps.add(opKey);
    if (this.lastProcessedOps.size > 2000) {
      const first = this.lastProcessedOps.values().next().value;
      if (first) this.lastProcessedOps.delete(first);
    }

    this.onData(from, payload);
  }

  private async handleSignaling(msg: any) {
    // 1. Mensaje de bienvenida del servidor con el channel_name asignado
    if (msg.type === 'welcome') {
      this.localId = msg.peer;
      console.log('[P2P] Local peer ID confirmado:', this.localId);
      return;
    }

    // 2. Presencia en la sala
    if (msg.type === 'presence') {
      if (msg.peer && !this.localId) {
        this.localId = msg.peer;
      }
      if (msg.action === 'join' && msg.peer !== this.localId) {
        // Nuevo compañero en la sala: anunciar mi presencia
        this.signaling.broadcast({ type: 'announce' });
      }
      if (msg.action === 'leave' && msg.peer) {
        const p = this.peers.get(msg.peer);
        if (p) {
          try { p.dc?.close(); } catch {}
          try { p.pc?.close(); } catch {}
          this.peers.delete(msg.peer);
        }
      }
      return;
    }

    // 3. Broadcast distribuido (vía WebSocket)
    if (msg.type === 'broadcast') {
      // Handshake de presencia
      if (msg.payload?.type === 'announce') {
        const remoteId = msg.from;
        if (!remoteId || remoteId === this.localId || this.peers.has(remoteId)) return;

        const isInitiator = this.localId < remoteId;
        this.newPeer(remoteId, isInitiator);
        return;
      }

      // Operación de sincronización colaborativa
      if (msg.from !== this.localId && msg.payload) {
        this.dispatchOp(msg.from, msg.payload);
      }
      return;
    }

    // 4. Negociación WebRTC (señalización pura)
    if (msg.type === 'signal') {
      const remoteId = msg.from;
      let peer = this.peers.get(remoteId);
      if (!peer) peer = this.newPeer(remoteId, false);
      const pc = peer.pc;
      const payload = msg.payload;

      if (payload.type === 'offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.signaling.sendSignal(remoteId, { type: 'answer', sdp: answer });
        } catch (err) {
          console.warn('[P2P] Error procesando oferta SDP:', err);
        }
      } else if (payload.type === 'answer') {
        if (pc.signalingState !== 'stable') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          } catch (err) {
            console.warn('[P2P] Error procesando respuesta SDP:', err);
          }
        }
      } else if (payload.type === 'ice' && payload.candidate) {
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch (e) {
          console.warn('[P2P] Error aplicando ICE candidate:', e);
        }
      }
    }
  }

  sendToAll(data: any) {
    // Adjuntar timestamp global de ordenamiento para tolerancia a latencia asimétrica en la nube
    if (typeof data === 'object' && data !== null && !data.ts) {
      data.ts = Date.now();
    }
    const json = JSON.stringify(data);

    // Intentar enviar por DataChannels WebRTC abiertos (latencia sub-10ms P2P)
    for (const [id, p] of this.peers) {
      if (p.dc?.readyState === 'open') {
        try {
          p.dc.send(json);
        } catch (e) {
          console.warn('[P2P] Error en envío DataChannel:', e);
        }
      }
    }

    // Siempre difundir por WebSocket como canal de transporte garantizado
    this.signaling.broadcast(data);
  }

  closeSocketRTC() {
    for (const [id, peer] of this.peers) {
      try { peer.dc?.close(); } catch {}
      try { peer.pc?.close(); } catch {}
    }
    this.peers.clear();
    this.localId = '';
    this.lastProcessedOps.clear();
    this.lastElementTimestamps.clear();
    this.signaling.close();
  }
}
