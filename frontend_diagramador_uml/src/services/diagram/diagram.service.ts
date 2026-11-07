import { Injectable, Inject, PLATFORM_ID, signal, EventEmitter } from '@angular/core';
import { UmlClass } from '../../models/uml-class.model';
import { EditionService } from './edition.service';
import { v4 as uuid } from 'uuid';
import { CollaborationService } from '../colaboration/collaboration.service';
import { RemoteApplicationService } from '../colaboration/remote-application.service';
import { DiagramExportService, UmlExportDTO } from '../exports/diagram-export.service';
import { UmlValidationService } from '../colaboration/uml-validation.service';
import { BackupService } from '../exports/backup.service';

@Injectable({ providedIn: 'root' })
export class DiagramService {
	private joint: any;
	private graph: any;
	private paper: any;
	private selectedCell: any = null;
	public selectedElement = signal<any>(null);
	public onOpenClassEditor = new EventEmitter<any>();
	private isClearingGraph = false;
	private storageKey = '';
	private currentRoomId = '';
	private saveTimeout: any = null;
	private currentScale = 1; // escala inicial
	private minScale = 0.2;   // zoom out máximo
	private maxScale = 2;     // zoom in máximo
	private zoomStep = 0.1;   // incremento
	private pan = { x: 0, y: 0 };
	private isPanning = false;
	private lastPos = { x: 0, y: 0 };
	public clipboard: any = null;


	constructor(
		private edition: EditionService,
		private collab: CollaborationService,
		private exportService: DiagramExportService,
		private umlValidationService: UmlValidationService,
		private backup: BackupService,
	) {}

	/**
	 * Inicializa JointJS y configura el papel y grafo
	 */
	async initialize(paperElement: HTMLElement, roomId: string): Promise<void> {
		try {
			// Cancelar cualquier guardado pendiente de una sala anterior
			if (this.saveTimeout) clearTimeout(this.saveTimeout);

			// Configura la sala y clave de almacenamiento local DE INMEDIATO
			this.currentRoomId = roomId;
			this.storageKey = `diagram-${roomId}`;

			// Importamos JointJS
			this.joint = await import('jointjs');

			// Desactivar herramientas legacy en esquinas
			if (this.joint?.dia?.LinkView?.prototype?.options) {
				(this.joint.dia.LinkView.prototype.options as any).linkToolsMarkup = '';
				(this.joint.dia.LinkView.prototype.options as any).doubleLinkToolsMarkup = '';
				(this.joint.dia.LinkView.prototype.options as any).arrowheadMarkup = '';
			}

			// Limpiar grafo de forma segura sin disparar eventos destructivos de guardado
			this.isClearingGraph = true;
			if (this.graph) {
				this.graph.clear();
			} else {
				this.graph = new this.joint.dia.Graph();
			}
			this.selectedCell = null;
			this.selectedElement.set(null);
			this.isClearingGraph = false;

			const rect = paperElement.getBoundingClientRect();
			const w = rect.width > 100 ? rect.width : 2000;
			const h = rect.height > 100 ? rect.height : 1500;

			// Creamos el papel/canvas
			this.paper = new this.joint.dia.Paper({
				el: paperElement,
				model: this.graph,
				width: w,
				height: h,
				gridSize: 10,
				drawGrid: true,
				interactive: (cellView: any) => {
					if (cellView.model?.isLink?.()) {
						return {
							vertexAdd: true,
							vertexMove: true,
							vertexRemove: true,
							labelMove: true,
							arrowheadMove: false
						};
					}
					return { elementMove: true, addLinkFromMagnet: true };
				},
				linkTools: true,
				background: { color: '#f8fafc' },
				defaultConnector: { name: 'rounded' },
				defaultLink: () => this.buildRelationship(),
				validateConnection: (_cvS: any, _mS: any, _cvT: any, _mT: any) => true,
			});
			/**************************************************************************************************
			 * ATAJOS DE TECLADO: copiar, pegar, duplicar, cortar
			 ***************************************************************************************************/
			let clipboard: any = null;

			// Los atajos de teclado globales se delegan y controlan de forma centralizada en diagram.ts con proteccion de inputs

			// Para que el canvas reciba los eventos de teclado
			paperElement.tabIndex = 0;
			paperElement.style.outline = 'none';

			let isSpaceDown = false;

			// 1. ZOOM INTELIGENTE HACIA EL RATÓN + DESPLAZAMIENTO FLUIDO TOUCHPAD (2 DEDOS)
			paperElement.addEventListener('wheel', (evt: WheelEvent) => {
				evt.preventDefault();
				if (evt.ctrlKey || evt.metaKey) {
					// Pinch-to-zoom (Touchpad) o Ctrl + Rueda: Zoom centrado en el cursor del ratón
					const rect = paperElement.getBoundingClientRect();
					const mouseX = evt.clientX - rect.left;
					const mouseY = evt.clientY - rect.top;

					const localX = (mouseX - this.pan.x) / this.currentScale;
					const localY = (mouseY - this.pan.y) / this.currentScale;

					const zoomFactor = evt.deltaY < 0 ? 1.08 : 0.92;
					const targetScale = this.currentScale * zoomFactor;
					const newScale = Math.min(Math.max(targetScale, this.minScale), this.maxScale);

					this.pan.x = mouseX - localX * newScale;
					this.pan.y = mouseY - localY * newScale;
					this.currentScale = newScale;
					this.applyZoom();
				} else {
					// Desplazamiento natural con 2 dedos en touchpad o rueda
					this.pan.x -= evt.deltaX;
					this.pan.y -= evt.deltaY;
					this.applyZoom();
				}
			}, { passive: false });

			// 2. ARRASTRE LIBRE EN FONDO VACÍO (CLIC IZQUIERDO, DERECHO O RUEDA)
			this.paper.on('blank:pointerdown', (evt: any) => {
				this.isPanning = true;
				this.lastPos = { x: evt.clientX, y: evt.clientY };
				paperElement.style.cursor = 'grabbing';
			});

			paperElement.addEventListener('mousedown', (evt: MouseEvent) => {
				if (evt.button === 1 || evt.button === 2 || isSpaceDown) {
					this.isPanning = true;
					this.lastPos = { x: evt.clientX, y: evt.clientY };
					paperElement.style.cursor = 'grabbing';
					evt.preventDefault();
				}
			});

			window.addEventListener('mousemove', (evt: MouseEvent) => {
				if (this.isPanning) {
					const dx = evt.clientX - this.lastPos.x;
					const dy = evt.clientY - this.lastPos.y;
					this.lastPos = { x: evt.clientX, y: evt.clientY };
					this.pan.x += dx;
					this.pan.y += dy;
					this.applyZoom();
				}
			});

			window.addEventListener('mouseup', () => {
				if (this.isPanning) {
					this.isPanning = false;
					paperElement.style.cursor = isSpaceDown ? 'grab' : 'default';
				}
			});

			// 3. MODO BARRA ESPACIADORA (ESTILO FIGMA / MIRO)
			window.addEventListener('keydown', (evt: KeyboardEvent) => {
				const tag = (evt.target as HTMLElement)?.tagName;
				if (evt.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
					isSpaceDown = true;
					if (!this.isPanning) paperElement.style.cursor = 'grab';
				}
			});

			window.addEventListener('keyup', (evt: KeyboardEvent) => {
				if (evt.code === 'Space') {
					isSpaceDown = false;
					if (!this.isPanning) paperElement.style.cursor = 'default';
				}
			});

			paperElement.addEventListener('contextmenu', (evt: MouseEvent) => {
				evt.preventDefault();
			});

			/**************************************************************************************************
			 * EVENTOS INTERACTIVOS EN EL PAPER (COLABORATIVO)
			 ***************************************************************************************************/
			let pendingPos: { id: string; x: number; y: number } | null = null;
			const lastElementPositions = new Map<string, { x: number; y: number }>();

			const flushMove = () => {
				if (pendingPos) {
					this.collab.broadcast({ t: 'move', ...pendingPos });
					pendingPos = null;
				}
				requestAnimationFrame(flushMove);
			};
			requestAnimationFrame(flushMove);

			this.paper.on('element:pointerdown', (view: any) => {
				const m = view.model;
				if (m?.isElement?.()) {
					const p = m.position();
					lastElementPositions.set(m.id, { x: p.x, y: p.y });
				}
			});

			this.paper.on('element:pointermove', (view: any) => {
				const m = view.model;
				if (!m?.isElement?.()) return;
				const p = m.position();
				const lastP = lastElementPositions.get(m.id);
				if (lastP) {
					const dx = p.x - lastP.x;
					const dy = p.y - lastP.y;
					if (dx !== 0 || dy !== 0) {
						// Trasladar en vivo los vértices de relaciones recursivas para que no se distorsionen
						const links = this.graph.getConnectedLinks(m);
						links.forEach((l: any) => {
							if (l.get('source')?.id === m.id && l.get('target')?.id === m.id) {
								const verts = l.get('vertices') || [];
								if (verts.length > 0) {
									const updated = verts.map((v: any) => ({ x: v.x + dx, y: v.y + dy }));
									l.set('vertices', updated);
								}
							}
						});
						lastElementPositions.set(m.id, { x: p.x, y: p.y });
					}
				} else {
					lastElementPositions.set(m.id, { x: p.x, y: p.y });
				}
				pendingPos = { id: m.id, x: p.x, y: p.y };
			});

			this.paper.on('element:pointerup', (view: any) => {
				const m = view.model;
				if (!m?.isElement?.()) return;
				lastElementPositions.delete(m.id);
				const p = m.position();
				this.collab.broadcast({ t: 'move', id: m.id, x: p.x, y: p.y });
				pendingPos = null;

				// Difundir vértices actualizados de cualquier relación recursiva conectada
				const links = this.graph.getConnectedLinks(m);
				links.forEach((l: any) => {
					if (l.get('source')?.id === m.id && l.get('target')?.id === m.id) {
						const v = l.get('vertices') || [];
						if (v.length > 0) {
							this.collab.broadcast({
								t: 'update_vertices',
								id: l.id,
								vertices: v,
								sourceId: m.id,
								targetId: m.id
							});
						}
					}
				});
				this.persist(true);
			});

			//  Eliminación centralizada de celdas (elementos o relaciones)
			this.graph.on('remove', (cell: any, _collection: any, opt: any = {}) => {
				if (this.isClearingGraph || opt?.collab) return;
				const isLink = !!cell?.isLink?.();
				const src = isLink ? cell.get('source')?.id : undefined;
				const trg = isLink ? cell.get('target')?.id : undefined;

				this.collab.broadcast({
					t: 'delete',
					id: cell.id,
					isLink,
					sourceId: src,
					targetId: trg
				});
				this.persist(false);
			});

			//  Redimensionamiento
			let pendingResize: { id: string; w: number; h: number } | null = null;
			const flushResize = () => {
				if (pendingResize) {
					this.collab.broadcast({ t: 'resize', ...pendingResize });
					pendingResize = null;
				}
				requestAnimationFrame(flushResize);
			};
			requestAnimationFrame(flushResize);

			this.paper.on('element:resize', (view: any) => {
				const m = view.model;
				const s = m.size();
				pendingResize = { id: m.id, w: s.width, h: s.height };
			});

			this.paper.on('element:resize:pointerup', (view: any) => {
				const m = view.model;
				const s = m.size();
				this.collab.broadcast({ t: 'resize', id: m.id, w: s.width, h: s.height });
				pendingResize = null;
			});

			//  Edición y movimiento de etiquetas en links
			let pendingLabelMove: { linkId: string; index: number; position: { distance: number; offset?: number } } | null = null;
			const flushLabelMove = () => {
				if (pendingLabelMove) {
					this.collab.broadcast({ t: 'move_label', ...pendingLabelMove });
					pendingLabelMove = null;
				}
				requestAnimationFrame(flushLabelMove);
			};
			requestAnimationFrame(flushLabelMove);

			this.paper.on('link:label:pointermove', (linkView: any, evt: any) => {
				const model = linkView.model;
				const idx = this.getClickedLabelIndex(linkView, evt);
				if (idx == null) return;
				const lbl = model.label(idx);
				if (!lbl) return;
				pendingLabelMove = { linkId: model.id, index: idx, position: lbl.position };
			});

			this.paper.on('link:label:pointerup', (linkView: any, evt: any) => {
				const model = linkView.model;
				const idx = this.getClickedLabelIndex(linkView, evt);
				if (idx == null) return;
				const lbl = model.label(idx);
				if (!lbl) return;
				this.collab.broadcast({ t: 'move_label', linkId: model.id, index: idx, position: lbl.position });
				pendingLabelMove = null;
			});

			// 1) Emitir add_link al añadir un Link localmente
			this.graph.on('add', (cell: any, _col: any, opt: any = {}) => {
				if (opt?.collab) return;
				if (!cell?.isLink?.()) return;

				const src = cell.get('source')?.id;
				const trg = cell.get('target')?.id;
				if (!src || !trg) return;

				if (!cell.has('alreadyBroadcasted')) {
					cell.set('alreadyBroadcasted', true, { silent: true });
					const type = cell.get('relationType') || 'association';
					this.collab.broadcast({
						t: 'add_link',
						id: cell.id,
						sourceId: src,
						targetId: trg,
						payload: { type, labels: cell.get('labels'), vertices: cell.get('vertices') || [] }
					});
				}
			});

			// 2) Respaldo: si el link se añadió sin extremos y luego se conectan, o si se reconecta
			this.graph.on('change:source change:target', (link: any, _val: any, opt: any = {}) => {
				if (!link?.isLink || opt?.collab) return;

				const src = link.get('source')?.id;
				const trg = link.get('target')?.id;
				if (!src || !trg) return;

				if (!link.has('alreadyBroadcasted')) {
					link.set('alreadyBroadcasted', true, { silent: true });
					const type = link.get('relationType') || 'association';
					this.collab.broadcast({
						t: 'add_link',
						id: link.id,
						sourceId: src,
						targetId: trg,
						payload: { type, labels: link.get('labels'), vertices: link.get('vertices') || [] }
					});
				} else {
					this.collab.broadcast({ t: 'move_link', id: link.id, sourceId: src, targetId: trg });
					this.persist();
				}
			});

			// 3) Curvatura y vértices de links en tiempo real
			this.graph.off('change:vertices');
			let pendingVertices: { id: string; vertices: any[]; sourceId?: string; targetId?: string } | null = null;
			const flushVertices = () => {
				if (pendingVertices) {
					this.collab.broadcast({ t: 'update_vertices', ...pendingVertices });
					pendingVertices = null;
				}
				setTimeout(flushVertices, 40);
			};
			setTimeout(flushVertices, 40);

			this.graph.on('change:vertices', (link: any, _v: any, opt: any = {}) => {
				if (opt?.collab) return;
				if (link?.isLink?.()) {
					const src = link.get('source')?.id;
					const trg = link.get('target')?.id;
					pendingVertices = {
						id: link.id,
						vertices: link.get('vertices') || [],
						sourceId: src,
						targetId: trg
					};
					this.persist();
				}
			});

			this.paper.on('link:pointerup', (linkView: any) => {
				const link = linkView.model;
				if (link?.isLink?.()) {
					const src = link.get('source')?.id;
					const trg = link.get('target')?.id;
					this.collab.broadcast({
						t: 'update_vertices',
						id: link.id,
						vertices: link.get('vertices') || [],
						sourceId: src,
						targetId: trg
					});
					this.persist(true);
				}
			});

			// Guardar en localStorage y backend ante cambios locales del usuario
			this.graph.on('add remove change', (_cell: any, _col: any, opt: any = {}) => {
				if (this.isClearingGraph || opt?.collab) return;
				this.persist();
			});

			/**************************************************************************************************
			 * EVENTOS INTERACTIVOS EN EL PAPER (MODICACION LOCAL)
			 ***************************************************************************************************/
			//Seleccionar Una clase UML o una Relación
			this.paper.on('cell:pointerclick', (cellView: any) => {
				this.clearSelection();
				this.selectedCell = cellView.model;
				this.selectedElement.set(this.selectedCell?.isElement?.() ? this.selectedCell : null);
				if (this.selectedCell?.isElement?.()) {
					this.selectedCell.attr('.uml-outer/stroke', '#8b5cf6');
					this.selectedCell.attr('.uml-outer/stroke-width', 2.5);
					this.selectedCell.getPorts().forEach((p: any) => {
						this.selectedCell.portProp(p.id, 'attrs/circle/display', 'block');
					});
				} else if (this.selectedCell?.isLink?.()) {
					this.selectedCell.attr('.connection/stroke', '#8b5cf6');
					this.selectedCell.attr('.connection/stroke-width', 3);
				}
			});
			//  Deselect al hacer click en el fondo
			this.paper.on('blank:pointerclick', () => this.clearSelection());
			this.paper.on('cell:pointerdblclick', (cellView: any, _evt: any, _x: number, _y: number) => {
				const model = cellView.model;
				if (!model?.isElement?.()) return;
				this.openClassEditor(model);
			});
			//  Doble clic en una relación para editar su etiqueta
			this.paper.on('link:pointerdblclick', (linkView: any, evt: MouseEvent, x: number, y: number) => {
				const model = linkView.model;
				if (model.get('name') !== 'Relacion') return;
				const labelIndex = this.getClickedLabelIndex(linkView, evt);
				if (labelIndex === null) return;
				const label = model.label(labelIndex);
				const currentValue = label?.attrs?.text?.text || '';
				this.edition.startEditingLabel(model, this.paper, labelIndex, currentValue, x, y, this.collab, this.graph);
				const node = linkView.findLabelNode(labelIndex) as SVGElement;
				if (node) {
					node.setAttribute('stroke', '#2196f3');
					node.setAttribute('stroke-width', '1');
				}
			});
			//  Clic derecho en una relación para añadir una nueva etiqueta
			this.paper.on('link:contextmenu', (linkView: any, evt: MouseEvent, x: number, y: number) => {
				evt.preventDefault();
				const model = linkView.model;
				const idx = this.getClickedLabelIndex(linkView, evt);

				if (idx != null) {
				// eliminar etiqueta
				model.removeLabel(idx);
				this.collab.broadcast({ t: 'del_label', linkId: model.id, index: idx });
				return;
				}

				// añadir etiqueta
				const newLabel = {
				position: { distance: linkView.getClosestPoint(x, y).ratio, offset: -10 },
				attrs: { text: { text: 'label', fill: '#333', fontSize: 12 } },
				markup: [{ tagName: 'text', selector: 'text' }]
				};
				model.appendLabel(newLabel);
				const newIndex = model.labels().length - 1;

				//  difundir con el objeto completo
				this.collab.broadcast({
				t: 'add_label',
				linkId: model.id,
				index: newIndex,
				label: newLabel
				});
				this.edition.startEditingLabel(model, this.paper, newIndex, 'label', x, y, this.collab,this.graph);
			});

			//  Mostrar botón de eliminación 'X' exactamente en el centro (50% / 0.5) de la relación
			this.paper.on('link:mouseenter', (linkView: any) => {
				if (!this.joint?.linkTools?.Remove) return;
				const removeButton = new this.joint.linkTools.Remove({
					distance: 0.5,
					offset: 0,
					markup: [
						{
							tagName: 'circle',
							selector: 'button',
							attributes: {
								'r': 10,
								'fill': '#ef4444',
								'stroke': '#ffffff',
								'stroke-width': 2,
								'cursor': 'pointer'
							}
						},
						{
							tagName: 'path',
							selector: 'icon',
							attributes: {
								'd': 'M -3.5 -3.5 L 3.5 3.5 M -3.5 3.5 L 3.5 -3.5',
								'fill': 'none',
								'stroke': '#ffffff',
								'stroke-width': 2,
								'stroke-linecap': 'round',
								'pointer-events': 'none'
							}
						}
					],
					action: (_evt: any, view: any) => {
						// view.model.remove() dispara graph.on('remove') de forma centralizada
						view.model.remove();
					}
				});
				const toolsView = new this.joint.dia.ToolsView({
					tools: [removeButton]
				});
				linkView.addTools(toolsView);
			});

			this.paper.on('link:mouseleave', (linkView: any) => {
				linkView.removeTools();
			});

			// Aplicar zoom y pan inicial
			this.paper.scale(this.currentScale, this.currentScale);
			this.paper.translate(this.pan.x, this.pan.y);


			//  inicializa colaboración **ANTES** de salir
			this.collab.registerDiagramApi({
				getGraph: () => this.graph,
				getJoint: () => this.joint,
				getEdition: () => this.edition, 
				getPaper: () => this.paper,
				createUmlClass: (payload) => this.createUmlClass(payload),
				buildLinkForRemote: this.buildLinkForRemote,
				createRelationship: (sourceId, targetId, remote = false) =>
				this.createRelationship(sourceId, targetId, remote),

				createTypedRelationship: (sourceId: string, targetId: string, type: string, remote = false, linkId?: string) =>
				this.createTypedRelationship(sourceId, targetId, type, remote, linkId),

				loadFromJson: (json, isSync = false) => this.loadFromJson(json, isSync),
				exportToJson: () => this.exportService.export(this.graph),
				persist: (immediate = false) => this.persist(immediate),
			});

			this.currentRoomId = roomId;

			// 1. Carga previa optimista desde localStorage para evitar parpadeo blanco
			const saved = localStorage.getItem(this.storageKey);
			if (saved) {
				try {
					const json: UmlExportDTO = JSON.parse(saved);
					if (json && Array.isArray(json.classes) && json.classes.length > 0) {
						this.loadFromJson(json, false);
						console.log('[Cache] Render previo desde localStorage.');
					}
				} catch (err) {
					console.warn('Error leyendo localStorage:', err);
				}
			}

			// 2. SIEMPRE sincronizar con PostgreSQL (fuente autoritativa de la sala)
			this.backup.getBackup(roomId).subscribe({
				next: (data) => {
					if (data && Array.isArray(data.classes)) {
						this.loadFromJson(data, true);
						console.log('[Sync] Diagrama sincronizado desde PostgreSQL.');
					}
				},
				error: (err) => console.log('Sala sin respaldo previo en BD:', err)
			});

			// 3. Inicializar colaboracion en tiempo real
			this.collab.init(roomId);
			console.log('JointJS inicializado en room:', roomId);
			return Promise.resolve();
		} catch (error) {
			console.error('Error al inicializar JointJS:', error);
			return Promise.reject(error);
		}
	}

	/**************************************************************************************************
	 * EDICIÓN DE RELACIONES
	 ***************************************************************************************************/
	// Crea una relación entre dos elementos y la añade al grafo
	createRelationship(
		sourceId: string,
		targetId: string,
		remote: boolean = false
	) {
		return this.createTypedRelationship(sourceId, targetId, 'association', remote);
	}


	// Construye una relación (link) con configuración por defecto
	private buildRelationship(sourceId?: string, targetId?: string) {
		const isSelf = !!(sourceId && targetId && sourceId === targetId);
		const link = new this.joint.dia.Link({
			name: 'Relacion',
			relationType: 'association',
			source: sourceId ? { id: sourceId } : undefined,
			target: targetId ? { id: targetId } : undefined,
			attrs: {
				'.connection': { stroke: '#1e293b', 'stroke-width': 2, fill: 'none' },
				'.marker-target': { fill: '#1e293b', stroke: '#1e293b', d: 'M 10 0 L 0 5 L 10 10 z' }
			},
			labels: [
				{
					position: { distance: 35,  offset: -14 },
					attrs: { text: { text: '1..1', fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
					markup: [{ tagName: 'text', selector: 'text' }]
				},
				{
					position: { distance: -35, offset: -14 },
					attrs: { text: { text: '0..*', fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
					markup: [{ tagName: 'text', selector: 'text' }]
				}
			]
		});

		if (isSelf && sourceId) {
			const elem = this.graph.getCell(sourceId);
			if (elem) {
				const bbox = elem.getBBox();
				const x = bbox.x + bbox.width;
				const y = bbox.y;
				link.set('vertices', [
					{ x: x + 40, y: y + 25 },
					{ x: x + 40, y: y - 35 },
					{ x: bbox.x + bbox.width * 0.5, y: y - 35 }
				]);
			}
		}

		return link;
	}


	private readonly relationAttrs: any = {
		association: {
			'.connection': { stroke: '#1e293b', 'stroke-width': 2, fill: 'none' },
			'.marker-target': { fill: '#1e293b', stroke: '#1e293b', d: 'M 10 0 L 0 5 L 10 10 z' }
		},
		generalization: {
			'.connection': { stroke: '#1e293b', 'stroke-width': 2, fill: 'none' },
			'.marker-target': {
				d: 'M 20 0 L 0 10 L 20 20 z',
				fill: '#ffffff',
				stroke: '#1e293b',
				'stroke-width': 2
			}
		},
		aggregation: {
			'.connection': { stroke: '#1e293b', 'stroke-width': 2, fill: 'none' },
			'.marker-source': {
				d: 'M 0 10 L 10 0 L 20 10 L 10 20 z',
				fill: '#ffffff',
				stroke: '#0284c7',
				'stroke-width': 2
			}
		},
		composition: {
			'.connection': { stroke: '#1e293b', 'stroke-width': 2, fill: 'none' },
			'.marker-source': {
				d: 'M 0 10 L 10 0 L 20 10 L 10 20 z',
				fill: '#1e293b',
				stroke: '#1e293b'
			}
		},
		dependency: {
			'.connection': { stroke: '#d97706', 'stroke-width': 2, 'stroke-dasharray': '5 3', fill: 'none' },
			'.marker-target': {
				d: 'M 10 0 L 0 5 L 10 10 z',
				fill: '#d97706',
				stroke: '#d97706'
			}
		}
	};

	/**
	 * Crea una relación tipada entre dos elementos y la añade al grafo
	*/
	createTypedRelationship(
		sourceId: string,
		targetId: string,
		type: string = 'association',
		remote: boolean = false,
		linkId?: string
	) {
		const isSelf = sourceId === targetId;
		const attrs = this.relationAttrs[type] || this.relationAttrs.association;

		const link = new this.joint.dia.Link({
			id: linkId || undefined,
			name: 'Relacion',
			relationType: type,             //  guarda el tipo
			source: { id: sourceId },
			target: { id: targetId },
			attrs
		});

		// Si es una relacion recursiva (source === target), crear automaticamente el arco/bucle visible
		if (isSelf) {
			const elem = this.graph?.getCell(sourceId);
			if (elem) {
				const bbox = elem.getBBox();
				const x = bbox.x + bbox.width;
				const y = bbox.y;
				link.set('vertices', [
					{ x: x + 40, y: y + 25 },
					{ x: x + 40, y: y - 35 },
					{ x: bbox.x + bbox.width * 0.5, y: y - 35 }
				]);
			}
		}

		// En UML: solo Asociación, Agregación y Composición llevan cardinalidades numéricas
		if (['association', 'aggregation', 'composition'].includes(type)) {
			link.set('labels', [
				{
					position: { distance: isSelf ? 25 : 35, offset: isSelf ? -18 : -14 },
					attrs: { text: { text: isSelf ? '0..1' : '1..1', fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
					markup: [{ tagName: 'text', selector: 'text' }]
				},
				{
					position: { distance: isSelf ? -25 : -35, offset: isSelf ? -18 : -14 },
					attrs: { text: { text: type === 'composition' ? '1..*' : '0..*', fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
					markup: [{ tagName: 'text', selector: 'text' }]
				}
			]);
		}

		if (!remote) {
			this.graph.addCell(link);       //  disparará 'add' → broadcast
			this.persist(true);
		}
		return link;
	}

	/**************************************************************************************************
	 * FUNCIONES AUXILIARES
	 ***************************************************************************************************/
	deleteSelected() {
		if (!this.selectedCell) return;
		const cell = this.selectedCell;
		this.selectedCell = null;
		// cell.remove() dispara graph.on('remove') que difunde delete con metadatos y persiste inmediatamente
		cell.remove();
	}

	// Copiar clase UML seleccionada
	private copyUmlClass(cell: any): UmlClass | null {
		if (!cell?.isElement?.()) return null;
		return {
			id: undefined, // Nueva copia
			name: cell.get('name'),
			position: { x: cell.position().x + 30, y: cell.position().y + 30 }, // desplazada
			size: cell.size(),
			attributes: cell.get('attributes'),
			methods: cell.get('methods'),
		};
	}

	// Pegar clase UML desde el portapapeles
	private pasteUmlClass(classModel: UmlClass | null) {
		if (!classModel) return;
		const newClass = this.createUmlClass(classModel);
		newClass.toFront();
		this.selectedCell = newClass;
	}

	clearSelection() {
		if (this.selectedCell?.isElement?.()) {
			this.selectedCell.attr('.uml-outer/stroke', '#1e293b');
			this.selectedCell.attr('.uml-outer/stroke-width', 1.5);
			this.selectedCell.getPorts().forEach((p: any) => {
				this.selectedCell.portProp(p.id, 'attrs/circle/display', 'none');
			});
		} else if (this.selectedCell?.isLink?.()) {
			this.selectedCell.attr('.connection/stroke', '#94a3b8');
			this.selectedCell.attr('.connection/stroke-width', 2.2);
		}
		this.selectedCell = null;
		this.selectedElement.set(null);
	}

	// ========= Obtener índice de etiqueta clicada =========
	private getClickedLabelIndex(linkView: any, evt: MouseEvent): number | null {
		const labels = linkView.model.labels();
		if (!labels || labels.length === 0) return null;
		for (let i = 0; i < labels.length; i++) {
			const node = linkView.findLabelNode(i);
			if (node && (evt.target === node || node.contains(evt.target as Node))) return i;
		}
		return null;
	}

	saveDiagram() {
		const json = this.exportService.export(this.graph);
		console.log('JSON limpio:', JSON.stringify(json, null, 2));

		// Aquí ya lo puedes mandar con HttpClient al backend
		// this.http.post('/api/diagrams', json).subscribe(...)
	}

	// Genera nombres incrementales automáticos si ya existen (ej. Entidad, Entidad1, Entidad2)
	getNextAvailableClassName(baseName: string = 'Entidad'): string {
		if (!this.graph) return baseName;
		const existingNames = new Set<string>();
		this.graph.getElements().forEach((el: any) => {
			const name = el.get('name') || el.attr('.uml-class-name-text/text');
			if (name && typeof name === 'string') {
				existingNames.add(name.trim().toLowerCase());
			}
		});

		// 1. Si el nombre base no existe en el canvas, usarlo directamente
		const cleanBase = baseName.trim();
		const baseLower = cleanBase.toLowerCase();
		if (!existingNames.has(baseLower)) {
			return cleanBase;
		}

		// 2. Si ya existe, buscar secuencialmente Entidad1, Entidad2, Entidad3...
		let index = 1;
		while (existingNames.has(`${baseLower}${index}`) || existingNames.has(`${baseLower} ${index}`)) {
			index++;
		}
		return `${cleanBase}${index}`;
	}

	/**************************************************************************************************
	 * CONFIFURACIÓN Y CREACIÓN DE UML
	 ***************************************************************************************************/
	// ========= Crea una clase UML con la estructura de tres compartimentos =========
	createUmlClass(classModel: UmlClass, remote: boolean = false): any {
		try {
			if (!this.joint || !this.graph) {
				throw new Error('JointJS no está inicializado');
			}
			//  Forzar la creación del namespace custom
			this.createUmlNamespace();
			//  Normalizar atributos/métodos a texto multilinea
			const attributesText = Array.isArray(classModel.attributes)
				? classModel.attributes.map(a => `${a.name}: ${a.type}`).join('\n')
				: (classModel.attributes || '');
			const methodsText = Array.isArray(classModel.methods)
				? classModel.methods.map(m => {
						const params = m.parameters ? `(${m.parameters})` : '()';
						const ret = m.returnType ? `: ${m.returnType}` : '';
						return `${m.name}${params}${ret};`;
					}).join('\n')
				: (classModel.methods || '');

			const resolvedName = remote
				? (classModel.name || 'Entidad')
				: (classModel.name ? classModel.name : this.getNextAvailableClassName('Entidad'));

			//  Usar la clase custom con tamaño base compacto
			const umlClass = new this.joint.shapes.custom.UMLClass({
				position: classModel.position || { x: 100, y: 100 },
				size: classModel.size || { width: 160, height: 90 },
				name: resolvedName,
				attributes: attributesText,
				methods: methodsText,
			});
			//  Asignar ID remoto si viene del payload
			if (classModel.id) {
				umlClass.set('id', classModel.id);
			} else {
				umlClass.set('id', uuid());
			}
			//  Añadimos 4 puertos (uno por cada lado)
			umlClass.addPort({ group: 'inout', id: 'top' });
			umlClass.addPort({ group: 'inout', id: 'bottom' });
			umlClass.addPort({ group: 'inout', id: 'left' });
			umlClass.addPort({ group: 'inout', id: 'right' });
			umlClass.on('change:size', () => this.edition.updatePorts(umlClass));
			umlClass.on('change:name change:attributes change:methods', () => {
				this.edition.autoResizeUmlClass(umlClass, this.paper);
			});
			//  Auto-ajuste métrico sincronizado antes y después de insertar
			this.edition.autoResizeUmlClass(umlClass, this.paper);
			this.graph.addCell(umlClass);
			this.edition.scheduleAutoResize(umlClass, this.paper);
			umlClass.toFront();
			//  Difundir creación SOLO si fue local
			if (!remote) {
				this.collab.broadcast({
					t: 'add_class',
					id: umlClass.id,
					payload: {
						name: resolvedName,
						position: classModel.position,
						size: classModel.size,
						attributes: classModel.attributes,
						methods: classModel.methods,
					},
				});
				this.persist(true);
			}
			return umlClass;
		} catch (error) {
			console.error('Error al crear clase UML personalizada:', error);
			throw error;
		}
	}

	// ========= Configura los eventos interactivos para un elemento =========
	setupClassInteraction(element: any): void {
		try {
			const elementView = this.paper.findViewByModel(element);
			if (elementView) {
				// elementView.on('element:pointerdblclick', () => {
				//   console.log('Doble clic en elemento - editar propiedades');
				//   // Aquí podríamos abrir un diálogo para editar propiedades
				// });
			}
		} catch (error) {
			console.error('Error al configurar interacción:', error);
		}
	}

	// ========= Crea un namespace UML personalizado si no existe en JointJS =========
	private createUmlNamespace(): void {
		if (!this.joint) return;
		if (this.joint.shapes.custom?.UMLClass) return;
		this.joint.shapes.custom = this.joint.shapes.custom || {};
		this.joint.shapes.custom.UMLClass = this.joint.dia.Element.define('custom.UMLClass', {
			size: { width: 150, height: 90 },
			name: 'Entidad',
			attributes: '',
			methods: '',
			attrs: {
				'.uml-outer': {
					x: 0,
					y: 0,
					width: 150,
					height: 90,
					strokeWidth: 1.5,
					stroke: '#1e293b',
					fill: '#ffffff',
					rx: 0,
					ry: 0,
				},
				'.uml-class-name-rect': { x: 0, y: 0, width: 150, height: 32, fill: '#f1f5f9', stroke: 'none', strokeWidth: 0 },
				'.sep-name': { x1: 0, y1: 32, x2: 150, y2: 32, stroke: '#1e293b', strokeWidth: 1.5, shapeRendering: 'crispEdges' },
				'.sep-attrs': { x1: 0, y1: 64, x2: 150, y2: 64, stroke: '#1e293b', strokeWidth: 1.5, shapeRendering: 'crispEdges' },
				'.uml-class-name-text': {
					ref: '.uml-class-name-rect',
					refX: 0.5,
					refY: 0.5,
					textAnchor: 'middle',
					yAlignment: 'middle',
					fontWeight: 'bold',
					fontSize: 13,
					fill: '#0f172a',
					text: 'Entidad',
				},
				'.uml-class-attrs-text': {
					x: 10,
					y: 46,
					textAnchor: 'start',
					fontSize: 12,
					fill: '#1e293b',
					text: '',
					lineHeight: 18,
					whiteSpace: 'pre-wrap',
				},
				'.uml-class-methods-text': {
					x: 10,
					y: 78,
					textAnchor: 'start',
					fontSize: 12,
					fill: '#1e293b',
					text: '',
					lineHeight: 18,
					whiteSpace: 'pre-wrap',
				},
			},
			ports: {
				groups: {
					inout: {
						position: { name: 'absolute' },
						attrs: {
							circle: {
								r: 5,
								magnet: true,
								stroke: '#1e293b',
								fill: '#ffffff',
								'stroke-width': 2,
								display: 'none',
							},
						},
					},
				},
			},
		}, {
			markup: [
				'<g class="rotatable">',
				'<rect class="uml-outer"/>',
				'<rect class="uml-class-name-rect"/>',
				'<line class="sep-name"/>',
				'<line class="sep-attrs"/>',
				'<text class="uml-class-name-text"/>',
				'<text class="uml-class-attrs-text"/>',
				'<text class="uml-class-methods-text"/>',
				'<g class="ports"/>',
				'</g>',
			].join(''),
		});

		// Dynamic updateRectangles for custom.UMLClass
		this.joint.shapes.custom.UMLClass.prototype.updateRectangles = function () {
			const name = (this.get('name') || '').trim();
			const rawAttrs = this.get('attributes') || '';
			const rawMeths = this.get('methods') || '';

			const attrLines: string[] = typeof rawAttrs === 'string'
				? rawAttrs.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
				: (Array.isArray(rawAttrs) ? rawAttrs.map((a: any) => `${a.name}: ${a.type}`) : []);

			const methLines: string[] = typeof rawMeths === 'string'
				? rawMeths.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
				: (Array.isArray(rawMeths) ? rawMeths.map((m: any) => `${m.name}(${m.parameters || ''}): ${m.returnType || 'void'}`) : []);

			let maxChars = name.length + 2;
			attrLines.forEach((l: string) => { if (l.length > maxChars) maxChars = l.length; });
			methLines.forEach((l: string) => { if (l.length > maxChars) maxChars = l.length; });

			const optimalWidth = Math.max(150, Math.ceil(maxChars * 7.2 + 20));
			const nameH = 32;
			const attrsH = attrLines.length > 0 ? (attrLines.length * 18 + 12) : 22;
			const methsH = methLines.length > 0 ? (methLines.length * 18 + 12) : 22;
			const totalH = nameH + attrsH + methsH;

			const ySep1 = nameH;
			const ySep2 = nameH + attrsH;

			this.attr({
				'.uml-outer': { width: optimalWidth, height: totalH },
				'.uml-class-name-rect': { width: optimalWidth, height: nameH },
				'.sep-name': { x1: 0, y1: ySep1, x2: optimalWidth, y2: ySep1 },
				'.sep-attrs': { x1: 0, y1: ySep2, x2: optimalWidth, y2: ySep2 },
				'.uml-class-name-text': {
					ref: '.uml-class-name-rect',
					refX: 0.5,
					refY: 0.5,
					textAnchor: 'middle',
					yAlignment: 'middle',
					text: name
				},
				'.uml-class-attrs-text': {
					x: 10,
					y: nameH + 14,
					textAnchor: 'start',
					text: attrLines.join('\n')
				},
				'.uml-class-methods-text': {
					x: 10,
					y: ySep2 + 14,
					textAnchor: 'start',
					text: methLines.join('\n')
				}
			});

			this.resize(optimalWidth, totalH);
		};

		this.joint.shapes.custom.UMLClass.prototype.initialize = function () {
			this.on('change:name change:attributes change:methods', this.updateRectangles, this);
			this.updateRectangles();
			this.constructor.__super__.initialize.apply(this, arguments);
		};
	}

	private buildLinkForRemote = (sourceId?: string, targetId?: string) =>
		new this.joint.dia.Link({
			name: 'Relacion',
			source: sourceId ? { id: sourceId } : undefined,
			target: targetId ? { id: targetId } : undefined,
			attrs: {
				'.connection': { stroke: '#333333', 'stroke-width': 2, fill: 'none' },
				'.marker-target': { fill: '#333333', d: 'M 10 0 L 0 5 L 10 10 z' },
			},
			labels: [
				{
					position: { distance: 20, offset: -10 },
					attrs: { text: { text: '0..1', fill: '#333' } },
				},
				{
					position: { distance: -20, offset: -10 },
					attrs: { text: { text: '1..*', fill: '#333' } },
				},
			],
		});

	// Expose para otros servicios (collab) y componentes
	getGraph() {
		return this.graph;
	}
	getJoint() {
		return this.joint;
	}
	getPaper() {
		return this.paper;
	}
	loadFromJson(json: any, isSync: boolean = false) {
		if (!this.graph || !json) return;

		// Si es sincronizacion autoritativa (PostgreSQL o full_state remoto),
		// limpiar canvas limpiamente para remover entidades eliminadas
		if (isSync) {
			this.isClearingGraph = true;
			try {
				this.graph.clear();
				this.selectedCell = null;
				this.selectedElement.set(null);
			} finally {
				this.isClearingGraph = false;
			}
		}

		const idMap: Record<string, string> = {}; 

		// 1. Crear (o reusar) todas las clases
		if (Array.isArray(json.classes)) {
			json.classes.forEach((cls: any) => {
				const existing = this.graph.getCells().find((c: any) => {
					return c.isElement?.() && (c.id === cls.id || c.get('name') === cls.name);
				});

				const attrText = Array.isArray(cls.attributes)
					? cls.attributes.map((a: any) => a.name + ': ' + a.type).join('\n')
					: (cls.attributes || '');
				const methText = Array.isArray(cls.methods)
					? cls.methods.map((m: any) => {
							const params = m.parameters ? '(' + m.parameters + ')' : '()';
							const ret = m.returnType ? ': ' + m.returnType : '';
							return m.name + params + ret + ';';
						}).join('\n')
					: (cls.methods || '');

				if (existing) {
					idMap[cls.id] = existing.id; 
					if (cls.position) existing.position(cls.position.x, cls.position.y);
					if (cls.name) {
						existing.set('name', cls.name);
						existing.attr('.uml-class-name-text/text', cls.name);
					}
					existing.set('attributes', attrText);
					existing.attr('.uml-class-attrs-text/text', attrText);
					existing.set('methods', methText);
					existing.attr('.uml-class-methods-text/text', methText);

					this.edition.autoResizeUmlClass(existing, this.paper);
					this.edition.scheduleAutoResize(existing, this.paper);
				} else {
					const newCls = this.createUmlClass({
						id: cls.id,
						name: cls.name,
						position: cls.position || { x: 100, y: 100 },
						size: cls.size || { width: 160, height: 90 },
						attributes: cls.attributes,
						methods: cls.methods
					}, true);

					idMap[cls.id] = newCls.id;
					this.edition.autoResizeUmlClass(newCls, this.paper);
					this.edition.scheduleAutoResize(newCls, this.paper);
				}
			});
		}

		// 2. Crear todas las relaciones
		if (Array.isArray(json.relationships)) {
			json.relationships.forEach((rel: any) => {
				const srcId = idMap[rel.sourceId] || rel.sourceId;
				const trgId = idMap[rel.targetId] || rel.targetId;

				const existingLink = this.graph.getLinks().find((l: any) => {
					return (
						l.id === rel.id ||
						(l.get('source')?.id === srcId &&
						l.get('target')?.id === trgId &&
						l.get('relationType') === rel.type)
					);
				});

				if (existingLink) {
					if (rel.labels) {
						existingLink.set(
							'labels',
							rel.labels.map((txt: string, i: number) => ({
								position: { distance: i === 0 ? 35 : -35, offset: -14 },
								attrs: { text: { text: txt, fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
								markup: [{ tagName: 'text', selector: 'text' }]
							}))
						);
					}
					if (rel.vertices && rel.vertices.length > 0) {
						existingLink.set('vertices', rel.vertices);
					}
					return;
				}

				const link = this.createTypedRelationship(srcId, trgId, rel.type, true, rel.id);

				if (rel.labels) {
					link.set(
						'labels',
						rel.labels.map((txt: string, i: number) => ({
							position: { distance: i === 0 ? 35 : -35, offset: -14 },
							attrs: { text: { text: txt, fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
							markup: [{ tagName: 'text', selector: 'text' }]
						}))
					);
				}

				if (rel.vertices && rel.vertices.length > 0) {
					link.set('vertices', rel.vertices);
				}

				this.graph.addCell(link, { collab: true });
			});
		}

		// Asegurar auto-ajuste metrico consistente de todos los elementos tras montarse en el DOM
		setTimeout(() => {
			this.graph.getElements().forEach((el: any) => {
				this.edition.autoResizeUmlClass(el, this.paper);
				this.edition.scheduleAutoResize(el, this.paper);
			});
		}, 60);

		if (this.storageKey) {
			try {
				localStorage.setItem(this.storageKey, JSON.stringify(json));
			} catch {}
		}
	}

	/**
	 * Aplica de forma inteligente e incremental la respuesta del copiloto IA:
	 * 1. Preserva las posiciones (x, y) de las clases existentes.
	 * 2. Asigna posiciones automáticas en rejilla limpia para clases nuevas.
	 * 3. Actualiza atributos y métodos de clases existentes sin destruirlas.
	 * 4. Remueve clases o relaciones que hayan sido eliminadas por el comando.
	 * 5. Persiste en PostgreSQL y sincroniza vía WebSockets en tiempo real.
	 */
	applyAiDiagram(aiJson: any): void {
		if (!this.graph || !aiJson || aiJson.error || !Array.isArray(aiJson.classes)) {
			console.warn('[Guard] Actualización abortada: IA devolvió error o formato inválido.', aiJson);
			return;
		}

		const currentElements = this.graph.getElements();
		if (currentElements.length === 0) {
			this.loadFromJson(aiJson, true);
			this.persist(true);
			this.broadcastFullState(aiJson);
			return;
		}

		const incomingClasses = Array.isArray(aiJson.classes) ? aiJson.classes : [];
		const incomingRels = Array.isArray(aiJson.relationships) ? aiJson.relationships : [];

		const existingByName = new Map<string, any>();
		const existingById = new Map<string, any>();
		currentElements.forEach((el: any) => {
			const name = (el.get('name') || '').trim().toLowerCase();
			if (name) existingByName.set(name, el);
			existingById.set(el.id, el);
		});

		const incomingNames = new Set(incomingClasses.map((c: any) => (c.name || '').trim().toLowerCase()));
		const incomingIds = new Set(incomingClasses.map((c: any) => c.id));

		// Eliminar elementos removidos por la IA
		currentElements.forEach((el: any) => {
			const elName = (el.get('name') || '').trim().toLowerCase();
			const elId = el.id;
			if (!incomingIds.has(elId) && !incomingNames.has(elName)) {
				this.graph.removeCells([el], { collab: true });
			}
		});

		// Coordenadas para clases nuevas
		let nextX = 100;
		let nextY = 120;
		if (currentElements.length > 0) {
			const rightmost = Math.max(...currentElements.map((el: any) => el.position().x + (el.size()?.width || 180)));
			const bottommost = Math.max(...currentElements.map((el: any) => el.position().y + (el.size()?.height || 120)));
			nextX = rightmost + 80;
			nextY = 120;
			if (nextX > 1600) {
				nextX = 100;
				nextY = bottommost + 80;
			}
		}

		const idMap: Record<string, string> = {};

		incomingClasses.forEach((cls: any, index: number) => {
			const clsNameKey = (cls.name || '').trim().toLowerCase();
			const existing = existingById.get(cls.id) || existingByName.get(clsNameKey);

			const attrText = Array.isArray(cls.attributes)
				? cls.attributes.map((a: any) => {
					const match = typeof a.name === 'string' ? a.name.match(/^[+\-#~]/) : null;
					const v = (a.visibility || '').trim() || (match ? match[0] : '+');
					const name = typeof a.name === 'string' ? a.name.trim().replace(/^[+\-#~]\s*/, '') : '';
					const type = a.type ? `: ${a.type}` : ': string';
					return `${v} ${name}${type}`.trim();
				}).join('\n')
				: (typeof cls.attributes === 'string' ? cls.attributes : '');
			const methText = Array.isArray(cls.methods)
				? cls.methods.map((m: any) => {
					const match = typeof m.name === 'string' ? m.name.match(/^[+\-#~]/) : null;
					const v = (m.visibility || '').trim() || (match ? match[0] : '+');
					const name = typeof m.name === 'string' ? m.name.trim().replace(/^[+\-#~]\s*/, '') : '';
					const params = m.parameters ? '(' + m.parameters + ')' : '()';
					const ret = m.returnType ? ': ' + m.returnType : ': void';
					return `${v} ${name}${params}${ret};`.trim();
				}).join('\n')
				: (typeof cls.methods === 'string' ? cls.methods : '');

			if (existing) {
				idMap[cls.id] = existing.id;
				if (cls.name) {
					existing.set('name', cls.name);
					existing.attr('.uml-class-name-text/text', cls.name);
				}
				existing.set('attributes', attrText);
				existing.attr('.uml-class-attrs-text/text', attrText);
				existing.set('methods', methText);
				existing.attr('.uml-class-methods-text/text', methText);

				this.edition.autoResizeUmlClass(existing, this.paper);
				this.edition.scheduleAutoResize(existing, this.paper);
			} else {
				const posX = nextX + ((index % 3) * 220);
				const posY = nextY + (Math.floor(index / 3) * 180);
				const newCls = this.createUmlClass({
					id: cls.id,
					name: cls.name,
					position: { x: posX, y: posY },
					size: { width: 180, height: 100 },
					attributes: attrText,
					methods: methText
				}, true);

				idMap[cls.id] = newCls.id;
				this.edition.autoResizeUmlClass(newCls, this.paper);
				this.edition.scheduleAutoResize(newCls, this.paper);
			}
		});

		// Sincronizar relaciones
		const currentLinks = this.graph.getLinks();
		const incomingRelKeys = new Set(incomingRels.map((r: any) => {
			const sId = idMap[r.sourceId] || r.sourceId;
			const tId = idMap[r.targetId] || r.targetId;
			return `${sId}->${tId}:${r.type}`;
		}));

		currentLinks.forEach((link: any) => {
			const sId = link.get('source')?.id;
			const tId = link.get('target')?.id;
			const rType = link.get('relationType');
			const key = `${sId}->${tId}:${rType}`;
			if (!incomingRelKeys.has(key)) {
				this.graph.removeCells([link], { collab: true });
			}
		});

		incomingRels.forEach((rel: any) => {
			const srcId = idMap[rel.sourceId] || rel.sourceId;
			const trgId = idMap[rel.targetId] || rel.targetId;
			if (!srcId || !trgId) return;

			const existingLink = this.graph.getLinks().find((l: any) => {
				return (
					l.id === rel.id ||
					(l.get('source')?.id === srcId &&
					l.get('target')?.id === trgId &&
					l.get('relationType') === rel.type)
				);
			});

			if (existingLink) {
				if (rel.labels) {
					existingLink.set(
						'labels',
						rel.labels.map((txt: string, i: number) => ({
							position: { distance: i === 0 ? 35 : -35, offset: -14 },
							attrs: { text: { text: txt, fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
							markup: [{ tagName: 'text', selector: 'text' }]
						}))
					);
				}
			} else {
				const link = this.createTypedRelationship(srcId, trgId, rel.type, true, rel.id);
				if (rel.labels) {
					link.set(
						'labels',
						rel.labels.map((txt: string, i: number) => ({
							position: { distance: i === 0 ? 35 : -35, offset: -14 },
							attrs: { text: { text: txt, fill: '#0f172a', fontSize: 13, fontWeight: 'bold' } },
							markup: [{ tagName: 'text', selector: 'text' }]
						}))
					);
				}
				this.graph.addCell(link, { collab: true });
			}
		});

		setTimeout(() => {
			this.persist(true);
			const fullJson = this.exportToJson();
			if (fullJson) {
				this.broadcastFullState(fullJson);
			}
		}, 100);
	}

	// ========= Abre el editor asistido para la clase seleccionada =========
	openClassEditor(cellModel?: any): void {
		const target = cellModel || this.selectedCell;
		if (target && target.isElement?.()) {
			this.onOpenClassEditor.emit(target);
		}
	}

	// ========= Aplica propiedades normalizadas desde el Modal de Edición =========
	applyClassProperties(cellId: string, name: string, attributesText: string, methodsText: string): void {
		const model = this.graph.getCell(cellId);
		if (!model || !model.isElement?.()) return;

		model.set('name', name);
		model.set('attributes', attributesText);
		model.set('methods', methodsText);

		this.edition.autoResizeUmlClass(model, this.paper);
		this.edition.scheduleAutoResize(model, this.paper);

		this.collab.broadcast({ t: 'edit_text', id: model.id, field: 'name', value: name });
		this.collab.broadcast({ t: 'edit_text', id: model.id, field: 'attributes', value: attributesText });
		this.collab.broadcast({ t: 'edit_text', id: model.id, field: 'methods', value: methodsText });

		this.persist(true);
	}

	// Exporta el estado actual del diagrama a JSON
	exportToJson() {
		if (!this.graph) return null;
		return this.exportService.export(this.graph);
	}

	// Difunde forzadamente el estado completo del diagrama a todos los pares de la sala
	broadcastFullState(json?: any) {
		const payload = json || this.exportToJson();
		if (payload && Array.isArray(payload.classes)) {
			this.collab.broadcast({ t: 'full_state', payload, force: true });
		}
	}
	// Guarda el estado actual del diagrama en localStorage y sincroniza en vivo con PostgreSQL
	public persist(immediate: boolean = false) {
		if (!this.graph || this.isClearingGraph) return;
		
		// Guardamos en LocalStorage con el estado actual
		const localJson = this.exportService.export(this.graph);
		if (this.storageKey) {
			localStorage.setItem(this.storageKey, JSON.stringify(localJson));
		}
		
		// Auto-sincronización con PostgreSQL (inmediata en borrados o debounced 500ms en movimientos)
		if (this.currentRoomId) {
			if (this.saveTimeout) clearTimeout(this.saveTimeout);
			
			if (immediate) {
				// Exportar en el instante exacto del envío HTTP
				const currentJson = this.exportService.export(this.graph);
				this.backup.setBackupUml(this.currentRoomId, currentJson).subscribe({
					next: () => console.log('[Sync] Guardado sincronizado en PostgreSQL.'),
					error: (err) => console.warn('[Sync] Error en sincronización PostgreSQL:', err)
				});
			} else {
				this.saveTimeout = setTimeout(() => {
					// Exportar el grafo en el instante en que se cumple el timeout,
					// evitando enviar estados capturados viejos si ocurrieron cambios remotos en el medio.
					if (!this.graph || this.isClearingGraph) return;
					const delayedJson = this.exportService.export(this.graph);
					this.backup.setBackupUml(this.currentRoomId!, delayedJson).subscribe({
						next: () => console.log('[AutoSync] Diagrama guardado en PostgreSQL.'),
						error: (err) => console.warn('[AutoSync] Error en auto-sync PostgreSQL:', err)
					});
				}, 500);
			}
		}
	}
	// Limpia el diagrama guardado en localStorage
	clearStorage() {
		localStorage.removeItem(this.storageKey);
	}
	closeDiagram(roomId: string) {
		const snapshot = this.exportToJson();
		if (snapshot && Array.isArray(snapshot.classes) && snapshot.classes.length > 0) {
			this.backup.setBackupUml(roomId, snapshot).subscribe({
				next: () => console.log('[Backup] Snapshot enviado para sala:', roomId),
				error: (err) => console.error('[Backup] Error enviando snapshot:', err)
			});
		}

		// Limpiar grafo de forma segura sin emitir eventos destructivos de guardado
		this.isClearingGraph = true;
		try {
			this.collab.closeSocketRTC();
			this.graph?.clear();
			this.selectedCell = null;
			this.selectedElement.set(null);
			this.currentRoomId = '';
		} finally {
			this.isClearingGraph = false;
		}
	}
	zoomIn() {
		this.currentScale = Math.min(this.currentScale + this.zoomStep, this.maxScale);
		this.applyZoom();
	}

	zoomOut() {
		this.currentScale = Math.max(this.currentScale - this.zoomStep, this.minScale);
		this.applyZoom();
	}

	resetZoom() {
		this.currentScale = 1;
		this.pan = { x: 0, y: 0 };
		this.applyZoom();
	}

	private applyZoom() {
		if (this.paper) {
			this.paper.scale(this.currentScale, this.currentScale);
			this.paper.translate(this.pan.x, this.pan.y);
		}
	}
	exportToImage(fileName: string = 'diagram.png') {
		if (!this.paper) {
			console.error('Paper no inicializado');
			return;
		}

		const bbox = this.paper.getContentBBox();
		if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
			console.warn('Diagrama vacío, nada que exportar');
			return;
		}

		// Clonar el nodo SVG actual
		const svgElement = this.paper.svg.cloneNode(true) as SVGSVGElement;

		// Eliminar elementos interactivos no deseados (handles, herramientas, puertos)
		svgElement.querySelectorAll(
			'.marker-vertices, .marker-arrowheads, .link-tools, .tool, .connection-wrap'
		).forEach(el => el.remove());

		// CRÍTICO: Resetear la transformación de zoom/pan del viewport en el clon
		// para que las coordenadas de los elementos coincidan 1:1 con el modelo unscaled
		const viewport = svgElement.querySelector('.joint-viewport') as SVGGElement;
		if (viewport) {
			viewport.removeAttribute('transform');
		}

		// Margen / padding de respiración para que los bordes, sombras y multiplicidades no se corten
		const padding = 50;
		const x = Math.round(bbox.x - padding);
		const y = Math.round(bbox.y - padding);
		const width = Math.round(bbox.width + padding * 2);
		const height = Math.round(bbox.height + padding * 2);

		svgElement.setAttribute("width", `${width}`);
		svgElement.setAttribute("height", `${height}`);
		svgElement.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);

		// Añadir un fondo blanco sólido directamente en el SVG
		const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		bgRect.setAttribute("x", `${x}`);
		bgRect.setAttribute("y", `${y}`);
		bgRect.setAttribute("width", `${width}`);
		bgRect.setAttribute("height", `${height}`);
		bgRect.setAttribute("fill", "#ffffff");
		if (viewport) {
			viewport.insertBefore(bgRect, viewport.firstChild);
		} else {
			svgElement.insertBefore(bgRect, svgElement.firstChild);
		}

		// Inyectar fuentes tipográficas limpias
		let defs = svgElement.querySelector('defs');
		if (!defs) {
			defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
			svgElement.insertBefore(defs, svgElement.firstChild);
		}
		// Forzar fill="none" en todos los paths de líneas y conexiones para evitar rellenos negros en enlaces recursivos
		svgElement.querySelectorAll('.connection, .connection-wrap, path').forEach(el => {
			if (!el.classList.contains('marker-target') && !el.classList.contains('marker-source')) {
				el.setAttribute('fill', 'none');
			}
		});

		const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
		styleEl.textContent = `
			text {
				font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
			}
			.connection, path.connection {
				fill: none !important;
			}
		`;
		defs.appendChild(styleEl);

		// Convertir a string
		const serializer = new XMLSerializer();
		const svgString = serializer.serializeToString(svgElement);

		// Crear imagen
		const img = new Image();
		const url = URL.createObjectURL(new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }));

		img.onload = () => {
			// Renderizado a resolución 2x (HiDPI / Retina) para nitidez profesional de texto y líneas
			const scale = 2;
			const canvas = document.createElement("canvas");
			canvas.width = width * scale;
			canvas.height = height * scale;

			const ctx = canvas.getContext("2d");
			if (ctx) {
				ctx.imageSmoothingEnabled = true;
				ctx.imageSmoothingQuality = "high";
				ctx.fillStyle = "#ffffff";
				ctx.fillRect(0, 0, canvas.width, canvas.height);
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			}

			canvas.toBlob((blob) => {
				if (!blob) return;
				const a = document.createElement("a");
				a.href = URL.createObjectURL(blob);
				a.download = fileName;
				a.click();
				URL.revokeObjectURL(a.href);
			}, "image/png");

			URL.revokeObjectURL(url);
		};

		img.src = url;
	}
}
