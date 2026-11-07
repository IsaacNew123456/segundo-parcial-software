import { Injectable } from '@angular/core';
import { DiagramExportService } from '../exports/diagram-export.service';
import { UmlValidationService } from '../colaboration/uml-validation.service';

@Injectable({ providedIn: 'root' })
export class EditionService {
  readonly MIN_W = 150;
  readonly NAME_H = 32;
  readonly LINE_H = 18;
  readonly PAD_V = 12;
  readonly PAD_H = 10;

  constructor(
    private exportService: DiagramExportService,
    private umlValidationService: UmlValidationService
  ) {}

  // ========= Edición rápida de campos (fallback inline) =========
  startEditing(
    model: any,
    paper: any,
    field: 'name' | 'attributes' | 'methods',
    x: number,
    y: number,
    collab?: { broadcast: (msg: any) => void }
  ) {
    const MAP: Record<typeof field, string> = {
      name: '.uml-class-name-text',
      attributes: '.uml-class-attrs-text',
      methods: '.uml-class-methods-text'
    };
    const selector = MAP[field];
    const currentValue = model.attr(`${selector}/text`) || '';

    const currentScale = (typeof paper.scale === 'function' ? paper.scale().sx : 1) || 1;
    const cellView = typeof paper.findViewByModel === 'function' ? paper.findViewByModel(model) : null;
    const viewEl = cellView?.el as SVGElement | undefined;

    let absX = 0;
    let absY = 0;
    let editorWidth = 180;
    let editorHeight = 32;

    if (viewEl && typeof viewEl.getBoundingClientRect === 'function') {
      const nodeRect = viewEl.getBoundingClientRect();
      absX = nodeRect.left;
      editorWidth = Math.max(150, Math.round(nodeRect.width));

      if (field === 'name') {
        absY = nodeRect.top;
        editorHeight = Math.max(28, Math.round(this.NAME_H * currentScale));
      } else if (field === 'attributes') {
        absY = nodeRect.top + Math.round(this.NAME_H * currentScale);
      } else {
        const sep2 = parseFloat(model.attr('.sep-attrs/y1')) || (this.NAME_H + 40);
        absY = nodeRect.top + Math.round(sep2 * currentScale);
      }
    } else {
      const paperRect = paper.el.getBoundingClientRect();
      absX = paperRect.left + x;
      absY = paperRect.top + y;
    }

    const editor = field === 'name'
      ? document.createElement('input')
      : document.createElement('textarea');

    editor.value = currentValue;
    const fontSz = Math.max(11, Math.min(14, Math.round(12.5 * currentScale)));
    Object.assign(editor.style, {
      position: 'fixed',
      left: `${absX}px`,
      top: `${absY}px`,
      width: `${editorWidth}px`,
      height: field === 'name' ? `${editorHeight}px` : 'auto',
      border: '2px solid #2563eb',
      borderRadius: '2px',
      padding: '2px 8px',
      zIndex: '99999',
      fontSize: `${fontSz}px`,
      fontWeight: field === 'name' ? 'bold' : 'normal',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#0f172a',
      backgroundColor: '#ffffff',
      boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      boxSizing: 'border-box',
      outline: 'none',
      resize: 'none'
    } as CSSStyleDeclaration);

    if (field !== 'name') (editor as HTMLTextAreaElement).rows = 4;

    document.body.appendChild(editor);
    editor.focus();
    editor.select();

    let closed = false;
    const finish = (save: boolean) => {
      if (closed) return;
      closed = true;

      if (save) {
        const raw = (editor as HTMLInputElement | HTMLTextAreaElement).value;
        const newValue = field === 'name' ? raw.trim() : raw.replace(/\r?\n/g, '\n');
        model.set(field, newValue);
        collab?.broadcast({ t: 'edit_text', id: model.id, field, value: newValue });
        this.autoResizeUmlClass(model, paper);
      }
      editor.parentNode && editor.parentNode.removeChild(editor);
    };

    editor.addEventListener('blur', () => finish(true));
    editor.addEventListener('keydown', (evt: Event) => {
      const e = evt as KeyboardEvent;
      if (field === 'name') {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      } else {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      }
    });
  }

  // ========= Selector Rápido de Cardinalidad y Edición de Etiquetas de Enlaces =========
  startEditingLabel(
    model: any,
    paper: any,
    labelIndex: number,
    currentValue: string,
    x: number,
    y: number,
    collab?: { broadcast: (msg: any) => void },
    graph?: any
  ) {
    // Cerrar cualquier popover previo si existiese
    const existing = document.getElementById('uml-cardinality-popover');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    const linkView = paper.findViewByModel(model) as any;
    const labelNode = linkView?.findLabelNode?.(labelIndex) as SVGElement | undefined;

    let absX = x;
    let absY = y;
    if (labelNode && typeof labelNode.getBoundingClientRect === 'function') {
      const nodeRect = labelNode.getBoundingClientRect();
      absX = nodeRect.left;
      absY = nodeRect.bottom + 6;
    } else {
      const paperRect = paper.el.getBoundingClientRect();
      absX = paperRect.left + x;
      absY = paperRect.top + y + 10;
    }

    // Asegurar que el popover quede visible dentro de la pantalla
    const popoverW = 240;
    const popoverH = 145;
    absX = Math.max(12, Math.min(window.innerWidth - popoverW - 12, absX - 40));
    absY = Math.max(12, Math.min(window.innerHeight - popoverH - 12, absY));

    // Resaltar etiqueta activa
    if (labelNode) {
      labelNode.setAttribute('stroke', '#2563eb');
      labelNode.setAttribute('stroke-width', '2');
    }

    // Contenedor Popover elegante
    const popover = document.createElement('div');
    popover.id = 'uml-cardinality-popover';
    Object.assign(popover.style, {
      position: 'fixed',
      left: `${absX}px`,
      top: `${absY}px`,
      width: `${popoverW}px`,
      background: '#ffffff',
      borderRadius: '10px',
      border: '1.5px solid #cbd5e1',
      boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.2), 0 8px 12px -4px rgba(0, 0, 0, 0.08)',
      padding: '10px 12px',
      zIndex: '99999',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      userSelect: 'none',
      boxSizing: 'border-box'
    } as CSSStyleDeclaration);

    // 1. Encabezado con título y botón de cierre
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottom: '1px solid #f1f5f9',
      paddingBottom: '6px'
    } as CSSStyleDeclaration);

    const title = document.createElement('span');
    title.innerText = 'Multiplicidad UML';
    Object.assign(title.style, {
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '0.6px',
      color: '#475569'
    } as CSSStyleDeclaration);

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    Object.assign(closeBtn.style, {
      background: 'none',
      border: 'none',
      fontSize: '16px',
      lineHeight: '1',
      color: '#94a3b8',
      cursor: 'pointer',
      padding: '0 4px'
    } as CSSStyleDeclaration);

    header.appendChild(title);
    header.appendChild(closeBtn);
    popover.appendChild(header);

    // 2. Botonera de Chips de Cardinalidad Rápida
    const chipsContainer = document.createElement('div');
    Object.assign(chipsContainer.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '5px'
    } as CSSStyleDeclaration);

    const standardOptions = ['1..1', '0..1', '0..*', '1..*'];

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      if (labelNode) {
        labelNode.removeAttribute('stroke');
        labelNode.removeAttribute('stroke-width');
      }
      if (popover.parentNode) {
        popover.parentNode.removeChild(popover);
      }
      document.removeEventListener('pointerdown', onOutsideClick);
      document.removeEventListener('keydown', onKeyDown);
    };

    const applyValue = (val: string) => {
      const text = val.trim();
      if (text.length > 0) {
        model.label(labelIndex, { ...model.label(labelIndex), attrs: { text: { text } } });
        collab?.broadcast({ t: 'edit_label', linkId: model.id, index: labelIndex, text });
        model.set('label', text);
      }
      cleanup();
    };

    standardOptions.forEach((optText) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerText = optText;
      const isSelected = currentValue.trim() === optText;

      Object.assign(btn.style, {
        background: isSelected ? '#eff6ff' : '#f8fafc',
        color: isSelected ? '#1d4ed8' : '#1e293b',
        border: isSelected ? '1.5px solid #3b82f6' : '1px solid #e2e8f0',
        borderRadius: '6px',
        padding: '5px 2px',
        fontSize: '11px',
        fontWeight: '700',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.15s ease'
      } as CSSStyleDeclaration);

      btn.addEventListener('mouseenter', () => {
        if (!isSelected) {
          btn.style.background = '#f1f5f9';
          btn.style.borderColor = '#cbd5e1';
          btn.style.color = '#0f172a';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (!isSelected) {
          btn.style.background = '#f8fafc';
          btn.style.borderColor = '#e2e8f0';
          btn.style.color = '#1e293b';
        }
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        applyValue(optText);
      });

      chipsContainer.appendChild(btn);
    });

    popover.appendChild(chipsContainer);

    // 3. Fila para Valor Personalizado con texto visible y botón de confirmación
    const customRow = document.createElement('div');
    Object.assign(customRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      marginTop: '2px'
    } as CSSStyleDeclaration);

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.placeholder = 'Manual (ej. 1..5)';
    customInput.value = standardOptions.includes(currentValue.trim()) ? '' : currentValue.trim();

    Object.assign(customInput.style, {
      flex: '1',
      border: '1px solid #cbd5e1',
      borderRadius: '6px',
      padding: '4px 8px',
      fontSize: '12px',
      fontWeight: '600',
      color: '#0f172a', // Texto oscuro garantizado, nunca blanco
      background: '#ffffff',
      outline: 'none',
      boxSizing: 'border-box'
    } as CSSStyleDeclaration);

    customInput.addEventListener('focus', () => {
      customInput.style.borderColor = '#2563eb';
      customInput.style.boxShadow = '0 0 0 2px rgba(37, 99, 235, 0.15)';
    });
    customInput.addEventListener('blur', () => {
      customInput.style.borderColor = '#cbd5e1';
      customInput.style.boxShadow = 'none';
    });

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.innerText = 'OK';
    Object.assign(applyBtn.style, {
      background: '#2563eb',
      color: '#ffffff',
      border: 'none',
      borderRadius: '6px',
      padding: '4px 10px',
      fontSize: '11px',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'background 0.15s ease'
    } as CSSStyleDeclaration);

    applyBtn.addEventListener('mouseenter', () => applyBtn.style.background = '#1d4ed8');
    applyBtn.addEventListener('mouseleave', () => applyBtn.style.background = '#2563eb');

    applyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const val = customInput.value.trim();
      if (val) applyValue(val);
      else cleanup();
    });

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = customInput.value.trim();
        if (val) applyValue(val);
        else cleanup();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    });

    customRow.appendChild(customInput);
    customRow.appendChild(applyBtn);
    popover.appendChild(customRow);

    // Eventos de Cierre
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cleanup();
    });

    const onOutsideClick = (e: MouseEvent) => {
      if (!popover.contains(e.target as Node)) {
        cleanup();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanup();
      }
    };

    // Registrar listeners en el ciclo siguiente para evitar que el propio clic inicial lo cierre
    setTimeout(() => {
      document.addEventListener('pointerdown', onOutsideClick);
      document.addEventListener('keydown', onKeyDown);
    }, 50);

    document.body.appendChild(popover);
  }

  // ========= Actualiza la posición de los 4 puertos centrados =========
  updatePorts(model: any) {
    if (!model?.isElement?.()) return;
    const size = typeof model.size === 'function' ? model.size() : (model.get('size') || { width: 150, height: 90 });
    const width = size.width || 150;
    const height = size.height || 90;
    model.portProp('top', 'args', { x: width / 2, y: 0 });
    model.portProp('bottom', 'args', { x: width / 2, y: height });
    model.portProp('left', 'args', { x: 0, y: height / 2 });
    model.portProp('right', 'args', { x: width, y: height / 2 });
  }

  scheduleAutoResize(model: any, paper: any) {
    if (!model?.isElement?.()) return;
    requestAnimationFrame(() => {
      this.autoResizeUmlClass(model, paper);
    });
  }

  // ========= Auto-ajusta el ancho y alto del diagrama UML con métricas exactas, justas y limpias =========
  autoResizeUmlClass(model: any, paper?: any) {
    if (!model?.isElement?.()) return;

    if (typeof model.updateRectangles === 'function') {
      model.updateRectangles();
      this.updatePorts(model);
      return;
    }

    const nameText = (model.get('name') || model.attr('.uml-class-name-text/text') || 'Entidad').trim();
    const rawAttrs = model.get('attributes') ?? model.attr('.uml-class-attrs-text/text') ?? '';
    const rawMeths = model.get('methods') ?? model.attr('.uml-class-methods-text/text') ?? '';

    const attrLines: string[] = typeof rawAttrs === 'string'
      ? rawAttrs.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
      : (Array.isArray(rawAttrs) ? rawAttrs.map((a: any) => `${a.name}: ${a.type}`) : []);

    const methLines: string[] = typeof rawMeths === 'string'
      ? rawMeths.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
      : (Array.isArray(rawMeths) ? rawMeths.map((m: any) => `${m.name}(${m.parameters || ''}): ${m.returnType || 'void'}`) : []);

    let maxChars = nameText.length + 2;
    for (const line of attrLines) {
      if (line.length > maxChars) maxChars = line.length;
    }
    for (const line of methLines) {
      if (line.length > maxChars) maxChars = line.length;
    }

    const optimalWidth = Math.max(this.MIN_W, Math.ceil(maxChars * 7.2 + 20));

    const nameH = this.NAME_H; // 32px
    const attrsH = attrLines.length > 0 ? (attrLines.length * this.LINE_H + this.PAD_V) : 22;
    const methsH = methLines.length > 0 ? (methLines.length * this.LINE_H + this.PAD_V) : 22;
    const totalH = Math.round(nameH + attrsH + methsH);

    const ySep1 = Math.round(nameH);
    const ySep2 = Math.round(nameH + attrsH);

    const formattedAttrsText = attrLines.join('\n');
    const formattedMethsText = methLines.join('\n');

    model.attr({
      '.uml-outer': {
        x: 0,
        y: 0,
        width: optimalWidth,
        height: totalH,
        stroke: '#1e293b',
        strokeWidth: 1.5,
        fill: '#ffffff',
        rx: 0,
        ry: 0
      },
      '.uml-class-name-rect': {
        x: 0,
        y: 0,
        width: optimalWidth,
        height: nameH,
        fill: '#f1f5f9',
        stroke: 'none',
        strokeWidth: 0
      },
      '.sep-name': {
        x1: 0,
        y1: ySep1,
        x2: optimalWidth,
        y2: ySep1,
        stroke: '#1e293b',
        strokeWidth: 1.5,
        shapeRendering: 'crispEdges'
      },
      '.sep-attrs': {
        x1: 0,
        y1: ySep2,
        x2: optimalWidth,
        y2: ySep2,
        stroke: '#1e293b',
        strokeWidth: 1.5,
        shapeRendering: 'crispEdges'
      },
      '.uml-class-name-text': {
        ref: '.uml-class-name-rect',
        refX: 0.5,
        refY: 0.5,
        textAnchor: 'middle',
        yAlignment: 'middle',
        fontWeight: 'bold',
        fontSize: 13,
        fill: '#0f172a',
        text: nameText
      },
      '.uml-class-attrs-text': {
        x: 10,
        y: nameH + 14,
        textAnchor: 'start',
        fontSize: 12,
        fill: '#1e293b',
        text: formattedAttrsText
      },
      '.uml-class-methods-text': {
        x: 10,
        y: ySep2 + 14,
        textAnchor: 'start',
        fontSize: 12,
        fill: '#1e293b',
        text: formattedMethsText
      }
    });

    model.resize(optimalWidth, totalH);
    this.updatePorts(model);
  }
}
