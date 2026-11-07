import { Component, EventEmitter, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { isValidPrimaryKeyType } from '../../../../services/exports/xmi-type-mapper';

export interface UmlAttributeItem {
  id: string;
  visibility: string; // '+', '-', '#', '~'
  name: string;
  type: string;
}

export interface UmlMethodItem {
  id: string;
  visibility: string; // '+', '-', '#', '~'
  name: string;
  parameters: string;
  returnType: string;
}

@Component({
  selector: 'app-class-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './class-editor-modal.html',
  styleUrls: ['./class-editor-modal.css']
})
export class ClassEditorModal {
  @Output() save = new EventEmitter<{
    cellId: string;
    name: string;
    attributesText: string;
    methodsText: string;
  }>();
  @Output() close = new EventEmitter<void>();

  // Estado del Modal
  isOpen = signal<boolean>(false);
  activeTab = signal<'attrs' | 'methods' | 'preview'>('attrs');
  cellModel: any = null;

  // Datos principales de la clase
  className = signal<string>('');
  attributes = signal<UmlAttributeItem[]>([]);
  methods = signal<UmlMethodItem[]>([]);

  // Formulario Atributo (Nuevo o Editando)
  attrEditingId = signal<string | null>(null);
  attrVisibility = signal<string>('-');
  attrName = signal<string>('');
  attrType = signal<string>('string');

  // Formulario Método (Nuevo o Editando)
  methodEditingId = signal<string | null>(null);
  methodVisibility = signal<string>('+');
  methodName = signal<string>('');
  methodParameters = signal<string>('');
  methodReturnType = signal<string>('void');

  // Catálogos Predefinidos de Tipos
  readonly VISIBILITIES = [
    { symbol: '-', label: '- Private (Recomendado)', desc: 'Encapsulado' },
    { symbol: '+', label: '+ Public', desc: 'Accesible' },
    { symbol: '#', label: '# Protected', desc: 'Herencia' },
    { symbol: '~', label: '~ Package', desc: 'Paquete' }
  ];

  readonly DATA_TYPES = [
    { value: 'int', label: 'int (Entero 32-bit)', group: 'Numéricos' },
    { value: 'long', label: 'long (Entero 64-bit / ID)', group: 'Numéricos' },
    { value: 'double', label: 'double (Decimal precisión)', group: 'Numéricos' },
    { value: 'float', label: 'float (Decimal simple)', group: 'Numéricos' },
    { value: 'decimal', label: 'decimal (Monetario / BigDecimal)', group: 'Numéricos' },
    { value: 'string', label: 'string (Texto / Varchar)', group: 'Texto' },
    { value: 'boolean', label: 'boolean (Verdadero / Falso)', group: 'Lógicos' },
    { value: 'date', label: 'date (Fecha YYYY-MM-DD)', group: 'Temporales' },
    { value: 'datetime', label: 'datetime (Fecha y Hora)', group: 'Temporales' }
  ];

  readonly RETURN_TYPES = [
    { value: 'void', label: 'void (Sin retorno)' },
    { value: 'boolean', label: 'boolean' },
    { value: 'int', label: 'int' },
    { value: 'long', label: 'long' },
    { value: 'string', label: 'string' },
    { value: 'double', label: 'double' },
    { value: 'float', label: 'float' },
    { value: 'date', label: 'date' },
    { value: 'datetime', label: 'datetime' },
    { value: 'decimal', label: 'decimal' }
  ];

  // Vista Previa de la generación
  previewAttributesText = computed(() => {
    return this.attributes().map(a => a.visibility + ' ' + a.name + ': ' + a.type).join('\n');
  });

  // Detección unificada de la Clave Primaria (PK) para la UI
  primaryKeyAttrId = computed<string | null>(() => {
    const list = this.attributes();
    if (list.length === 0) return null;
    const cName = this.className().toLowerCase().trim();

    // 1. Prioridad: atributo con nombre 'id', 'id_...', '..._id', 'id' + nombreClase
    const idAttr = list.find(a => {
      const n = (a.name || '').toLowerCase().trim();
      return n === 'id' || n === 'id_' + cName || n === 'id' + cName || n.startsWith('id_') || n.endsWith('_id');
    });
    if (idAttr) return idAttr.id;

    // 2. Prioridad: primer atributo con tipo de dato válido para PK (int, long, string)
    const validAttr = list.find(a => isValidPrimaryKeyType(a.type));
    if (validAttr) return validAttr.id;

    // 3. Fallback: primer atributo de la lista
    return list[0].id;
  });

  previewMethodsText = computed(() => {
    return this.methods().map(m => {
      const p = m.parameters ? '(' + m.parameters + ')' : '()';
      const r = m.returnType ? ': ' + m.returnType : ': void';
      return m.visibility + ' ' + m.name + p + r + ';';
    }).join('\n');
  });

  /**
   * Abre el modal cargando los datos de la celda de JointJS seleccionada
   */
  openForCell(cellModel: any): void {
    if (!cellModel || !cellModel.isElement?.()) return;

    this.cellModel = cellModel;
    const rawName = cellModel.get('name') || cellModel.attr('.uml-class-name-text/text') || 'Entidad';
    const rawAttrs = cellModel.get('attributes') || cellModel.attr('.uml-class-attrs-text/text') || '';
    const rawMethods = cellModel.get('methods') || cellModel.attr('.uml-class-methods-text/text') || '';

    this.className.set(rawName.trim());
    this.attributes.set(this.parseAttributes(rawAttrs));
    this.methods.set(this.parseMethods(rawMethods));

    this.resetAttrForm();
    this.resetMethodForm();
    this.activeTab.set('attrs');
    this.isOpen.set(true);
  }

  closeModal(): void {
    this.isOpen.set(false);
    this.cellModel = null;
    this.close.emit();
  }

  // =========================================================================
  // GESTIÓN DE ATRIBUTOS
  // =========================================================================

  saveAttribute(): void {
    const rawName = this.attrName().trim();
    if (!rawName) return;

    // Formatear nombre en camelCase seguro (sin espacios ni caracteres raros)
    const cleanName = rawName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const visibility = this.attrVisibility();
    const type = this.attrType();

    const current = [...this.attributes()];
    const editingId = this.attrEditingId();

    if (editingId) {
      // Modificar existente
      const idx = current.findIndex(a => a.id === editingId);
      if (idx !== -1) {
        current[idx] = { id: editingId, visibility, name: cleanName, type };
      }
    } else {
      // Añadir nuevo
      current.push({
        id: 'attr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        visibility,
        name: cleanName,
        type
      });
    }

    this.attributes.set(current);
    this.resetAttrForm();
  }

  editAttribute(attr: UmlAttributeItem): void {
    this.attrEditingId.set(attr.id);
    this.attrVisibility.set(attr.visibility);
    this.attrName.set(attr.name);
    this.attrType.set(attr.type);
  }

  deleteAttribute(id: string): void {
    this.attributes.set(this.attributes().filter(a => a.id !== id));
    if (this.attrEditingId() === id) {
      this.resetAttrForm();
    }
  }

  moveAttribute(index: number, direction: 'up' | 'down'): void {
    const list = [...this.attributes()];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    this.attributes.set(list);
  }

  resetAttrForm(): void {
    this.attrEditingId.set(null);
    this.attrVisibility.set('-');
    this.attrName.set('');
    this.attrType.set('string');
  }

  // =========================================================================
  // GESTIÓN DE MÉTODOS
  // =========================================================================

  saveMethod(): void {
    const rawName = this.methodName().trim();
    if (!rawName) return;

    const cleanName = rawName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
    const visibility = this.methodVisibility();
    const parameters = this.methodParameters().trim();
    const returnType = this.methodReturnType();

    const current = [...this.methods()];
    const editingId = this.methodEditingId();

    if (editingId) {
      // Modificar existente
      const idx = current.findIndex(m => m.id === editingId);
      if (idx !== -1) {
        current[idx] = { id: editingId, visibility, name: cleanName, parameters, returnType };
      }
    } else {
      // Añadir nuevo
      current.push({
        id: 'meth_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        visibility,
        name: cleanName,
        parameters,
        returnType
      });
    }

    this.methods.set(current);
    this.resetMethodForm();
  }

  editMethod(method: UmlMethodItem): void {
    this.methodEditingId.set(method.id);
    this.methodVisibility.set(method.visibility);
    this.methodName.set(method.name);
    this.methodParameters.set(method.parameters);
    this.methodReturnType.set(method.returnType);
  }

  deleteMethod(id: string): void {
    this.methods.set(this.methods().filter(m => m.id !== id));
    if (this.methodEditingId() === id) {
      this.resetMethodForm();
    }
  }

  moveMethod(index: number, direction: 'up' | 'down'): void {
    const list = [...this.methods()];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const temp = list[index];
    list[index] = list[targetIndex];
    list[targetIndex] = temp;
    this.methods.set(list);
  }

  resetMethodForm(): void {
    this.methodEditingId.set(null);
    this.methodVisibility.set('+');
    this.methodName.set('');
    this.methodParameters.set('');
    this.methodReturnType.set('void');
  }

  // =========================================================================
  // GUARDAR DEFINITIVO Y SINCRONIZAR
  // =========================================================================

  applyChanges(): void {
    if (!this.cellModel) return;

    let cleanClassName = this.className().trim();
    if (!cleanClassName) cleanClassName = 'Entidad';
    // Auto-formato PascalCase (ej: DetalleVenta)
    cleanClassName = cleanClassName.charAt(0).toUpperCase() + cleanClassName.slice(1);

    const attrsText = this.previewAttributesText();
    const methodsText = this.previewMethodsText();

    this.save.emit({
      cellId: this.cellModel.id,
      name: cleanClassName,
      attributesText: attrsText,
      methodsText: methodsText
    });

    this.closeModal();
  }

  // =========================================================================
  // PARSERS BIDIRECCIONALES
  // =========================================================================

  private parseAttributes(text: string): UmlAttributeItem[] {
    if (!text) return [];
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((line, idx) => {
        // Regex para detectar: [+|-|#|~] nombre: tipo
        const match = line.match(/^([\+\-\#\~])?\s*([^:]+)(?::\s*(.+))?$/);
        if (match) {
          const vis = match[1] || '-';
          const name = (match[2] || '').trim();
          let type = (match[3] || 'string').trim().toLowerCase();
          type = type.replace(/;$/, '');
          return {
            id: 'attr_' + idx + '_' + Math.random().toString(36).substring(2, 6),
            visibility: vis,
            name: name,
            type: type || 'string'
          };
        }
        return {
          id: 'attr_' + idx,
          visibility: '-',
          name: line.replace(/[^a-zA-Z0-9_]/g, ''),
          type: 'string'
        };
      })
      .filter(a => a.name.length > 0);
  }

  private parseMethods(text: string): UmlMethodItem[] {
    if (!text) return [];
    return text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map((line, idx) => {
        const clean = line.replace(/;$/, '').trim();
        // Regex: [+|-|#|~] nombre(params): returnType
        const match = clean.match(/^([\+\-\#\~])?\s*([a-zA-Z0-9_]+)(?:\(([^)]*)\))?(?::\s*([a-zA-Z0-9_]+))?$/);
        if (match) {
          return {
            id: 'meth_' + idx + '_' + Math.random().toString(36).substring(2, 6),
            visibility: match[1] || '+',
            name: match[2],
            parameters: (match[3] || '').trim(),
            returnType: (match[4] || 'void').trim()
          };
        }
        return {
          id: 'meth_' + idx,
          visibility: '+',
          name: clean.replace(/[^a-zA-Z0-9_]/g, ''),
          parameters: '',
          returnType: 'void'
        };
      })
      .filter(m => m.name.length > 0);
  }
}
