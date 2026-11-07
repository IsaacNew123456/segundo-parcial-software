import { Injectable } from '@angular/core';
import { P2PService } from './p2p.service';
import { DiagramApi } from './diagram-api';
import { BackupService } from '../exports/backup.service';

type BaseOp = { ts?: number };

type Op = BaseOp & (
  | { t: 'add_class'; id: string; payload: any }
  | { t: 'edit_text'; id: string; field: 'name' | 'attributes' | 'methods'; value: string }
  | { t: 'move'; id: string; x: number; y: number }
  | { t: 'resize'; id: string; w: number; h: number }
  | { t: 'add_link'; id: string; sourceId: string; targetId: string; payload?: any }
  | { t: 'edit_label'; linkId: string; index: number; text: string }
  | { t: 'add_label'; linkId: string; index: number; label: any }
  | { t: 'del_label'; linkId: string; index: number }
  | { t: 'move_label'; linkId: string; index: number; position: { distance: number; offset?: number } }
  | { t: 'move_link'; id: string; sourceId: string; targetId: string }
  | { t: 'update_vertices'; id: string; vertices: any[]; sourceId?: string; targetId?: string }
  | { t: 'delete'; id: string; isLink?: boolean; sourceId?: string; targetId?: string }
  | { t: 'request_full_state' }
  | { t: 'full_state'; payload: any; force?: boolean }
);

@Injectable({ providedIn: 'root' })
export class CollaborationService {
  private api?: DiagramApi;
  private ready = false;
  private lastFullStateAppliedTime = 0;

  constructor(
    private p2p: P2PService,
    private backup: BackupService
  ) {}

  registerDiagramApi(api: DiagramApi) {
    this.api = api;
  }

  init(roomId: string) {
    this.p2p.onData = (_: string | undefined, data: Op) => {
      if (!this.api?.getGraph()) return;
      this.applyRemoteOp(data);
    };
    this.p2p.init(roomId);
    this.ready = true;

    // 1. Solicitar inmediatamente el estado completo a otros pares activos en la sala
    setTimeout(() => {
      this.broadcast({ t: 'request_full_state' });
    }, 200);

    // 2. Respaldo ágil: si en 800ms el grafo local sigue vacío y no hay estado en localStorage,
    // asegurar que cargue desde la base de datos PostgreSQL
    // El respaldo autoritativo se gestiona centralizadamente en diagram.service
  }

  broadcast(op: Op) {
    if (!this.ready) return;
    this.p2p.sendToAll(op);
  }

  closeSocketRTC() {
    this.p2p.closeSocketRTC();
    this.ready = false;
  }

  private applyRemoteOp(op: Op) {
    try {
      const graph = this.api!.getGraph();
      const joint = this.api!.getJoint();
      switch (op.t) {
        case 'add_class': {
          if (graph.getCell(op.id)) break;
          this.api!.createUmlClass({ ...op.payload, id: op.id }, true);
          break;
        }
        case 'edit_text': {
          const m = graph.getCell(op.id);
          if (!m) break;
          const map = {
            name: '.uml-class-name-text',
            attributes: '.uml-class-attrs-text',
            methods: '.uml-class-methods-text',
          } as const;

          m.attr(`${map[op.field]}/text`, op.value);
          m.set(op.field, op.value);
          if (!this.api || !this.api.getEdition) {
            console.warn('[Collab] API no soporta getEdition');
            break;
          }
          // Forzar auto-resize en receptor de forma inmediata y diferida
          this.api?.getEdition()?.autoResizeUmlClass(m, this.api!.getPaper?.() ?? null);
          this.api?.getEdition()?.scheduleAutoResize(m, this.api!.getPaper?.() ?? null);
          this.api?.persist?.(false);
          break;
        }

        case 'move': {
          const m = graph.getCell(op.id);
          if (!m) break;
          const oldPos = m.position();
          const dx = op.x - oldPos.x;
          const dy = op.y - oldPos.y;
          m.position(op.x, op.y, { collab: true });

          // Trasladar vertices de relaciones recursivas en el receptor para evitar distorsion
          if (dx !== 0 || dy !== 0) {
            const links = graph.getConnectedLinks(m);
            links.forEach((l: any) => {
              if (l.get('source')?.id === m.id && l.get('target')?.id === m.id) {
                const verts = l.get('vertices') || [];
                if (verts.length > 0) {
                  const updated = verts.map((v: any) => ({ x: v.x + dx, y: v.y + dy }));
                  l.set('vertices', updated, { collab: true });
                }
              }
            });
          }
          this.api?.persist?.(false);
          break;
        }
        case 'resize': {
          const m = graph.getCell(op.id);
          if (!m) break;
          m.resize(op.w, op.h, { collab: true });
          this.api?.persist?.(false);
          break;
        }
        case 'add_link': {
          if (graph.getCell(op.id) || graph.getLinks().some((l: any) => l.id === op.id || l.get('id') === op.id)) break;

          const type = op.payload?.type || 'association';
          
          if (!this.api || !this.api.createTypedRelationship) {
            console.warn('[Collab] API no soporta createTypedRelationship');
            break;
          }
          // construir SIN agregar (remote=true) pasando el op.id
          const link = this.api!.createTypedRelationship(op.sourceId, op.targetId, type, true, op.id);

          link.set('relationType', type);
          if (op.payload?.labels) link.set('labels', op.payload.labels);
          if (op.payload?.vertices) link.set('vertices', op.payload.vertices);

          // agregar una única vez, marcado como remoto
          graph.addCell(link, { collab: true });
          this.api?.persist?.(false);
          break;
        }

        case 'move_link': {
          let link = graph.getCell(op.id);
          if (!link) {
            link = graph.getLinks().find((l: any) => l.id === op.id || l.get('id') === op.id);
          }
          if (!link) break;
          link.set('source', { id: op.sourceId }, { collab: true });
          link.set('target', { id: op.targetId }, { collab: true });
          this.api?.persist?.(false);
          break;
        }

        case 'update_vertices': {
          let link = graph.getCell(op.id);
          if (!link) {
            link = graph.getLinks().find((l: any) => l.id === op.id || l.get('id') === op.id);
          }
          if (!link && op.sourceId && op.targetId) {
            link = graph.getLinks().find((l: any) => 
              l.get('source')?.id === op.sourceId && l.get('target')?.id === op.targetId
            );
          }
          if (!link) break;
          link.set('vertices', op.vertices || [], { collab: true });

          // Forzar redibujado inmediato de la curva en el canvas del receptor
          const paper = this.api?.getPaper?.();
          if (paper) {
            const linkView = paper.findViewByModel?.(link);
            if (linkView?.update) linkView.update();
          }
          this.api?.persist?.(false);
          break;
        }

        case 'add_label': {
          const link = graph.getCell(op.linkId);
          if (!link) break;

          const label = {
            ...op.label,
            markup: op.label.markup || [{ tagName: 'text', selector: 'text' }]
          };

          link.insertLabel(op.index, label);
          link.set('labels', link.labels());
          link.trigger('change:labels', link, link.labels());
          break;
        }

        case 'edit_label': {
          const link = graph.getCell(op.linkId);
          if (!link) break;
          const labels = link.labels() || [];
          if (op.index < 0 || op.index >= labels.length) break;

          const lbl = labels[op.index];
          link.label(op.index, {
            ...lbl,
            attrs: { ...lbl.attrs, text: { ...lbl.attrs?.text, text: op.text } },
            markup: lbl.markup || [{ tagName: 'text', selector: 'text' }]
          });
          link.set('labels', link.labels());
          link.trigger('change:labels', link, link.labels());
          break;
        }

        case 'move_label': {
          const link = graph.getCell(op.linkId);
          if (!link) break;
          const labels = link.labels() || [];
          if (op.index < 0 || op.index >= labels.length) break;

          const lbl = labels[op.index];
          link.label(op.index, {
            ...lbl,
            position: op.position,
            markup: lbl.markup || [{ tagName: 'text', selector: 'text' }]
          });
          link.set('labels', link.labels());
          link.trigger('change:labels', link, link.labels());
          break;
        }

        case 'del_label': {
          const link = graph.getCell(op.linkId);
          if (!link) break;
          link.removeLabel(op.index);
          link.set('labels', link.labels()); 
          link.trigger('change:labels', link, link.labels());
          break;
        }

        case 'delete': {
          let m = graph.getCell(op.id);
          if (!m) {
            m = graph.getCells().find((c: any) => c.id === op.id || c.get('id') === op.id);
          }
          if (!m) {
            m = graph.getLinks().find((l: any) => l.id === op.id || l.get('id') === op.id);
          }
          // Fallback ultra-resiliente: si es un link y no coincidió por ID, resolver por extremos
          if (!m && op.isLink && op.sourceId && op.targetId) {
            m = graph.getLinks().find((l: any) => 
              l.get('source')?.id === op.sourceId && l.get('target')?.id === op.targetId
            );
          }
          if (m) {
            m.remove({ collab: true });
            this.api?.persist?.(false);
          }
          break;
        }

        case 'request_full_state': {
          const snapshot = this.api!.exportToJson();
          // Solo responder si tenemos clases para no sobreescribir con lienzo vacío
          if (snapshot && Array.isArray(snapshot.classes) && snapshot.classes.length > 0) {
            this.broadcast({ t: 'full_state', payload: snapshot, force: false });
          }
          break;
        }

        case 'full_state': {
          // Si es forzado (ej. importación XML/XMI o regeneración IA), aplicar SIEMPRE inmediatamente
          const now = Date.now();
          if (!op.force && (now - this.lastFullStateAppliedTime < 2500)) {
            break;
          }
          if (this.api && op.payload && Array.isArray(op.payload.classes)) {
            this.lastFullStateAppliedTime = now;
            this.api.loadFromJson(op.payload, true);
          }
          break;
        }
      }
    } catch (err) {
      console.error('[Collab] applyRemoteOp error', op, err);
    }
  }
}
