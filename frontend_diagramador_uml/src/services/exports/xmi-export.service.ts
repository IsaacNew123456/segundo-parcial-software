/**
 * ============================================================================
 * XMI Export Service — Exportador OMG UML 2.1 / XMI 2.1 para Enterprise Architect
 * ============================================================================
 *
 * Arquitectura de Interoperabilidad con Sparx Systems Enterprise Architect:
 *
 * 1. Paquete Contenedor en UML:
 *    <uml:Model> -> <packagedElement xmi:type="uml:Package" xmi:id="packageId"> -> Clases
 *
 * 2. Registro de Paquete en Extensión EA:
 *    <elements> -> <element xmi:idref="packageId" xmi:type="uml:Package">
 *    Esto permite que EA registre el paquete en su tabla interna antes de
 *    insertar el diagrama visual (<diagram> -> <model package="packageId">).
 *
 * 3. Geometría y Coordenadas Visuales:
 *    Left=X;Top=-Y;Right=X+W;Bottom=-(Y+H); con DUIDs hex de 8 caracteres.
 *
 * @author UML Studio Team
 * @version 1.4.0
 */

import { Injectable } from '@angular/core';
import { UmlExportDTO, UmlClassDTO, UmlRelationshipDTO } from './diagram-export.service';
import {
  toXmiPrimitive,
  visibilityToXmi,
  multiplicityToXmi,
  generateXmiId,
  generateDuid,
  XmiPrimitiveType,
  XmiMultiplicity
} from './xmi-type-mapper';

@Injectable({ providedIn: 'root' })
export class XmiExportService {

  /**
   * Genera el documento XML XMI 2.1 completo a partir de los datos del diagrama.
   *
   * @param umlJson - Objeto DTO con las clases y relaciones exportadas del lienzo.
   * @param modelName - Nombre del paquete y diagrama (default: 'Diagrama_Clases').
   * @returns Cadena de texto con el XML estructurado y formateado.
   */
  exportToXmi(umlJson: UmlExportDTO, modelName: string = 'Diagrama_Clases'): string {
    const classes = umlJson.classes || [];
    const relationships = umlJson.relationships || [];

    // 1. Mapa de IDs internos a IDs canónicos de Enterprise Architect (EAID_...)
    const classIdMap = new Map<string, string>();
    classes.forEach(c => {
      classIdMap.set(c.id, generateXmiId());
    });

    const relIdMap = new Map<string, string>();
    relationships.forEach(r => {
      relIdMap.set(r.id, generateXmiId());
    });

    const modelId = generateXmiId('EAPK_');
    const packageId = generateXmiId('EAPK_');
    const diagramId = generateXmiId('EAID_');

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // 2. Construcción por capas del documento XML
    const xmlParts: string[] = [];

    xmlParts.push('<?xml version="1.0" encoding="utf-8"?>');
    xmlParts.push('<xmi:XMI xmi:version="2.1" xmlns:uml="http://schema.omg.org/spec/UML/2.1" xmlns:xmi="http://schema.omg.org/spec/XMI/2.1">');

    // Metadatos de Enterprise Architect
    xmlParts.push('  <xmi:Documentation exporter="Enterprise Architect" exporterVersion="6.5"/>');

    // Modelo UML Principal con Paquete Raíz
    xmlParts.push(`  <uml:Model xmi:type="uml:Model" name="EA_Model" xmi:id="${modelId}">`);
    xmlParts.push(`    <packagedElement xmi:type="uml:Package" xmi:id="${packageId}" name="${this.escapeXml(modelName)}">`);

    // A. Clases, Atributos, Métodos y Generalizaciones
    for (const cls of classes) {
      const eaClassId = classIdMap.get(cls.id)!;
      xmlParts.push(this.buildClassXml(cls, eaClassId, relationships, classIdMap));
    }

    // B. Relaciones de Asociación, Agregación, Composición y Dependencia
    for (const rel of relationships) {
      const relXml = this.buildRelationshipXml(rel, classIdMap, relIdMap, classes);
      if (relXml) {
        xmlParts.push(relXml);
      }
    }

    xmlParts.push('    </packagedElement>');
    xmlParts.push('  </uml:Model>');

    // C. Extensión visual de Enterprise Architect
    xmlParts.push(this.buildEaExtension(classes, relationships, classIdMap, relIdMap, packageId, diagramId, modelName, nowStr));

    xmlParts.push('</xmi:XMI>');

    return xmlParts.join('\n');
  }

  // ============================================================================
  // MÉTODOS PRIVADOS DE CONSTRUCCIÓN XML
  // ============================================================================

  /**
   * Construye el nodo XML `<packagedElement xmi:type="uml:Class">`
   */
  private buildClassXml(
    cls: UmlClassDTO,
    eaClassId: string,
    relationships: UmlRelationshipDTO[],
    classIdMap: Map<string, string>
  ): string {
    const lines: string[] = [];
    const className = this.escapeXml(cls.name || 'UnnamedClass');

    lines.push(`      <packagedElement xmi:type="uml:Class" xmi:id="${eaClassId}" name="${className}">`);

    // 1. Herencia (Generalization): Si esta clase es la fuente ('child') en una generalización
    const genRels = relationships.filter(r => r.type === 'generalization' && r.sourceId === cls.id);
    for (const gen of genRels) {
      const parentEaId = classIdMap.get(gen.targetId);
      if (parentEaId) {
        const genId = generateXmiId();
        lines.push(`        <generalization xmi:type="uml:Generalization" xmi:id="${genId}" general="${parentEaId}"/>`);
      }
    }

    // 2. Atributos
    if (cls.attributes && cls.attributes.length > 0) {
      cls.attributes.forEach((attr, idx) => {
        lines.push(this.buildAttributeXml(cls.id, attr, idx));
      });
    }

    // 3. Métodos / Operaciones
    if (cls.methods && cls.methods.length > 0) {
      cls.methods.forEach((meth, idx) => {
        lines.push(this.buildOperationXml(cls.id, meth, idx));
      });
    }

    lines.push('      </packagedElement>');
    return lines.join('\n');
  }

  /**
   * Construye un atributo `<ownedAttribute xmi:type="uml:Property">`
   */
  private buildAttributeXml(classId: string, attr: { name: string; type: string }, index: number): string {
    const attrId = `EAID_ATTR_${classId.replace(/[^a-zA-Z0-9]/g, '')}_${index}`;
    const rawName = (attr.name || '').trim();

    // Extraer visibilidad si viene prefijada (+, -, #, ~)
    const visMatch = rawName.match(/^([\+\-\#\~])\s*(.*)$/);
    const visSymbol = visMatch ? visMatch[1] : '+';
    const cleanName = visMatch ? visMatch[2] : rawName;
    const visibility = visibilityToXmi(visSymbol);

    const xmiPrim = toXmiPrimitive(attr.type || 'string');
    const safeName = this.escapeXml(cleanName || 'unnamedAttr');

    const lines: string[] = [];
    lines.push(`        <ownedAttribute xmi:type="uml:Property" xmi:id="${attrId}" name="${safeName}" visibility="${visibility}">`);
    lines.push(`          <type xmi:type="${xmiPrim.xmiType}" name="${this.escapeXml(xmiPrim.name)}"/>`);
    lines.push('        </ownedAttribute>');

    return lines.join('\n');
  }

  /**
   * Construye una operación/método `<ownedOperation xmi:type="uml:Operation">`
   */
  private buildOperationXml(classId: string, meth: { name: string; parameters?: string; returnType?: string }, index: number): string {
    const opId = `EAID_OP_${classId.replace(/[^a-zA-Z0-9]/g, '')}_${index}`;
    const rawName = (meth.name || '').trim();

    // Extraer visibilidad
    const visMatch = rawName.match(/^([\+\-\#\~])\s*(.*)$/);
    const visSymbol = visMatch ? visMatch[1] : '+';
    const cleanName = visMatch ? visMatch[2] : rawName;
    const visibility = visibilityToXmi(visSymbol);

    const safeName = this.escapeXml(cleanName || 'unnamedMethod');

    const lines: string[] = [];
    lines.push(`        <ownedOperation xmi:type="uml:Operation" xmi:id="${opId}" name="${safeName}" visibility="${visibility}">`);

    // Parámetros de entrada
    if (meth.parameters && meth.parameters.trim().length > 0) {
      const rawParams = meth.parameters.split(',').map(p => p.trim()).filter(p => p.length > 0);
      rawParams.forEach((paramStr, pIdx) => {
        const paramId = `EAID_PRM_${classId.replace(/[^a-zA-Z0-9]/g, '')}_${index}_${pIdx}`;
        let pName = paramStr;
        let pType = 'string';

        if (paramStr.includes(':')) {
          const parts = paramStr.split(':');
          pName = (parts[0] || '').trim();
          pType = (parts[1] || 'string').trim();
        } else if (paramStr.includes(' ')) {
          const parts = paramStr.split(/\s+/);
          pType = (parts[0] || 'string').trim();
          pName = (parts[1] || 'param').trim();
        }

        const pXmiType = toXmiPrimitive(pType);
        lines.push(`          <ownedParameter xmi:type="uml:Parameter" xmi:id="${paramId}" name="${this.escapeXml(pName)}" direction="in">`);
        lines.push(`            <type xmi:type="${pXmiType.xmiType}" name="${this.escapeXml(pXmiType.name)}"/>`);
        lines.push('          </ownedParameter>');
      });
    }

    // Parámetro de retorno (si es distinto de void)
    const retTypeStr = (meth.returnType || '').trim().toLowerCase();
    if (retTypeStr && retTypeStr !== 'void') {
      const retId = `EAID_RET_${classId.replace(/[^a-zA-Z0-9]/g, '')}_${index}`;
      const retXmiType = toXmiPrimitive(retTypeStr);
      lines.push(`          <ownedParameter xmi:type="uml:Parameter" xmi:id="${retId}" name="return" direction="return">`);
      lines.push(`            <type xmi:type="${retXmiType.xmiType}" name="${this.escapeXml(retXmiType.name)}"/>`);
      lines.push('          </ownedParameter>');
    }

    lines.push('        </ownedOperation>');
    return lines.join('\n');
  }

  /**
   * Construye las relaciones OMG (Asociación, Agregación, Composición, Dependencia)
   */
  private buildRelationshipXml(
    rel: UmlRelationshipDTO,
    classIdMap: Map<string, string>,
    relIdMap: Map<string, string>,
    classes: UmlClassDTO[]
  ): string | null {
    if (rel.type === 'generalization') {
      return null;
    }

    const sourceEaId = classIdMap.get(rel.sourceId);
    const targetEaId = classIdMap.get(rel.targetId);
    if (!sourceEaId || !targetEaId) return null;

    const sourceClass = classes.find(c => c.id === rel.sourceId);
    const targetClass = classes.find(c => c.id === rel.targetId);
    const sourceName = sourceClass ? sourceClass.name : 'Source';
    const targetName = targetClass ? targetClass.name : 'Target';

    // 1. Dependencia (<uml:Dependency>)
    if (rel.type === 'dependency') {
      const depId = relIdMap.get(rel.id)!;
      return `      <packagedElement xmi:type="uml:Dependency" xmi:id="${depId}" client="${sourceEaId}" supplier="${targetEaId}"/>`;
    }

    // 2. Asociación, Agregación o Composición (<uml:Association>)
    const assocId = relIdMap.get(rel.id)!;
    const endSourceId = generateXmiId();
    const endTargetId = generateXmiId();

    let multSourceLabel = rel.labels?.[0] ?? '1';
    let multTargetLabel = rel.labels?.[1] ?? '1';

    if (rel.type === 'dependency' || rel.type === 'generalization') {
      multSourceLabel = '';
      multTargetLabel = '';
    }

    const multSource = multiplicityToXmi(multSourceLabel);
    const multTarget = multiplicityToXmi(multTargetLabel);

    let aggSourceAttr = '';
    let aggTargetAttr = '';

    if (rel.type === 'aggregation') {
      aggSourceAttr = ' aggregation="shared"';
    } else if (rel.type === 'composition') {
      aggSourceAttr = ' aggregation="composite"';
    }

    const lines: string[] = [];
    lines.push(`      <packagedElement xmi:type="uml:Association" xmi:id="${assocId}" name="${sourceName}_${targetName}">`);
    lines.push(`        <memberEnd xmi:idref="${endSourceId}"/>`);
    lines.push(`        <memberEnd xmi:idref="${endTargetId}"/>`);

    // Extremo Source
    lines.push(`        <ownedEnd xmi:type="uml:Property" xmi:id="${endSourceId}" type="${sourceEaId}"${aggSourceAttr}>`);
    lines.push(this.buildMultiplicityXml(multSource));
    lines.push('        </ownedEnd>');

    // Extremo Target
    lines.push(`        <ownedEnd xmi:type="uml:Property" xmi:id="${endTargetId}" type="${targetEaId}"${aggTargetAttr}>`);
    lines.push(this.buildMultiplicityXml(multTarget));
    lines.push('        </ownedEnd>');

    lines.push('      </packagedElement>');
    return lines.join('\n');
  }

  /**
   * Construye los subelementos <lowerValue> y <upperValue> de multiplicidad OMG
   */
  private buildMultiplicityXml(mult: XmiMultiplicity): string {
    const lines: string[] = [];
    const lowId = generateXmiId();
    const upId = generateXmiId();

    lines.push(`          <lowerValue xmi:type="uml:LiteralInteger" xmi:id="${lowId}" value="${mult.lower}"/>`);

    if (mult.upper === -1) {
      lines.push(`          <upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${upId}" value="*"/>`);
    } else {
      lines.push(`          <upperValue xmi:type="uml:LiteralInteger" xmi:id="${upId}" value="${mult.upper}"/>`);
    }

    return lines.join('\n');
  }

  /**
   * Construye la sección de extensión de Enterprise Architect con coordenadas espaciales
   */
  private buildEaExtension(
    classes: UmlClassDTO[],
    relationships: UmlRelationshipDTO[],
    classIdMap: Map<string, string>,
    relIdMap: Map<string, string>,
    packageId: string,
    diagramId: string,
    modelName: string,
    nowStr: string
  ): string {
    const lines: string[] = [];
    lines.push('  <xmi:Extension extender="Enterprise Architect" extenderID="6.5">');
    lines.push('    <elements>');

    // 1. REGISTRO OBLIGATORIO DEL PAQUETE CONTENEDOR EN EA
    lines.push(`      <element xmi:idref="${packageId}" xmi:type="uml:Package" name="${this.escapeXml(modelName)}" scope="public">`);
    lines.push('        <model package="0" ea_eleType="package"/>');
    lines.push('        <properties isSpecification="false" sType="Package" nType="0" scope="public"/>');
    lines.push(`        <project author="UML Studio" version="1.0" phase="1.0" created="${nowStr}" modified="${nowStr}" status="Proposed"/>`);
    lines.push('      </element>');

    // 2. REGISTRO DE CADA CLASE VINCULADA AL PAQUETE
    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      const eaId = classIdMap.get(cls.id)!;
      lines.push(`      <element xmi:idref="${eaId}" xmi:type="uml:Class" name="${this.escapeXml(cls.name)}" scope="public">`);
      lines.push(`        <model package="${packageId}" tpos="0" ea_localid="${i + 1}" ea_eleType="element"/>`);
      lines.push('        <properties isSpecification="false" sType="Class" nType="0" scope="public" isRoot="false" isLeaf="false" isAbstract="false"/>');
      lines.push(`        <project author="UML Studio" version="1.0" phase="1.0" created="${nowStr}" modified="${nowStr}" status="Proposed"/>`);
      
      // 2.1 ATRIBUTOS EN EA EXTENSION
      if (cls.attributes && cls.attributes.length > 0) {
        lines.push('        <attributes>');
        cls.attributes.forEach((attr, idx) => {
          const rawName = (attr.name || '').trim();
          const visMatch = rawName.match(/^([\+\-\#\~])\s*(.*)$/);
          const visSymbol = visMatch ? visMatch[1] : '+';
          const cleanName = visMatch ? visMatch[2] : rawName;
          let visibility = visibilityToXmi(visSymbol);
          visibility = visibility.charAt(0).toUpperCase() + visibility.slice(1); // EA is case-sensitive (Public, Private...)
          const rawType = (attr.type || 'string').trim();
          const attrId = `EAID_ATTR_${cls.id.replace(/[^a-zA-Z0-9]/g, '')}_${idx}`;
          
          lines.push(`          <attribute xmi:idref="${attrId}" name="${this.escapeXml(cleanName)}" scope="${visibility}">`);
          lines.push(`            <properties type="${this.escapeXml(rawType)}" derived="0" precision="0" collection="false" length="0" static="0" duplicates="0" changeability="changeable"/>`);
          lines.push('          </attribute>');
        });
        lines.push('        </attributes>');
      }

      // 2.2 MÉTODOS Y PARÁMETROS EN EA EXTENSION
      if (cls.methods && cls.methods.length > 0) {
        lines.push('        <operations>');
        cls.methods.forEach((meth, idx) => {
          const rawName = (meth.name || '').trim();
          const visMatch = rawName.match(/^([\+\-\#\~])\s*(.*)$/);
          const visSymbol = visMatch ? visMatch[1] : '+';
          const cleanName = visMatch ? visMatch[2] : rawName;
          let visibility = visibilityToXmi(visSymbol);
          visibility = visibility.charAt(0).toUpperCase() + visibility.slice(1);
          const retTypeStr = (meth.returnType || '').trim().toLowerCase();
          const opId = `EAID_OP_${cls.id.replace(/[^a-zA-Z0-9]/g, '')}_${idx}`;
          
          lines.push(`          <operation xmi:idref="${opId}" name="${this.escapeXml(cleanName)}" scope="${visibility}">`);
          if (retTypeStr && retTypeStr !== 'void') {
            lines.push(`            <type type="${this.escapeXml(retTypeStr)}" const="false"/>`);
          } else {
            lines.push(`            <type type="void" const="false"/>`);
          }

          if (meth.parameters && meth.parameters.trim().length > 0) {
            lines.push('            <parameters>');
            const rawParams = meth.parameters.split(',').map(p => p.trim()).filter(p => p.length > 0);
            rawParams.forEach((paramStr, pIdx) => {
              let pName = paramStr;
              let pType = 'string';
              if (paramStr.includes(':')) {
                const parts = paramStr.split(':');
                pName = (parts[0] || '').trim();
                pType = (parts[1] || 'string').trim();
              } else if (paramStr.includes(' ')) {
                const parts = paramStr.split(/\s+/);
                pType = (parts[0] || 'string').trim();
                pName = (parts[1] || 'param').trim();
              }
              const paramId = `EAID_PRM_${cls.id.replace(/[^a-zA-Z0-9]/g, '')}_${idx}_${pIdx}`;
              
              lines.push(`              <parameter xmi:idref="${paramId}" name="${this.escapeXml(pName)}" visibility="public">`);
              lines.push(`                <properties pos="${pIdx}" type="${this.escapeXml(pType)}" const="false"/>`);
              lines.push('              </parameter>');
            });
            lines.push('            </parameters>');
          }
          lines.push('          </operation>');
        });
        lines.push('        </operations>');
      }

      lines.push('      </element>');
    }

    lines.push('    </elements>');

    // 2.3 CONECTORES DE RELACIONES EN EA EXTENSION
    lines.push('    <connectors>');
    for (const rel of relationships) {
      if (rel.type === 'generalization') continue; // Generalizations handled natively by EA mostly
      
      const sourceEaId = classIdMap.get(rel.sourceId);
      const targetEaId = classIdMap.get(rel.targetId);
      if (!sourceEaId || !targetEaId) continue;
      
      const connId = relIdMap.get(rel.id);
      if (!connId) continue;
      
      let eaType = 'Association';
      let direction = 'Unspecified';
      if (rel.type === 'dependency') {
        eaType = 'Dependency';
        direction = 'Source -&gt; Destination';
      }
      
      let aggSource = 'none';
      let aggTarget = 'none';
      if (rel.type === 'aggregation') {
        aggSource = 'shared';
        eaType = 'Aggregation';
      }
      if (rel.type === 'composition') {
        aggSource = 'composite';
        eaType = 'Aggregation';
      }

      let multSourceLabel = rel.labels?.[0] ?? '1';
      let multTargetLabel = rel.labels?.[1] ?? '1';

      if (rel.type === 'dependency' || rel.type === 'generalization') {
        multSourceLabel = '';
        multTargetLabel = '';
      }

      lines.push(`      <connector xmi:idref="${connId}">`);
      lines.push(`        <source xmi:idref="${sourceEaId}">`);
      lines.push(`          <model ea_localid="1" type="Class"/>`);
      lines.push(`          <role visibility="Public" targetScope="instance"/>`);
      lines.push(`          <type aggregation="${aggSource}" containment="Unspecified" multiplicity="${this.escapeXml(multSourceLabel)}"/>`);
      lines.push(`        </source>`);
      lines.push(`        <target xmi:idref="${targetEaId}">`);
      lines.push(`          <model ea_localid="2" type="Class"/>`);
      lines.push(`          <role visibility="Public" targetScope="instance"/>`);
      lines.push(`          <type aggregation="${aggTarget}" containment="Unspecified" multiplicity="${this.escapeXml(multTargetLabel)}"/>`);
      lines.push(`        </target>`);
      lines.push(`        <properties ea_type="${eaType}" direction="${direction}"/>`);
      lines.push(`        <labels lb="${this.escapeXml(multSourceLabel)}" rb="${this.escapeXml(multTargetLabel)}"/>`);
      lines.push(`      </connector>`);
    }
    lines.push('    </connectors>');

    // 3. DIAGRAMA VISUAL VINCULADO AL PAQUETE
    lines.push('    <diagrams>');
    lines.push(`      <diagram xmi:id="${diagramId}">`);
    lines.push(`        <model package="${packageId}" localID="1" owner="${packageId}"/>`);
    lines.push(`        <properties name="${this.escapeXml(modelName)}" type="Logical"/>`);
    lines.push(`        <project author="UML Studio" version="1.0" created="${nowStr}" modified="${nowStr}"/>`);
    lines.push('        <elements>');

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      const eaId = classIdMap.get(cls.id)!;
      const x = Math.round(cls.position?.x ?? 100);
      const y = Math.round(cls.position?.y ?? 100);
      const w = Math.round(cls.size?.width ?? 180);
      const h = Math.round(cls.size?.height ?? 130);

      const left = x;
      const top = -y;
      const right = x + w;
      const bottom = -(y + h);

      const duid = generateDuid();
      const geom = `Left=${left};Top=${top};Right=${right};Bottom=${bottom};`;
      lines.push(`          <element subject="${eaId}" seqno="${i + 1}" style="DUID=${duid};" geometry="${geom}"/>`);
    }
    lines.push('        </elements>');

    // 3.1 ENLACES VISUALES DEL DIAGRAMA
    lines.push('        <links>');
    for (const rel of relationships) {
      if (rel.type === 'generalization') continue;
      const connId = relIdMap.get(rel.id);
      if (connId) {
        lines.push(`          <link xmi:id="${connId}" hidden="0"/>`);
      }
    }
    lines.push('        </links>');
    
    lines.push('      </diagram>');
    lines.push('    </diagrams>');
    lines.push('  </xmi:Extension>');

    return lines.join('\n');
  }

  /**
   * Sanitiza strings para ser incluidos en atributos o nodos XML
   */
  private escapeXml(unsafe: string): string {
    if (!unsafe) return '';
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Descarga el archivo .xmi generado en el navegador del usuario.
   *
   * @param umlJson - Diagrama actual
   * @param fileName - Nombre del archivo de salida (default: 'diagrama_ea.xmi')
   */
  downloadXmi(umlJson: UmlExportDTO, fileName: string = 'diagrama_ea.xmi'): void {
    const xmiContent = this.exportToXmi(umlJson);
    const blob = new Blob([xmiContent], { type: 'text/xml;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.xmi') ? fileName : `${fileName}.xmi`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    window.URL.revokeObjectURL(url);
  }
}
