/**
 * ============================================================================
 * XMI Import Service — Importador OMG UML 2.1 / XMI 2.1 desde Enterprise Architect
 * ============================================================================
 *
 * Fase 3 del plan de interoperabilidad con Enterprise Architect.
 *
 * Responsabilidad:
 * Parsear archivos XML en formato OMG UML 2.1 / XMI 2.1 generados por
 * Enterprise Architect (Sparx Systems) o herramientas estándar OMG, y reconstruir
 * un objeto `UmlExportDTO` perfectamente compatible con el diagramador (`diagramService.loadFromJson()`),
 * el generador de Spring Boot y el generador de PostgreSQL 17.
 *
 * @author UML Studio Team
 * @version 1.2.0
 */

import { Injectable } from '@angular/core';
import { UmlExportDTO, UmlClassDTO, UmlRelationshipDTO } from '../exports/diagram-export.service';
import {
  fromXmiPrimitive,
  visibilityFromXmi,
  multiplicityFromXmi,
  generateXmiId,
  XmiMultiplicity
} from '../exports/xmi-type-mapper';

@Injectable({ providedIn: 'root' })
export class XmiImportService {

  /**
   * Lee un archivo .xmi o .xml seleccionado por el usuario y retorna el DTO del diagrama.
   *
   * @param file - Archivo File proveniente de un input file del navegador.
   * @returns Promesa con el UmlExportDTO listo para ser renderizado.
   */
  importFromFile(file: File): Promise<UmlExportDTO> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const xmlText = e.target?.result as string;
          if (!xmlText || xmlText.trim().length === 0) {
            return reject(new Error('El archivo seleccionado está vacío.'));
          }
          const dto = this.parseXmi(xmlText);
          resolve(dto);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => {
        reject(new Error('Error al leer el archivo en el sistema.'));
      };

      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Parsea una cadena de texto XML en formato OMG XMI 2.1 y la transforma en `UmlExportDTO`.
   *
   * @param xmlString - Contenido XML del archivo .xmi
   * @returns Estructura unificada UmlExportDTO
   */
  parseXmi(xmlString: string): UmlExportDTO {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    // 1. Validar si el XML está bien formado
    const parserError = xmlDoc.getElementsByTagName('parsererror');
    if (parserError && parserError.length > 0) {
      const errorMsg = parserError[0].textContent || 'XML malformado';
      throw new Error(`Error de sintaxis XML en el archivo XMI: ${errorMsg}`);
    }

    // 2. Extraer geometrías espaciales de Enterprise Architect (si existen)
    const geometryMap = this.extractEaGeometries(xmlDoc);

    // 3. Extraer propiedades de la Extensión EA (Tipos crudos, parámetros, retornos)
    const eaProps = this.extractEaProperties(xmlDoc);

    // 4. Extraer Clases y su contenido (Atributos, Métodos, Generalizaciones)
    const { classes, classGeneralizations } = this.extractClasses(xmlDoc, geometryMap, eaProps);

    // 5. Extraer Relaciones (Asociaciones, Agregaciones, Composiciones, Dependencias)
    const relationships = this.extractRelationships(xmlDoc, classGeneralizations);

    // 6. Aplicar Autolayout de respaldo para clases que no tengan coordenadas
    this.applyFallbackLayoutIfNeeded(classes);

    return { classes, relationships };
  }

  // ============================================================================
  // MÉTODOS PRIVADOS DE EXTRACCIÓN Y PARSING
  // ============================================================================

  /**
   * Extrae la geometría visual (Left, Top, Width, Height) de la extensión de Enterprise Architect.
   */
  private extractEaGeometries(xmlDoc: Document): Map<string, { x: number; y: number; width: number; height: number }> {
    const geometryMap = new Map<string, { x: number; y: number; width: number; height: number }>();

    const diagramElements = xmlDoc.querySelectorAll('diagram elements element');

    diagramElements.forEach(el => {
      const subject = el.getAttribute('subject') || el.getAttribute('xmi:idref');
      const geometry = el.getAttribute('geometry');

      if (subject && geometry) {
        const geomParts: Record<string, number> = {};
        geometry.split(';').forEach(part => {
          const [k, v] = part.split('=');
          if (k && v !== undefined) {
            geomParts[k.trim()] = parseInt(v.trim(), 10);
          }
        });

        if (geomParts['Left'] !== undefined && geomParts['Top'] !== undefined) {
          const left = geomParts['Left'];
          const top = geomParts['Top'] < 0 ? -geomParts['Top'] : geomParts['Top'];
          const right = geomParts['Right'] !== undefined ? geomParts['Right'] : left + 180;
          const bottom = geomParts['Bottom'] !== undefined
            ? (geomParts['Bottom'] < 0 ? -geomParts['Bottom'] : geomParts['Bottom'])
            : top + 130;

          const width = Math.max(140, Math.abs(right - left));
          const height = Math.max(100, Math.abs(bottom - top));

          geometryMap.set(subject, { x: Math.max(20, left), y: Math.max(20, top), width, height });
        }
      }
    });

    return geometryMap;
  }

  /**
   * Extrae las propiedades exactas (tipos de datos crudos) desde la extensión propietaria de EA.
   */
  private extractEaProperties(xmlDoc: Document): {
    attributes: Map<string, string>;
    operations: Map<string, { returnType?: string; params: Map<string, { pos: number; type: string }> }>;
  } {
    const attributes = new Map<string, string>();
    const operations = new Map<string, { returnType?: string; params: Map<string, { pos: number; type: string }> }>();

    // Atributos EA
    const attrNodes = xmlDoc.getElementsByTagName('attribute');
    for (let i = 0; i < attrNodes.length; i++) {
      const attr = attrNodes[i];
      const idref = attr.getAttribute('xmi:idref');
      const propsNodes = attr.getElementsByTagName('properties');
      if (idref && propsNodes.length > 0) {
        const type = propsNodes[0].getAttribute('type');
        if (type) attributes.set(idref, type);
      }
    }

    // Operaciones EA
    const opNodes = xmlDoc.getElementsByTagName('operation');
    for (let i = 0; i < opNodes.length; i++) {
      const op = opNodes[i];
      const idref = op.getAttribute('xmi:idref');
      if (idref) {
        let returnType: string | undefined = undefined;
        const typeNodes = op.getElementsByTagName('type');
        if (typeNodes.length > 0) {
          returnType = typeNodes[0].getAttribute('type') || undefined;
        }

        const paramsMap = new Map<string, { pos: number; type: string }>();
        const parametersNodes = op.getElementsByTagName('parameters');
        if (parametersNodes.length > 0) {
          const pNodes = parametersNodes[0].getElementsByTagName('parameter');
          for (let j = 0; j < pNodes.length; j++) {
            const p = pNodes[j];
            const pid = p.getAttribute('xmi:idref');
            const pProps = p.getElementsByTagName('properties');
            if (pid && pProps.length > 0) {
              const pType = pProps[0].getAttribute('type');
              const pos = parseInt(pProps[0].getAttribute('pos') || '0', 10);
              if (pType) paramsMap.set(pid, { pos, type: pType });
            }
          }
        }
        operations.set(idref, { returnType, params: paramsMap });
      }
    }

    return { attributes, operations };
  }

  /**
   * Extrae todas las clases (`uml:Class`), sus atributos, métodos y generalizaciones internas.
   */
  private extractClasses(
    xmlDoc: Document,
    geometryMap: Map<string, { x: number; y: number; width: number; height: number }>,
    eaProps: { attributes: Map<string, string>; operations: Map<string, { returnType?: string; params: Map<string, { pos: number; type: string }> }> }
  ): { classes: UmlClassDTO[]; classGeneralizations: UmlRelationshipDTO[] } {
    const classes: UmlClassDTO[] = [];
    const classGeneralizations: UmlRelationshipDTO[] = [];

    const classNodes = Array.from(xmlDoc.querySelectorAll('packagedElement')).filter(el => {
      const type = el.getAttribute('xmi:type') || el.getAttribute('type');
      return type === 'uml:Class' || el.tagName.toLowerCase() === 'uml:class';
    });

    classNodes.forEach(node => {
      const id = node.getAttribute('xmi:id') || node.getAttribute('id') || generateXmiId();
      const name = node.getAttribute('name') || 'UnnamedClass';

      // A. Extraer Atributos (<ownedAttribute>)
      const attributes = this.extractAttributes(node, eaProps.attributes);

      // B. Extraer Métodos / Operaciones (<ownedOperation>)
      const methods = this.extractOperations(node, eaProps.operations);

      // C. Extraer Herencia / Generalizaciones (<generalization>)
      const genNodes = node.querySelectorAll('generalization');
      genNodes.forEach(gen => {
        const parentId = gen.getAttribute('general');
        if (parentId) {
          classGeneralizations.push({
            id: gen.getAttribute('xmi:id') || generateXmiId(),
            type: 'generalization',
            sourceId: id,
            targetId: parentId,
            labels: ['', ''],
            vertices: []
          });
        }
      });

      // D. Coordenadas y Tamaño
      const geo = geometryMap.get(id) || { x: 0, y: 0, width: 180, height: 130 };

      classes.push({
        id,
        name,
        attributes,
        methods,
        position: { x: geo.x, y: geo.y },
        size: { width: geo.width, height: geo.height }
      });
    });

    return { classes, classGeneralizations };
  }

  /**
   * Extrae atributos de una clase (`<ownedAttribute xmi:type="uml:Property">`)
   */
  private extractAttributes(classNode: Element, eaAttributes: Map<string, string>): { name: string; type: string }[] {
    const attributes: { name: string; type: string }[] = [];
    const attrNodes = classNode.querySelectorAll('ownedAttribute');

    attrNodes.forEach(attr => {
      const rawName = attr.getAttribute('name');
      const attrId = attr.getAttribute('xmi:id');
      if (!rawName) return;

      const rawVis = attr.getAttribute('visibility') || 'public';
      const visSymbol = visibilityFromXmi(rawVis);

      let canonicalType = 'string';
      
      // 1. Preferir tipo crudo de EA si existe
      if (attrId && eaAttributes.has(attrId)) {
        canonicalType = eaAttributes.get(attrId)!;
      } else {
        // 2. Fallback: Parsear desde la etiqueta <type> estándar
        let typeName = 'string';
        const typeChild = attr.querySelector('type');
        if (typeChild) {
          const href = typeChild.getAttribute('href');
          if (href) {
            typeName = href.split('#').pop() || 'string';
          } else {
            typeName = typeChild.getAttribute('name') || typeChild.getAttribute('xmi:type') || 'string';
          }
        } else if (attr.getAttribute('type')) {
          typeName = attr.getAttribute('type')!;
        }
        canonicalType = fromXmiPrimitive(typeName);
      }
      const formattedName = `${visSymbol} ${rawName.replace(/^[\+\-\#\~]\s*/, '')}`;

      attributes.push({
        name: formattedName,
        type: canonicalType
      });
    });

    return attributes;
  }

  /**
   * Extrae métodos/operaciones de una clase (`<ownedOperation xmi:type="uml:Operation">`)
   */
  private extractOperations(
    classNode: Element,
    eaOperations: Map<string, { returnType?: string; params: Map<string, { pos: number; type: string }> }>
  ): { name: string; parameters?: string; returnType?: string }[] {
    const methods: { name: string; parameters?: string; returnType?: string }[] = [];
    const opNodes = classNode.querySelectorAll('ownedOperation');

    opNodes.forEach(op => {
      const rawName = op.getAttribute('name');
      const opId = op.getAttribute('xmi:id');
      if (!rawName) return;

      const rawVis = op.getAttribute('visibility') || 'public';
      const visSymbol = visibilityFromXmi(rawVis);
      const cleanName = `${visSymbol} ${rawName.replace(/^[\+\-\#\~]\s*/, '')}`;

      const eaOp = (opId && eaOperations.has(opId)) ? eaOperations.get(opId) : null;
      let returnType = eaOp?.returnType || 'void';

      const paramNodes = op.querySelectorAll('ownedParameter');
      const paramsList: { pos: number, text: string }[] = [];

      paramNodes.forEach((p, index) => {
        const direction = p.getAttribute('direction') || 'in';
        const pName = p.getAttribute('name') || 'param';
        const pid = p.getAttribute('xmi:id');

        let canonicalPType = 'string';
        let pos = index;

        // 1. Preferir tipo crudo y posición de EA si existe
        if (pid && eaOp && eaOp.params.has(pid)) {
          const eaParam = eaOp.params.get(pid)!;
          canonicalPType = eaParam.type;
          pos = eaParam.pos;
        } else {
          // 2. Fallback: Parsear <type> estándar
          let pTypeName = 'string';
          const typeChild = p.querySelector('type');
          if (typeChild) {
            const href = typeChild.getAttribute('href');
            if (href) {
              pTypeName = href.split('#').pop() || 'string';
            } else {
              pTypeName = typeChild.getAttribute('name') || typeChild.getAttribute('xmi:type') || 'string';
            }
          } else if (p.getAttribute('type')) {
            pTypeName = p.getAttribute('type')!;
          }
          canonicalPType = fromXmiPrimitive(pTypeName);
        }

        if (direction === 'return') {
          if (!eaOp?.returnType) {
            returnType = canonicalPType; // Solo usar fallback si EA no definió el retorno explícito
          }
        } else {
          paramsList.push({ pos, text: `${pName}: ${canonicalPType}` });
        }
      });

      // Ordenar los parámetros por la posición dictada por EA (importante!)
      paramsList.sort((a, b) => a.pos - b.pos);
      const formattedParams = paramsList.map(p => p.text).join(', ');

      methods.push({
        name: cleanName,
        parameters: formattedParams,
        returnType: returnType === 'void' ? undefined : returnType
      });
    });

    return methods;
  }

  /**
   * Extrae relaciones de Asociación, Agregación, Composición, Herencia y Dependencia del documento.
   * Soporta tanto conectores enriquecidos de Enterprise Architect (<xmi:Extension><connector>)
   * como asociaciones OMG UML 2.1 estándar (<packagedElement xmi:type="uml:Association">).
   */
  private extractRelationships(
    xmlDoc: Document,
    generalizations: UmlRelationshipDTO[]
  ): UmlRelationshipDTO[] {
    const relationships: UmlRelationshipDTO[] = [];
    const processedConnectorIds = new Set<string>();
    const relationKeys = new Set<string>();

    const addRel = (rel: UmlRelationshipDTO) => {
      const key = `${rel.sourceId}_${rel.targetId}_${rel.type}`;
      if (!relationKeys.has(key)) {
        relationKeys.add(key);
        if (rel.id) processedConnectorIds.add(rel.id);
        relationships.push(rel);
      }
    };

    // 1. Procesar primero los conectores enriquecidos de Enterprise Architect (<connector>)
    const eaConnectors = Array.from(xmlDoc.getElementsByTagName('connector'));
    eaConnectors.forEach(conn => {
      const id = conn.getAttribute('xmi:idref') || conn.getAttribute('id') || generateXmiId();
      if (processedConnectorIds.has(id)) return;

      const srcEl = conn.querySelector('source');
      const trgEl = conn.querySelector('target');
      const propsEl = conn.querySelector('properties');
      const labelsEl = conn.querySelector('labels');

      const srcId = srcEl ? (srcEl.getAttribute('xmi:idref') || srcEl.getAttribute('id') || '') : '';
      const trgId = trgEl ? (trgEl.getAttribute('xmi:idref') || trgEl.getAttribute('id') || '') : '';

      if (!srcId || !trgId) return;

      const eaType = propsEl ? (propsEl.getAttribute('ea_type') || '') : '';
      const subtype = propsEl ? (propsEl.getAttribute('subtype') || '') : '';

      const srcTypeEl = srcEl ? srcEl.querySelector('type') : null;
      const trgTypeEl = trgEl ? trgEl.querySelector('type') : null;

      const srcAgg = (srcTypeEl?.getAttribute('aggregation') || 'none').toLowerCase();
      const trgAgg = (trgTypeEl?.getAttribute('aggregation') || 'none').toLowerCase();

      const srcMult = srcTypeEl?.getAttribute('multiplicity') || '';
      const trgMult = trgTypeEl?.getAttribute('multiplicity') || '';

      const lb = labelsEl?.getAttribute('lb') || '';
      const rb = labelsEl?.getAttribute('rb') || '';

      let relType = 'association';
      if (eaType === 'Generalization') {
        relType = 'generalization';
      } else if (eaType === 'Dependency') {
        relType = 'dependency';
      } else if (eaType === 'Aggregation' || eaType === 'Association') {
        if (srcAgg === 'composite' || trgAgg === 'composite' || subtype === 'Strong') {
          relType = 'composition';
        } else if (srcAgg === 'shared' || trgAgg === 'shared' || subtype === 'Weak' || eaType === 'Aggregation') {
          relType = 'aggregation';
        } else {
          relType = 'association';
        }
      }

      let multSource = '';
      let multTarget = '';

      if (['association', 'aggregation', 'composition'].includes(relType)) {
        const isSelf = srcId === trgId;
        multSource = lb || srcMult || (isSelf ? '0..1' : '1..1');
        multTarget = rb || trgMult || (relType === 'composition' ? '1..*' : '0..*');
      }

      addRel({
        id,
        type: relType,
        sourceId: srcId,
        targetId: trgId,
        labels: [multSource, multTarget],
        vertices: []
      });
    });

    // 2. Incorporar generalizaciones extraídas directamente de las clases OMG (<generalization>)
    generalizations.forEach(gen => {
      addRel(gen);
    });

    // 3. Fallback: Procesar <packagedElement xmi:type="uml:Association"> estándar OMG si no vino por EA
    const assocNodes = Array.from(xmlDoc.querySelectorAll('packagedElement')).filter(el => {
      const type = el.getAttribute('xmi:type') || el.getAttribute('type');
      return type === 'uml:Association' || el.tagName.toLowerCase() === 'uml:association';
    });

    assocNodes.forEach(assoc => {
      const id = assoc.getAttribute('xmi:id') || generateXmiId();
      if (processedConnectorIds.has(id)) return;

      const ownedEnds = Array.from(assoc.querySelectorAll('ownedEnd'));
      if (ownedEnds.length >= 2) {
        const endSource = ownedEnds[0];
        const endTarget = ownedEnds[1];

        const sourceTypeNode = endSource.querySelector('type');
        const targetTypeNode = endTarget.querySelector('type');

        let sourceId = sourceTypeNode ? (sourceTypeNode.getAttribute('xmi:idref') || sourceTypeNode.getAttribute('href')) : '';
        let targetId = targetTypeNode ? (targetTypeNode.getAttribute('xmi:idref') || targetTypeNode.getAttribute('href')) : '';

        if (!sourceId) sourceId = endSource.getAttribute('type') || '';
        if (!targetId) targetId = endTarget.getAttribute('type') || '';

        if (sourceId && targetId) {
          const aggSource = (endSource.getAttribute('aggregation') || 'none').toLowerCase();
          const aggTarget = (endTarget.getAttribute('aggregation') || 'none').toLowerCase();

          let relType = 'association';
          if (aggSource === 'composite' || aggTarget === 'composite') {
            relType = 'composition';
          } else if (aggSource === 'shared' || aggTarget === 'shared') {
            relType = 'aggregation';
          }

          const multSource = this.extractMultiplicity(endSource);
          const multTarget = this.extractMultiplicity(endTarget);

          addRel({
            id,
            type: relType,
            sourceId,
            targetId,
            labels: [multSource, multTarget],
            vertices: []
          });
        }
      }
    });

    // 4. Fallback: Procesar <packagedElement xmi:type="uml:Dependency"> estándar OMG
    const depNodes = Array.from(xmlDoc.querySelectorAll('packagedElement')).filter(el => {
      const type = el.getAttribute('xmi:type') || el.getAttribute('type');
      return type === 'uml:Dependency' || el.tagName.toLowerCase() === 'uml:dependency';
    });

    depNodes.forEach(dep => {
      const id = dep.getAttribute('xmi:id') || generateXmiId();
      if (processedConnectorIds.has(id)) return;

      const client = dep.getAttribute('client') || '';
      const supplier = dep.getAttribute('supplier') || '';

      if (client && supplier) {
        addRel({
          id,
          type: 'dependency',
          sourceId: client,
          targetId: supplier,
          labels: ['', ''],
          vertices: []
        });
      }
    });

    return relationships;
  }

  /**
   * Extrae y formatea la multiplicidad de un nodo <ownedEnd>
   */
  private extractMultiplicity(endNode: Element): string {
    const lowerNode = endNode.querySelector('lowerValue');
    const upperNode = endNode.querySelector('upperValue');

    let lower = 1;
    let upper = 1;

    if (lowerNode) {
      const val = lowerNode.getAttribute('value');
      if (val !== null && val !== undefined) {
        lower = parseInt(val, 10) || 0;
      }
    }

    if (upperNode) {
      const val = upperNode.getAttribute('value');
      if (val === '*' || val === '-1') {
        upper = -1;
      } else if (val !== null && val !== undefined) {
        upper = parseInt(val, 10) || 1;
      }
    }

    const multObj: XmiMultiplicity = { lower, upper };
    return multiplicityFromXmi(multObj);
  }

  /**
   * Aplica un layout en cuadrícula automático si las clases carecen de coordenadas.
   */
  private applyFallbackLayoutIfNeeded(classes: UmlClassDTO[]): void {
    const needsLayout = classes.every(c => c.position.x === 0 && c.position.y === 0);
    if (!needsLayout && classes.some(c => c.position.x !== 0 || c.position.y !== 0)) {
      let nextX = 60;
      let nextY = 60;
      classes.forEach(c => {
        if (c.position.x === 0 && c.position.y === 0) {
          c.position = { x: nextX, y: nextY };
          nextX += 240;
          if (nextX > 800) {
            nextX = 60;
            nextY += 200;
          }
        }
      });
      return;
    }

    if (needsLayout) {
      const columns = 3;
      const startX = 60;
      const startY = 60;
      const spacingX = 250;
      const spacingY = 220;

      classes.forEach((cls, idx) => {
        const col = idx % columns;
        const row = Math.floor(idx / columns);
        cls.position = {
          x: startX + col * spacingX,
          y: startY + row * spacingY
        };
      });
    }
  }
}
