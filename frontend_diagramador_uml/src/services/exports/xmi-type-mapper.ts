/**
 * ============================================================================
 * XMI Type Mapper — Módulo Central de Tipos e Interfaces XMI
 * ============================================================================
 *
 * Fase 1 del plan de interoperabilidad con Enterprise Architect.
 *
 * Responsabilidad única: Centralizar la conversión canónica bidireccional
 * entre los sistemas de tipos de:
 *
 *   1. Diagramador UML Studio (tipos internos en minúscula)
 *   2. OMG UML 2.5 / XMI 2.1 (tipos que Enterprise Architect lee/escribe)
 *   3. Java / Spring Boot (para el generador de backend)
 *   4. PostgreSQL 17 (para la exportación SQL)
 *
 * @author UML Studio Team
 * @version 1.2.0
 */

// ============================================================================
// 1. INTERFACES Y DTOs XMI
// ============================================================================

export interface XmiPrimitiveType {
  xmiType: 'uml:PrimitiveType' | 'uml:DataType';
  name: string;
}

export type UmlVisibility = 'public' | 'private' | 'protected' | 'package';

export interface XmiMultiplicity {
  lower: number;
  upper: number;
}

export interface UnifiedTypeDescriptor {
  diagramType: string;
  xmiPrimitive: XmiPrimitiveType;
  javaType: string;
  sqlType: string;
}

// ============================================================================
// 2. TABLAS DE MAPEO CANÓNICAS (Fuente Única de Verdad)
// ============================================================================

const CANONICAL_TYPE_MAP: UnifiedTypeDescriptor[] = [
  { diagramType: 'int', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'Integer' }, javaType: 'Integer', sqlType: 'INT' },
  { diagramType: 'long', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'Long' }, javaType: 'Long', sqlType: 'BIGINT' },
  { diagramType: 'float', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'Float' }, javaType: 'Float', sqlType: 'FLOAT' },
  { diagramType: 'double', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'Real' }, javaType: 'Double', sqlType: 'DOUBLE PRECISION' },
  { diagramType: 'decimal', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'Decimal' }, javaType: 'BigDecimal', sqlType: 'DECIMAL(12,2)' },
  { diagramType: 'string', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'String' }, javaType: 'String', sqlType: 'VARCHAR(255)' },
  { diagramType: 'text', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'String' }, javaType: 'String', sqlType: 'TEXT' },
  { diagramType: 'char', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'String' }, javaType: 'String', sqlType: 'CHAR(1)' },
  { diagramType: 'boolean', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'Boolean' }, javaType: 'Boolean', sqlType: 'BOOLEAN' },
  { diagramType: 'date', xmiPrimitive: { xmiType: 'uml:DataType', name: 'Date' }, javaType: 'LocalDate', sqlType: 'DATE' },
  { diagramType: 'time', xmiPrimitive: { xmiType: 'uml:DataType', name: 'Time' }, javaType: 'LocalTime', sqlType: 'TIME' },
  { diagramType: 'datetime', xmiPrimitive: { xmiType: 'uml:DataType', name: 'DateTime' }, javaType: 'LocalDateTime', sqlType: 'TIMESTAMP' },
  { diagramType: 'uuid', xmiPrimitive: { xmiType: 'uml:DataType', name: 'UUID' }, javaType: 'UUID', sqlType: 'UUID' },
  { diagramType: 'void', xmiPrimitive: { xmiType: 'uml:PrimitiveType', name: 'void' }, javaType: 'void', sqlType: 'N/A' }
];

// ============================================================================
// 3. ÍNDICES DE BÚSQUEDA INVERSA (Lookup O(1))
// ============================================================================

const DIAGRAM_TO_UNIFIED = new Map<string, UnifiedTypeDescriptor>();
const XMI_NAME_TO_UNIFIED = new Map<string, UnifiedTypeDescriptor>();
const JAVA_TO_UNIFIED = new Map<string, UnifiedTypeDescriptor>();

for (const entry of CANONICAL_TYPE_MAP) {
  DIAGRAM_TO_UNIFIED.set(entry.diagramType, entry);

  const xmiKey = entry.xmiPrimitive.name.toLowerCase();
  if (!XMI_NAME_TO_UNIFIED.has(xmiKey)) {
    XMI_NAME_TO_UNIFIED.set(xmiKey, entry);
  }

  const javaKey = entry.javaType.toLowerCase();
  if (!JAVA_TO_UNIFIED.has(javaKey)) {
    JAVA_TO_UNIFIED.set(javaKey, entry);
  }
}

const DIAGRAM_ALIASES: Record<string, string> = {
  'integer': 'int', 'serial': 'int', 'bigint': 'long', 'bigserial': 'long',
  'bool': 'boolean', 'real': 'double', 'double precision': 'double',
  'numeric': 'decimal', 'bigdecimal': 'decimal', 'money': 'decimal',
  'localdate': 'date', 'localtime': 'time', 'localdatetime': 'datetime',
  'timestamp': 'datetime', 'varchar': 'string', 'character': 'char'
};

const XMI_ALIASES: Record<string, string> = {
  'int': 'integer', 'bool': 'boolean', 'number': 'integer', 'double': 'real',
  'bigdecimal': 'decimal', 'numeric': 'decimal', 'localdate': 'date',
  'localtime': 'time', 'localdatetime': 'datetime', 'timestamp': 'datetime',
  'varchar': 'string', 'text': 'string'
};

// ============================================================================
// 4. FUNCIONES DE CONVERSIÓN — TIPOS
// ============================================================================

export function normalizeInternalType(rawType: string): string {
  if (!rawType) return 'string';
  const lower = rawType.trim().toLowerCase();
  return DIAGRAM_ALIASES[lower] ?? lower;
}

export function toXmiPrimitive(diagramType: string): XmiPrimitiveType {
  const normalized = normalizeInternalType(diagramType);
  const descriptor = DIAGRAM_TO_UNIFIED.get(normalized);
  if (descriptor) return { ...descriptor.xmiPrimitive };
  return { xmiType: 'uml:PrimitiveType', name: 'String' };
}

export function fromXmiPrimitive(xmiTypeName: string): string {
  if (!xmiTypeName) return 'string';
  const lower = xmiTypeName.trim().toLowerCase();
  const descriptor = XMI_NAME_TO_UNIFIED.get(lower);
  if (descriptor) return descriptor.diagramType;
  
  const aliasKey = XMI_ALIASES[lower];
  if (aliasKey) {
    const aliasDescriptor = XMI_NAME_TO_UNIFIED.get(aliasKey);
    if (aliasDescriptor) return aliasDescriptor.diagramType;
  }
  return 'string';
}

export function getUnifiedDescriptor(diagramType: string): UnifiedTypeDescriptor | undefined {
  const normalized = normalizeInternalType(diagramType);
  return DIAGRAM_TO_UNIFIED.get(normalized);
}

export function fromJavaType(javaType: string): UnifiedTypeDescriptor | undefined {
  if (!javaType) return undefined;
  return JAVA_TO_UNIFIED.get(javaType.trim().toLowerCase());
}

// ============================================================================
// 5. FUNCIONES DE CONVERSIÓN — VISIBILIDADES UML 2.5
// ============================================================================

const VISIBILITY_SYMBOL_TO_XMI: Record<string, UmlVisibility> = {
  '+': 'public', '-': 'private', '#': 'protected', '~': 'package'
};

const VISIBILITY_XMI_TO_SYMBOL: Record<string, string> = {
  'public': '+', 'private': '-', 'protected': '#', 'package': '~'
};

export function visibilityToXmi(symbol: string): UmlVisibility {
  if (!symbol) return 'public';
  const trimmed = symbol.trim();
  if (['public', 'private', 'protected', 'package'].includes(trimmed.toLowerCase())) {
    return trimmed.toLowerCase() as UmlVisibility;
  }
  return VISIBILITY_SYMBOL_TO_XMI[trimmed] ?? 'public';
}

export function visibilityFromXmi(xmiVisibility: string): string {
  if (!xmiVisibility) return '+';
  return VISIBILITY_XMI_TO_SYMBOL[xmiVisibility.trim().toLowerCase()] ?? '+';
}

// ============================================================================
// 6. FUNCIONES DE CONVERSIÓN — MULTIPLICIDADES OMG
// ============================================================================

export function multiplicityToXmi(label: string): XmiMultiplicity {
  if (!label) return { lower: 1, upper: 1 };
  const trimmed = label.trim().toLowerCase();
  
  if (trimmed === '*' || trimmed === 'n' || trimmed === 'm') {
    return { lower: 0, upper: -1 };
  }
  
  const rangeMatch = trimmed.match(/^(\d+)\.\.(\*|n|m|\d+)$/);
  if (rangeMatch) {
    const lower = parseInt(rangeMatch[1], 10);
    const upperStr = rangeMatch[2];
    const upper = (upperStr === '*' || upperStr === 'n' || upperStr === 'm') ? -1 : parseInt(upperStr, 10);
    return { lower, upper };
  }
  
  const singleMatch = trimmed.match(/^(\d+)$/);
  if (singleMatch) {
    const value = parseInt(singleMatch[1], 10);
    return { lower: value, upper: value };
  }
  
  return { lower: 1, upper: 1 };
}

export function multiplicityFromXmi(multiplicity: XmiMultiplicity): string {
  if (!multiplicity) return '1';
  const { lower, upper } = multiplicity;
  const upperStr = upper === -1 ? '*' : String(upper);
  if (lower === upper && upper !== -1) {
    return String(lower);
  }
  return `${lower}..${upperStr}`;
}

// ============================================================================
// 7. UTILIDADES AUXILIARES CANÓNICAS PARA ENTERPRISE ARCHITECT
// ============================================================================

/**
 * Genera un identificador canónico XMI para Enterprise Architect.
 *
 * Formato estándar: EAID_XXXXXXXX_XXXX_4XXX_YXXX_XXXXXXXXXXXX
 * Garantiza compatibilidad con el límite VARCHAR(40) de la BD interna de EA.
 *
 * @param _optionalPrefix - Parámetro opcional para retrocompatibilidad.
 */
export function generateXmiId(prefix: string = 'EAID_'): string {
  const hex = 'xxxxxxxx_xxxx_4xxx_yxxx_xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16).toUpperCase();
  });
  
  // Limitar a un total de 40 caracteres para evitar el error DAO.Field [3163] en la BD de EA.
  // EAID_ (5) + 36 = 41 (muy largo para varchar 40 si EA no lo trunca internamente o causa error).
  // Removeremos los guiones bajos para hacerlo más corto: 5 + 32 = 37 chars.
  const shortHex = hex.replace(/_/g, '');
  return `${prefix}${shortHex}`;
}

/**
 * Genera un DUID (Diagram Unique Identifier) de 8 caracteres hexadecimales para EA.
 */
export function generateDuid(): string {
  return Math.floor(Math.random() * 0xFFFFFFFF)
    .toString(16)
    .toUpperCase()
    .padStart(8, '0');
}

export function isTemporalType(diagramType: string): boolean {
  const normalized = normalizeInternalType(diagramType);
  return ['date', 'time', 'datetime'].includes(normalized);
}

export function isValidPrimaryKeyType(diagramType: string): boolean {
  const normalized = normalizeInternalType(diagramType);
  const descriptor = DIAGRAM_TO_UNIFIED.get(normalized);
  if (!descriptor) return false;

  const invalidSqlPkTypes = new Set([
    'TEXT', 'FLOAT', 'DOUBLE PRECISION', 'DECIMAL(12,2)',
    'BOOLEAN', 'DATE', 'TIME', 'TIMESTAMP', 'N/A'
  ]);

  return !invalidSqlPkTypes.has(descriptor.sqlType);
}

export function getSupportedTypes(): string[] {
  return CANONICAL_TYPE_MAP
    .filter(entry => entry.diagramType !== 'void')
    .map(entry => entry.diagramType);
}

export function getCanonicalTypeMap(): readonly UnifiedTypeDescriptor[] {
  return [...CANONICAL_TYPE_MAP];
}
