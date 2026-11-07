import { Injectable } from '@angular/core';

export interface UmlClassDTO {
  id: string;
  name: string;
  attributes: { name: string; type: string }[];
  methods: { name: string; parameters?: string; returnType?: string }[];
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface UmlRelationshipDTO {
  id: string;
  type: string;              // association | aggregation | generalization | etc.
  sourceId: string;
  targetId: string;
  labels?: string[];
  vertices?: { x: number; y: number }[];
}

export interface UmlExportDTO {
  classes: UmlClassDTO[];
  relationships: UmlRelationshipDTO[];
}

@Injectable({ providedIn: 'root' })
export class DiagramExportService {
  /**
   * Exporta el grafo a un JSON limpio y usable para el backend
   */
  export(graph: any): UmlExportDTO {
    const classes: UmlClassDTO[] = [];
    const relationships: UmlRelationshipDTO[] = [];

    graph.getCells().forEach((cell: any) => {
      if (cell.isElement?.()) {
        const rawAttrs = cell.get('attributes');
        const rawMeths = cell.get('methods');

        const attributes = Array.isArray(rawAttrs)
          ? rawAttrs
          : this.parseAttributesFromText(rawAttrs);

        const methods = Array.isArray(rawMeths)
          ? rawMeths
          : this.parseMethodsFromText(rawMeths);

        classes.push({
          id: cell.id,
          name: cell.get('name'),
          attributes,
          methods,
          position: cell.position(),  // Posicion del elemento
          size: cell.size()           // Dimensiones del elemento
        });
      } else if (cell.isLink?.()) {
        relationships.push({
          id: cell.id,
          type: cell.get('relationType') || 'association',
          sourceId: cell.get('source')?.id,
          targetId: cell.get('target')?.id,
          labels: (cell.get('labels') || []).map((lbl: any) => lbl.attrs?.text?.text),
          vertices: cell.get('vertices') || []   
        });
      }
    });

    return { classes, relationships };
  }

  // ========= Helpers privados =========

  private parseAttributesFromText(text: string): { name: string; type: string }[] {
    if (!text) return [];
    return text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(line => {
        const parts = line.split(':');
        const name = (parts[0] || '').trim();
        const type = (parts[1] || 'string').trim();
        return { name, type };
      })
      .filter(attr => attr.name.length > 0);
  }

  private parseMethodsFromText(text: string): { name: string; parameters?: string; returnType?: string }[] {
    if (!text) return [];
    return text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0)
      .map(line => {
        const cleanLine = line.replace(/;$/, '').trim();
        // Regex modified to capture the visibility prefix as part of the name
        const match = cleanLine.match(/^([+\-#~]?\s*\w+)\(([^)]*)\)(?::\s*(\w+))?/);
        if (match) {
          return {
            name: match[1].trim(),
            parameters: match[2] || '',
            returnType: match[3] || 'void'
          };
        }
        return { name: cleanLine };
      })
      .filter(m => m.name.length > 0);
  }
}
