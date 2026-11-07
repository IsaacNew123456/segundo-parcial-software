import { AfterViewInit, Component, ElementRef, HostListener, Inject, NgZone, OnDestroy, PLATFORM_ID, ViewChild, signal, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { CdkDragEnd, CdkDropListGroup, CdkDropList } from '@angular/cdk/drag-drop';
import { SidePanel } from "../side-panel/side-panel";
import { ClassEditorModal } from '../components/diagram/class-editor-modal/class-editor-modal';
import { DiagramService } from '../../services/diagram/diagram.service';
import { FallbackService } from '../../services/diagram/fallback.service';
import { RelationshipService } from '../../services/diagram/relationship.service';
import { UmlClass } from '../../models/uml-class.model';
import { DiagramExportService } from '../../services/exports/diagram-export.service';
import { BackendGeneratorService } from '../../services/exports/backend-generator.service';
import { ChatbotService } from '../../services/IA/chatbot.service';
import { UmlValidationService } from '../../services/colaboration/uml-validation.service';
import { ActivatedRoute } from '@angular/router';
import { GroupChat } from '../chat/group-chat/group-chat';
import { ProjectService } from '../../services/project/project.service';

@Component({
  selector: 'app-diagram',
  standalone: true,
  templateUrl: './diagram.html',
  styleUrls: ['./diagram.css'],
  imports: [CommonModule, SidePanel, CdkDropListGroup, CdkDropList, ClassEditorModal, GroupChat]
})
export class Diagram implements AfterViewInit, OnDestroy {
  @ViewChild('paperContainer', { static: true }) paperContainer!: ElementRef;
  @ViewChild(SidePanel) sidePanel!: SidePanel;
  @ViewChild(ClassEditorModal) classEditorModal!: ClassEditorModal;

  private lastMousePos: { x: number; y: number } | null = null;
  private projectService = inject(ProjectService);

  public projectId = signal<number | null>(null);
  public showChat = signal<boolean>(false);

  toggleChat(): void {
    this.showChat.set(!this.showChat());
  }

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ngZone: NgZone,
    public diagramService: DiagramService,
    private fallbackService: FallbackService,
    private relationshipService: RelationshipService,
    private exportService: DiagramExportService,
    private backendGen: BackendGeneratorService,
    private chatbot: ChatbotService,
    private umlValidation: UmlValidationService,
    private route: ActivatedRoute
  ) { }

  async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParamMap.subscribe((qParams) => {
        const pId = qParams.get('projectId');
        if (pId) {
          this.projectId.set(Number(pId));
        }
      });

      this.route.paramMap.subscribe(async (params) => {
        const roomId = params.get('roomId') || 'default-room';

        // Si no vino projectId en query params, intentar resolverlo por room_id
        if (!this.projectId()) {
          this.projectService.loadProjects().subscribe(projs => {
            const match = projs.find(p => p.room_id === roomId);
            if (match) {
              this.projectId.set(match.id);
            }
          });
        }

        this.ngZone.run(async () => {
          try {
            await this.diagramService.initialize(this.paperContainer.nativeElement, roomId);
            console.log('Lienzo cargado para sala:', roomId);
          } catch (error) {
            console.error('Error al inicializar sala:', error);
          }
        });
      });


      this.sidePanel.elementDragged.subscribe((event: CdkDragEnd) => {
        this.onDragEnded(event);
      });

      this.sidePanel.saveClicked.subscribe(() => this.saveDiagram());

      this.sidePanel.generateClicked.subscribe((prompt: string) => {
        this.generateFromPrompt(prompt);
      });

      // Manejador de selección de relación directa
      this.sidePanel.relationSelected.subscribe((type: string) => {
        if (type === 'cancel') {
          this.relationshipService.cancelLinkCreation(this.paperContainer.nativeElement);
        } else {
          this.relationshipService.startLinkCreation(
            this.diagramService['paper'],
            this.paperContainer.nativeElement,
            type,
            () => {
              this.sidePanel.clearActiveRelation();
            }
          );
        }
      });

      this.diagramService.onOpenClassEditor.subscribe((model: any) => {
        if (this.classEditorModal) {
          this.classEditorModal.openForCell(model);
        }
      });

      this.umlValidation.connect((result) => {
        this.sidePanel.updateValidationResult(result);
      });
    }

    if (this.paperContainer?.nativeElement) {
      this.paperContainer.nativeElement.addEventListener('mousemove', (evt: MouseEvent) => {
        const rect = this.paperContainer.nativeElement.getBoundingClientRect();
        this.lastMousePos = {
          x: evt.clientX - rect.left,
          y: evt.clientY - rect.top
        };
      });
      this.paperContainer.nativeElement.addEventListener('mouseleave', () => {
        this.lastMousePos = null;
      });
    }
  }

  ngOnDestroy(): void {
    this.diagramService.persist(true);
  }

  onSaveClassProperties(data: { cellId: string; name: string; attributesText: string; methodsText: string }): void {
    this.diagramService.applyClassProperties(data.cellId, data.name, data.attributesText, data.methodsText);
  }

  openEditorForSelected(): void {
    this.diagramService.openClassEditor();
  }

  saveDiagram(): void {
    const json = this.exportService.export(this.diagramService.getGraph());
    this.backendGen.generateBackend(json, 'mi-backend.zip');
  }

  generateFromPrompt(prompt: string): void {
    this.chatbot.isLoading.set(true);
    const currentDiagram = this.diagramService.exportToJson();

    this.chatbot.generateDiagram(prompt, currentDiagram).subscribe({
      next: (res) => {
        if (res.message) {
          this.chatbot.lastMessage.set(res.message);
        }
        this.diagramService.applyAiDiagram(res);
        this.chatbot.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error al generar diagrama desde chatbot', err);
        this.chatbot.lastMessage.set('Ocurrió un error al procesar la solicitud con la IA.');
        this.chatbot.isLoading.set(false);
      }
    });
  }

  @HostListener('window:beforeunload')
  onBeforeUnload(): void {
    this.diagramService.persist(true);
  }

  @HostListener('document:keydown', ['$event'])
  handleEscape(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    // Protección estricta: Si el foco está en un input, textarea o contenido editable, NO interceptar
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      this.diagramService.openClassEditor();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      this.diagramService.deleteSelected();
    }
    if (event.key === 'Escape') {
      this.diagramService.clearSelection();
      this.relationshipService.cancelLinkCreation(this.paperContainer.nativeElement);
      this.sidePanel.clearActiveRelation();
    }
    if (event.ctrlKey && event.key === 'c') {
      this.diagramService.clipboard = this.diagramService['copyUmlClass']?.(this.diagramService['selectedCell']);
      this.diagramService.clearSelection();
      event.preventDefault();
    }
    if (event.ctrlKey && event.key === 'v') {
      this.diagramService.clearSelection();
      if (this.diagramService.clipboard) {
        if (this.lastMousePos) {
          const model = { ...this.diagramService.clipboard, position: { ...this.lastMousePos } };
          this.diagramService['pasteUmlClass']?.(model);
        } else {
          this.diagramService['pasteUmlClass']?.(this.diagramService.clipboard);
        }
        this.diagramService.clearSelection();
      }
      event.preventDefault();
    }
    if (event.ctrlKey && event.key === 'x') {
      this.diagramService.clipboard = this.diagramService['copyUmlClass']?.(this.diagramService['selectedCell']);
      this.diagramService.deleteSelected();
      this.diagramService.clearSelection();
      event.preventDefault();
    }
    if (event.ctrlKey && event.key === 'd') {
      const clone = this.diagramService['copyUmlClass']?.(this.diagramService['selectedCell']);
      this.diagramService.clearSelection();
      this.diagramService['pasteUmlClass']?.(clone);
      event.preventDefault();
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.diagramService['paper'] && this.paperContainer) {
      const rect = this.paperContainer.nativeElement.getBoundingClientRect();
      this.diagramService['paper'].setDimensions(rect.width, rect.height);
    }
  }

  onDragEnded(event: CdkDragEnd): void {
    this.ngZone.run(() => {
      const type = (event.source.data as any).type;
      const { x, y } = event.dropPoint;

      // Calibrar la posición de suelta con la escala (zoom) y paneo del lienzo
      let pos = { x: 100, y: 100 };
      const paper = this.diagramService.getPaper();
      if (paper && typeof paper.clientToLocalPoint === 'function') {
        const localPt = paper.clientToLocalPoint({ x, y });
        pos = { x: Math.round(localPt.x), y: Math.round(localPt.y) };
      } else {
        const rect = this.paperContainer.nativeElement.getBoundingClientRect();
        pos = { x: Math.round(x - rect.left), y: Math.round(y - rect.top) };
      }

      if (type === 'class') {
        const nextName = this.diagramService.getNextAvailableClassName('Entidad');
        try {
          const umlClassModel: UmlClass = {
            name: nextName,
            position: pos,
            size: { width: 180, height: 110 },
            attributes: [
              { name: '+ id', type: 'int' },
              { name: '+ nombre', type: 'string' }
            ],
            methods: [
              { name: '+ crear' },
              { name: '+ eliminar' }
            ]
          };
          this.diagramService.createUmlClass(umlClassModel);
        } catch (error) {
          console.error('Error al crear el elemento:', error);
          const fallbackClass: UmlClass = {
            name: nextName,
            position: pos,
            attributes: [
              { name: '+ id', type: 'int' },
              { name: '+ nombre', type: 'string' }
            ],
            methods: [
              { name: '+ crear' },
              { name: '+ eliminar' }
            ]
          };
          this.fallbackService.createFallbackElement(
            this.paperContainer.nativeElement,
            fallbackClass
          );
        }
      }

      if (['association', 'generalization', 'aggregation', 'composition', 'dependency'].includes(type)) {
        this.relationshipService.startLinkCreation(
          this.diagramService['paper'],
          this.paperContainer.nativeElement,
          type,
          () => {
            this.sidePanel.clearActiveRelation();
          }
        );
      }
    });
  }

  zoomIn(): void {
    this.diagramService.zoomIn();
  }

  zoomOut(): void {
    this.diagramService.zoomOut();
  }

  resetZoom(): void {
    this.diagramService.resetZoom();
  }
}
