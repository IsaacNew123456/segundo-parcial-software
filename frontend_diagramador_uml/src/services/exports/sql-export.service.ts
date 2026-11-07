import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SqlExportService {

  private invalidPkTypes = new Set([
    'TEXT',
    'FLOAT',
    'DOUBLE PRECISION',
    'DECIMAL(12,2)',
    'DECIMAL(15,2)',
    'BOOLEAN',
    'DATE',
    'TIME',
    'TIMESTAMP'
  ]);

  /**
   * Limpia símbolos de visibilidad UML (+, -, #, ~) y espacios del nombre del atributo.
   */
  private cleanName(name: string): string {
    if (!name) return '';
    return name.replace(/^[\+\-\#\~]\s*/, '').trim();
  }

  mapToSqlType(rawType: string): string {
    if (!rawType) return 'VARCHAR(255)';
    const t = rawType.trim().toLowerCase();
    switch (t) {
      case 'int':
      case 'integer':
      case 'serial':
        return 'INT';
      case 'long':
      case 'bigint':
      case 'bigserial':
        return 'BIGINT';
      case 'bool':
      case 'boolean':
        return 'BOOLEAN';
      case 'float':
        return 'FLOAT';
      case 'double':
      case 'double precision':
      case 'real':
        return 'DOUBLE PRECISION';
      case 'decimal':
      case 'numeric':
      case 'bigdecimal':
      case 'money':
        return 'DECIMAL(12,2)';
      case 'date':
      case 'localdate':
        return 'DATE';
      case 'time':
      case 'localtime':
        return 'TIME';
      case 'datetime':
      case 'timestamp':
      case 'localdatetime':
        return 'TIMESTAMP';
      case 'uuid':
        return 'UUID';
      case 'text':
        return 'TEXT';
      case 'char':
      case 'character':
        return 'CHAR(1)';
      case 'string':
      case 'varchar':
      default:
        return 'VARCHAR(255)';
    }
  }

  exportToSql(umlJson: any, dbName: string = 'uml_database'): string {
    let sql = '';
    sql += `-- ==========================================================\n`;
    sql += `-- Script DDL generado automaticamente por UML Studio\n`;
    sql += `-- Motor: PostgreSQL 17\n`;
    sql += `-- Base de datos: ${dbName}\n`;
    sql += `-- ==========================================================\n\n`;

    // ====== TABLAS ======
    for (const cls of umlJson.classes) {
      // Verificar si la clase es hija en una relacion de herencia
      const generalizationRel = umlJson.relationships?.find((rel: any) => rel.type === 'generalization' && rel.sourceId === cls.id);
      sql += `CREATE TABLE ${cls.name} (\n`;

      const columns: string[] = [];

      if (generalizationRel) {
        // Clase Hija: Hereda la PK del padre (BIGINT / INT / VARCHAR) pero SIN SERIAL/BIGSERIAL para que comparta el mismo ID
        const parent = umlJson.classes.find((c: any) => c.id === generalizationRel.targetId);
        const parentPkName = this.getPrimaryKey(parent, umlJson);
        const parentPkType = this.getPrimaryKeyType(parent, umlJson);
        columns.push(`  ${parentPkName} ${parentPkType} PRIMARY KEY`);

        if (cls.attributes && cls.attributes.length > 0) {
          cls.attributes.forEach((attr: any) => {
            const cleanColName = this.cleanName(attr.name);
            if (cleanColName !== parentPkName) {
              const sqlType = this.mapToSqlType(attr.type);
              columns.push(`  ${cleanColName} ${sqlType}`);
            }
          });
        }
      } else if (!cls.attributes || cls.attributes.length === 0) {
        columns.push(`  id BIGSERIAL PRIMARY KEY`);
      } else {
        const pkName = this.getPrimaryKey(cls, umlJson);
        const pkAttr = this.findPrimaryKeyAttribute(cls);
        const pkType = pkAttr ? this.mapToSqlType(pkAttr.type) : 'BIGINT';
        const isSyntheticPk = !pkAttr || this.invalidPkTypes.has(pkType);

        if (isSyntheticPk) {
          columns.push(`  id BIGSERIAL PRIMARY KEY`);
        }

        cls.attributes.forEach((attr: any) => {
          const cleanColName = this.cleanName(attr.name);
          const sqlType = this.mapToSqlType(attr.type);

          if (!isSyntheticPk && cleanColName === pkName) {
            if (sqlType === 'BIGINT') {
              columns.push(`  ${cleanColName} BIGSERIAL PRIMARY KEY`);
            } else if (sqlType === 'INT') {
              columns.push(`  ${cleanColName} SERIAL PRIMARY KEY`);
            } else {
              columns.push(`  ${cleanColName} ${sqlType} PRIMARY KEY`);
            }
          } else {
            columns.push(`  ${cleanColName} ${sqlType}`);
          }
        });
      }
      sql += columns.join(',\n') + `\n);\n\n`;
    }

    // ====== RELACIONES ======
    for (const rel of (umlJson.relationships || [])) {
      const source = umlJson.classes.find((c: any) => c.id === rel.sourceId);
      const target = umlJson.classes.find((c: any) => c.id === rel.targetId);
      if (!source || !target) continue;

      // Herencia (Generalizacion): Crear la FK de la tabla hija a la tabla padre con ON DELETE CASCADE
      if (rel.type === 'generalization') {
        const child = source;
        const parent = target;
        const childPk = this.getPrimaryKey(child, umlJson);
        const parentPk = this.getPrimaryKey(parent, umlJson);
        sql += `ALTER TABLE ${child.name}\n`;
        sql += `  ADD CONSTRAINT fk_${child.name.toLowerCase()}_${parent.name.toLowerCase()} FOREIGN KEY (${childPk}) REFERENCES ${parent.name}(${parentPk}) ON DELETE CASCADE ON UPDATE CASCADE;\n\n`;
        continue;
      }

      // Multiplicidad
      const multSource = rel.labels?.[0] || '1';
      const multTarget = rel.labels?.[1] || '1';

      // N:M -> tabla intermedia
      if (multSource.includes('*') && multTarget.includes('*')) {
        const joinTable = `${source.name}_${target.name}`;
        const sourcePkName = this.getPrimaryKey(source, umlJson);
        const targetPkName = this.getPrimaryKey(target, umlJson);
        const sourcePkType = this.getPrimaryKeyType(source, umlJson);
        const targetPkType = this.getPrimaryKeyType(target, umlJson);

        sql += `CREATE TABLE ${joinTable} (\n`;
        sql += `  ${source.name.toLowerCase()}_id ${sourcePkType} NOT NULL,\n`;
        sql += `  ${target.name.toLowerCase()}_id ${targetPkType} NOT NULL,\n`;
        sql += `  PRIMARY KEY (${source.name.toLowerCase()}_id, ${target.name.toLowerCase()}_id),\n`;
        sql += `  CONSTRAINT fk_${joinTable}_${source.name.toLowerCase()} FOREIGN KEY (${source.name.toLowerCase()}_id) REFERENCES ${source.name}(${sourcePkName}) ON DELETE CASCADE ON UPDATE CASCADE,\n`;
        sql += `  CONSTRAINT fk_${joinTable}_${target.name.toLowerCase()} FOREIGN KEY (${target.name.toLowerCase()}_id) REFERENCES ${target.name}(${targetPkName}) ON DELETE CASCADE ON UPDATE CASCADE\n`;
        sql += `);\n\n`;
        continue;
      }

      // Determinar el lado de la FK segun multiplicidad
      let fkTable = source;
      let refTable = target;
      let fkName = `fk_${source.name.toLowerCase()}_${target.name.toLowerCase()}`;
      let column = `${target.name.toLowerCase()}_id`;
      let onDelete = 'SET NULL';
      let notNull = '';

      // Si es 1:N, la FK va en el lado N, o si es dependencia, siempre FK en source
      if (['association', 'aggregation', 'composition', 'dependency'].includes(rel.type)) {
        if (rel.type === 'dependency') {
          // Siempre FK en el source hacia el target
          fkTable = source;
          refTable = target;
          fkName = `fk_${source.name.toLowerCase()}_${target.name.toLowerCase()}`;
          column = `${target.name.toLowerCase()}_id`;
          onDelete = 'NO ACTION';
          notNull = '';
        } else {
          if (multSource.includes('*') && !multTarget.includes('*')) {
            // source: muchos, target: uno -> FK en source
            fkTable = source;
            refTable = target;
            fkName = `fk_${source.name.toLowerCase()}_${target.name.toLowerCase()}`;
            column = `${target.name.toLowerCase()}_id`;
          } else if (!multSource.includes('*') && multTarget.includes('*')) {
            // source: uno, target: muchos -> FK en target
            fkTable = target;
            refTable = source;
            fkName = `fk_${target.name.toLowerCase()}_${source.name.toLowerCase()}`;
            column = `${source.name.toLowerCase()}_id`;
          } else {
            // 1:1 o caso ambiguo, por convencion FK en source
            fkTable = source;
            refTable = target;
            fkName = `fk_${source.name.toLowerCase()}_${target.name.toLowerCase()}`;
            column = `${target.name.toLowerCase()}_id`;
          }
          // Composicion: FK NOT NULL y ON DELETE CASCADE
          if (rel.type === 'composition') {
            notNull = ' NOT NULL';
            onDelete = 'CASCADE';
          } else if (rel.type === 'aggregation') {
            onDelete = 'SET NULL';
          } else if (rel.type === 'association') {
            onDelete = 'SET NULL';
          }
        }

        const refPkName = this.getPrimaryKey(refTable, umlJson);
        const refPkType = this.getPrimaryKeyType(refTable, umlJson);

        sql += `ALTER TABLE ${fkTable.name}\n`;
        sql += `  ADD COLUMN ${column} ${refPkType}${notNull},\n`;
        sql += `  ADD CONSTRAINT ${fkName} FOREIGN KEY (${column}) REFERENCES ${refTable.name}(${refPkName}) ON DELETE ${onDelete} ON UPDATE CASCADE;\n\n`;
        continue;
      }
    }

    return sql.trim();
  }

  private findPrimaryKeyAttribute(cls: any): any | null {
    if (!cls || !cls.attributes || cls.attributes.length === 0) return null;
    const cName = (cls.name || '').toLowerCase().trim();

    // 1. Prioridad: Atributo con nombre 'id', 'id_' + nombre, 'id' + nombre o que termine en '_id'
    const idAttr = cls.attributes.find((a: any) => {
      const n = (a.name || '').toLowerCase().trim();
      return n === 'id' || n === 'id_' + cName || n === 'id' + cName || n.startsWith('id_') || n.endsWith('_id');
    });
    if (idAttr) return idAttr;

    // 2. Prioridad: Primer atributo con tipo válido para PK (no en invalidPkTypes)
    const validAttr = cls.attributes.find((a: any) => {
      const sqlType = this.mapToSqlType(a.type);
      return !this.invalidPkTypes.has(sqlType);
    });
    if (validAttr) return validAttr;

    // 3. Fallback: primer atributo
    return cls.attributes[0];
  }

  private getPrimaryKey(cls: any, umlJson?: any): string {
    if (umlJson) {
      const genRel = umlJson.relationships?.find((rel: any) => rel.type === 'generalization' && rel.sourceId === cls?.id);
      if (genRel) {
        const parent = umlJson.classes?.find((c: any) => c.id === genRel.targetId);
        if (parent) return this.getPrimaryKey(parent, umlJson);
      }
    }
    const pkAttr = this.findPrimaryKeyAttribute(cls);
    if (!pkAttr) return 'id';

    const cleanAttrName = this.cleanName(pkAttr.name);
    const sqlType = this.mapToSqlType(pkAttr.type);
    return this.invalidPkTypes.has(sqlType) ? 'id' : cleanAttrName;
  }

  private getPrimaryKeyType(cls: any, umlJson?: any): string {
    if (umlJson) {
      const genRel = umlJson.relationships?.find((rel: any) => rel.type === 'generalization' && rel.sourceId === cls?.id);
      if (genRel) {
        const parent = umlJson.classes?.find((c: any) => c.id === genRel.targetId);
        if (parent) return this.getPrimaryKeyType(parent, umlJson);
      }
    }
    const pkAttr = this.findPrimaryKeyAttribute(cls);
    if (!pkAttr) return 'BIGINT';

    const sqlType = this.mapToSqlType(pkAttr.type);
    return this.invalidPkTypes.has(sqlType) ? 'BIGINT' : sqlType;
  }

  downloadSql(umlJson: any, fileName: string = 'diagrama.sql'): void {
    const sqlContent = this.exportToSql(umlJson);
    const blob = new Blob([sqlContent], { type: 'text/plain;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    window.URL.revokeObjectURL(url);
  }
}
