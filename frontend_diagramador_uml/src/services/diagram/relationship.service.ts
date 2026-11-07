import { Injectable } from '@angular/core';
import { DiagramService } from './diagram.service';

@Injectable({ providedIn: 'root' })
export class RelationshipService {
	private sourceElement: any = null;
	private paper: any = null;
	private clickHandler: any = null;
	private blankHandler: any = null;
	private currentType: string = 'association';

	constructor(private diagramService: DiagramService) {}

	/**
	 * Inicia el modo de creación de relación con un tipo específico
	 */
	startLinkCreation(
		paper: any,
		containerElement: HTMLElement,
		type: string = 'association',
		onComplete?: () => void
	): void {
		// Limpiar listeners previos si existían
		this.cancelLinkCreation(containerElement);

		this.paper = paper;
		this.sourceElement = null;
		this.currentType = type;
		// Cambiamos el cursor para indicar el modo de creación
		containerElement.style.cursor = 'crosshair';

		// Listener para selección de elementos
		this.clickHandler = (cellView: any) => {
			if (!this.sourceElement) {
				// Primera selección (origen)
				this.sourceElement = cellView.model;
			} else {
				// Segunda selección (destino), creamos la relación
				this.createTypedRelationship(
					this.sourceElement.id,
					cellView.model.id,
					this.currentType
				);
				// Limpiamos estado y desactivamos el modo de creación
				this.cancelLinkCreation(containerElement);
				// Notificamos para apagar el botón activo en la barra lateral
				if (onComplete) {
					onComplete();
				}
			}
		};

		// Listener para cancelar si el usuario hace clic en el fondo vacío del lienzo
		this.blankHandler = () => {
			this.cancelLinkCreation(containerElement);
			if (onComplete) {
				onComplete();
			}
		};

		this.paper.on('cell:pointerclick', this.clickHandler);
		this.paper.on('blank:pointerclick', this.blankHandler);
	}

	/**
	 * Crea una relación del tipo solicitado entre dos elementos
	 */
	private createTypedRelationship(sourceId: string, targetId: string, type: string) {
		this.diagramService.createTypedRelationship(sourceId, targetId, type);
	}

	/**
	 * Cancela el modo de creación de relación y restaura el cursor
	 */
	cancelLinkCreation(containerElement: HTMLElement): void {
		if (this.paper) {
			if (this.clickHandler) {
				this.paper.off('cell:pointerclick', this.clickHandler);
			}
			if (this.blankHandler) {
				this.paper.off('blank:pointerclick', this.blankHandler);
			}
		}
		if (containerElement) {
			containerElement.style.cursor = 'default';
		}
		this.sourceElement = null;
		this.clickHandler = null;
		this.blankHandler = null;
		this.currentType = 'association';
	}
}
