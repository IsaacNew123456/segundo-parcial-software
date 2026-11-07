import json
import re
from typing import Dict, Any, List, Tuple


class NormalizationService:
    """
    Servicio de Auditoría de Normalización (CU18 / S3-1 / S3-2).
    1. Convierte el modelo de clases UML a un esquema relacional lógico (S3-1).
    2. Audita el cumplimiento de 1FN, 2FN, 3FN y 4FN por cada clase/tabla (S3-2).
    3. Emite reporte con estado, violación detectada y sugerencia de corrección.
    4. Garantiza que las correcciones NO se aplican sin confirmación (evaluación asistida).
    """

    @staticmethod
    def _extract_col_info(a) -> Tuple[str, str]:
        if isinstance(a, dict):
            return a.get("name", "").strip(), a.get("type", "string").lower()
        clean = re.sub(r"^[+\-#~]\s*", "", str(a)).strip()
        parts = clean.split(":")
        c_name = parts[0].strip()
        c_type = parts[1].strip().lower() if len(parts) > 1 else "string"
        return c_name, c_type

    @staticmethod
    def uml_to_relational_schema(diagram_data: dict) -> Dict[str, Any]:
        """
        S3-1: Convierte el modelo UML a esquema relacional lógico:
        - Cada clase se convierte en una tabla.
        - Los atributos se convierten en columnas.
        - Las relaciones 1 a N se convierten en Claves Foráneas (FK) en la tabla del lado N.
        - Las relaciones N a N generan tablas intermedias asociativas.
        """
        classes = diagram_data.get("classes", []) if isinstance(diagram_data, dict) else []
        relationships = diagram_data.get("relationships", []) if isinstance(diagram_data, dict) else []

        class_map = {str(c.get("id")): c for c in classes if c.get("id")}
        tables: Dict[str, Any] = {}

        # 1. Crear tablas base a partir de las clases
        for c in classes:
            c_name = c.get("name", "Entidad")
            t_name = c_name.lower()
            attrs = c.get("attributes", [])

            columns = []
            pk_columns = []

            for a in attrs:
                col_name, col_type = NormalizationService._extract_col_info(a)
                if not col_name:
                    continue
                is_pk = bool(re.search(r"^id(_|\b)|(^id$)", col_name, re.IGNORECASE))

                columns.append({
                    "name": col_name,
                    "type": col_type,
                    "is_primary_key": is_pk,
                    "nullable": not is_pk
                })
                if is_pk:
                    pk_columns.append(col_name)

            # Si no tiene clave primaria explícita, sugerir id por defecto
            if not pk_columns:
                pk_name = f"id_{t_name}"
                columns.insert(0, {
                    "name": pk_name,
                    "type": "int",
                    "is_primary_key": True,
                    "nullable": False
                })
                pk_columns.append(pk_name)

            tables[t_name] = {
                "class_id": str(c.get("id")),
                "class_name": c_name,
                "table_name": t_name,
                "primary_key": pk_columns,
                "columns": columns,
                "foreign_keys": []
            }

        # 2. Mapear relaciones a Foreign Keys o tablas intermedias
        for r in relationships:
            src_id = str(r.get("sourceId"))
            tgt_id = str(r.get("targetId"))
            rel_type = r.get("type", "association").lower()
            labels = r.get("labels", [])

            src_class = class_map.get(src_id)
            tgt_class = class_map.get(tgt_id)
            if not src_class or not tgt_class:
                continue

            src_table = src_class.get("name", "").lower()
            tgt_table = tgt_class.get("name", "").lower()

            if src_table not in tables or tgt_table not in tables:
                continue

            card_src = labels[0] if len(labels) > 0 else "1"
            card_tgt = labels[1] if len(labels) > 1 else "*"

            # Si es herencia (generalization), la hija referencia a la madre
            if rel_type in ("generalization", "inheritance"):
                fk_col = f"id_{tgt_table}"
                tables[src_table]["foreign_keys"].append({
                    "column": fk_col,
                    "references_table": tgt_table,
                    "references_column": tables[tgt_table]["primary_key"][0],
                    "type": "generalization"
                })
                continue

            # N a N -> tabla intermedia asociativa
            if ("*" in card_src or "n" in card_src.lower()) and ("*" in card_tgt or "n" in card_tgt.lower()):
                junction_table = f"{src_table}_{tgt_table}"
                pk_src = tables[src_table]["primary_key"][0]
                pk_tgt = tables[tgt_table]["primary_key"][0]
                tables[junction_table] = {
                    "class_id": None,
                    "class_name": f"{src_class.get('name')}{tgt_class.get('name')}",
                    "table_name": junction_table,
                    "primary_key": [f"id_{src_table}", f"id_{tgt_table}"],
                    "columns": [
                        {"name": f"id_{src_table}", "type": "int", "is_primary_key": True, "nullable": False},
                        {"name": f"id_{tgt_table}", "type": "int", "is_primary_key": True, "nullable": False}
                    ],
                    "foreign_keys": [
                        {"column": f"id_{src_table}", "references_table": src_table, "references_column": pk_src, "type": "association"},
                        {"column": f"id_{tgt_table}", "references_table": tgt_table, "references_column": pk_tgt, "type": "association"}
                    ]
                }
            # 1 a N -> la FK va en la tabla del lado N (cardinalidad *)
            elif "*" in card_tgt or "n" in card_tgt.lower():
                fk_col = f"id_{src_table}"
                tables[tgt_table]["foreign_keys"].append({
                    "column": fk_col,
                    "references_table": src_table,
                    "references_column": tables[src_table]["primary_key"][0],
                    "type": rel_type
                })
                if not any(c["name"] == fk_col for c in tables[tgt_table]["columns"]):
                    tables[tgt_table]["columns"].append({
                        "name": fk_col,
                        "type": "int",
                        "is_primary_key": False,
                        "nullable": True
                    })
            else:
                # Asociación estándar
                fk_col = f"id_{tgt_table}"
                tables[src_table]["foreign_keys"].append({
                    "column": fk_col,
                    "references_table": tgt_table,
                    "references_column": tables[tgt_table]["primary_key"][0],
                    "type": rel_type
                })

        return {
            "tables": tables,
            "total_tables": len(tables)
        }

    @staticmethod
    def audit_normalization(diagram_data: dict, target_class: str = None, target_form: str = None) -> Dict[str, Any]:
        """
        S3-2: Evalúa el cumplimiento de 1FN, 2FN, 3FN y 4FN para cada clase del modelo.
        Devuelve el reporte estructurado con conclusiones y sugerencias asistidas.
        Garantiza que el diagrama NO se modifica automáticamente.
        """
        classes = diagram_data.get("classes", []) if isinstance(diagram_data, dict) else []
        schema = NormalizationService.uml_to_relational_schema(diagram_data)
        tables = schema.get("tables", {})

        if not classes:
            return {
                "cumple_todas": False,
                "resumen": "El modelo no contiene clases con atributos para auditar.",
                "reporte_markdown": "⚠️ El modelo está vacío. Agrega clases con atributos para ejecutar la auditoría de normalización.",
                "clases": []
            }

        clases_report = []
        todas_cumplen = True

        for c in classes:
            c_name = c.get("name", "Entidad")
            if target_class and c_name.lower() != target_class.lower():
                continue

            t_name = c_name.lower()
            attrs = c.get("attributes", [])
            table_info = tables.get(t_name, {})

            parsed_attrs = [NormalizationService._extract_col_info(a) for a in attrs]
            cols = [p[0] for p in parsed_attrs if p[0]]
            types = [p[1] for p in parsed_attrs if p[0]]

            # Validación de datos insuficientes (clase sin atributos)
            if not cols:
                clases_report.append({
                    "clase": c_name,
                    "cumple_todas": False,
                    "datos_insuficientes": True,
                    "aviso": f"La clase '{c_name}' no posee atributos definidos para evaluar dependencias funcionales relacionales (1FN–4FN).",
                    "1FN": {"cumple": False, "violacion": "Sin atributos definidos", "sugerencia": "Añadir atributos y clave primaria."},
                    "2FN": {"cumple": False, "violacion": "Requiere 1FN previa", "sugerencia": "Definir atributos."},
                    "3FN": {"cumple": False, "violacion": "Requiere 2FN previa", "sugerencia": "Definir atributos."},
                    "4FN": {"cumple": False, "violacion": "Requiere 3FN previa", "sugerencia": "Definir atributos."}
                })
                todas_cumplen = False
                continue

            # ----------------- 1FN -----------------
            # Atributos atómicos; sin grupos repetitivos ni atributos multivaluados
            violaciones_1fn = []
            multivalued_keywords = [
                "telefonos", "emails", "correos", "direcciones", "hijos", "tags",
                "etiquetas", "items", "detalles", "list", "array", "articulos", "productos"
            ]
            for col, col_t in zip(cols, types):
                col_l = col.lower()
                # Atributo plural o con tipo de arreglo/colección
                if any(k in col_l for k in multivalued_keywords) or any(t in col_t for t in ["list", "array", "set", "[]"]):
                    violaciones_1fn.append(f"Atributo multivaluado o no atómico '{col}'")
                elif re.search(r"(nombre_completo|direccion_completa)", col_l):
                    violaciones_1fn.append(f"Atributo compuesto '{col}' divisible en subatributos atómicos")

            cumple_1fn = len(violaciones_1fn) == 0
            res_1fn = {
                "cumple": cumple_1fn,
                "violacion": ", ".join(violaciones_1fn) if not cumple_1fn else "Atributos atómicos y clave primaria identificable.",
                "sugerencia": f"Extraer los atributos repetitivos ({', '.join(violaciones_1fn)}) a una nueva clase/tabla con relación 1 a N hacia '{c_name}'." if not cumple_1fn else "No requiere corrección (cumple 1FN)."
            }

            # ----------------- 2FN -----------------
            # Cumple 1FN Y sin dependencias parciales respecto a una clave compuesta
            # Si la clave primaria es simple (un solo campo), cumple 2FN automáticamente
            pk = table_info.get("primary_key", [])
            violaciones_2fn = []
            if len(pk) > 1:
                # Tabla con clave compuesta (ej: tabla intermedia o detalle)
                # Atributos no clave que describen solo a un elemento de la clave compuesta
                for col in cols:
                    if col not in pk:
                        for pk_part in pk:
                            entity_hint = pk_part.replace("id_", "").replace("_id", "")
                            if entity_hint and entity_hint in col.lower():
                                violaciones_2fn.append(f"Atributo '{col}' depende parcialmente de '{pk_part}'")

            if not cumple_1fn:
                cumple_2fn = False
                violacion_2fn_msg = ", ".join(violaciones_2fn) if violaciones_2fn else "Requiere normalizar a 1FN previamente."
            else:
                cumple_2fn = (len(violaciones_2fn) == 0)
                violacion_2fn_msg = ", ".join(violaciones_2fn) if not cumple_2fn else "Cumple 2FN (clave primaria simple o sin dependencias parciales)."

            res_2fn = {
                "cumple": cumple_2fn,
                "violacion": violacion_2fn_msg,
                "sugerencia": f"Mover los atributos ({', '.join(violaciones_2fn)}) a sus respectivas entidades independientes." if violaciones_2fn else "No requiere corrección (cumple 2FN)."
            }

            # ----------------- 3FN -----------------
            # Cumple 2FN Y sin dependencias transitivas entre atributos no clave
            violaciones_3fn = []
            cols_lower = [col.lower() for col in cols]
            # Patrón A: Ciudad / País con Código Postal
            if ("ciudad" in cols_lower or "pais" in cols_lower) and ("codigo_postal" in cols_lower or "zip" in cols_lower):
                violaciones_3fn.append("Dependencia transitiva detectada: 'ciudad/pais' depende de 'codigo_postal'")
            # Patrón B: Nombre/Descripción de categoría dentro de producto
            if any("categoria" in c for c in cols_lower) and any("categoria_nombre" in c or "nombre_categoria" in c or "categoria_desc" in c for c in cols_lower):
                violaciones_3fn.append("Dependencia transitiva: atributos de categoría duplicados dentro de la entidad")
            # Patrón C: Subtotal + Iva + Total (campos calculados redundantes)
            if "subtotal" in cols_lower and "total" in cols_lower:
                violaciones_3fn.append("Campo derivado/calculado 'total' depende funcionalmente de 'subtotal/precio'")

            if not cumple_2fn:
                cumple_3fn = False
                violacion_3fn_msg = ", ".join(violaciones_3fn) if violaciones_3fn else "Requiere normalizar a 1FN y 2FN previamente."
            else:
                cumple_3fn = (len(violaciones_3fn) == 0)
                violacion_3fn_msg = ", ".join(violaciones_3fn) if not cumple_3fn else "Cumple 3FN (sin dependencias transitivas entre atributos no clave)."

            res_3fn = {
                "cumple": cumple_3fn,
                "violacion": violacion_3fn_msg,
                "sugerencia": f"Normalizar creando una entidad independiente ({', '.join(violaciones_3fn)}) y referenciarla por clave foránea." if violaciones_3fn else "No requiere corrección (cumple 3FN)."
            }

            # ----------------- 4FN -----------------
            # Cumple 3FN Y sin dependencias multivaluadas no triviales
            # Dos atributos o listas independientes coexistiendo en la misma entidad
            violaciones_4fn = []
            independent_multivalued = []
            if any("idioma" in c for c in cols_lower):
                independent_multivalued.append("idiomas")
            if any("habilidad" in c or "skill" in c for c in cols_lower):
                independent_multivalued.append("habilidades")
            if any("proyecto" in c for c in cols_lower) and any("certificacion" in c for c in cols_lower):
                independent_multivalued.append("proyectos y certificaciones")

            if len(independent_multivalued) >= 2:
                violaciones_4fn.append(f"Dependencias multivaluadas independientes coexistiendo: {', '.join(independent_multivalued)}")

            if not cumple_3fn:
                cumple_4fn = False
                violacion_4fn_msg = ", ".join(violaciones_4fn) if violaciones_4fn else "Requiere normalizar a formas anteriores previamente."
            else:
                cumple_4fn = (len(violaciones_4fn) == 0)
                violacion_4fn_msg = ", ".join(violaciones_4fn) if not cumple_4fn else "Cumple 4FN (sin dependencias multivaluadas no triviales)."

            res_4fn = {
                "cumple": cumple_4fn,
                "violacion": violacion_4fn_msg,
                "sugerencia": f"Descomponer en tablas independientes para cada hecho multivaluado ({', '.join(violaciones_4fn)})." if violaciones_4fn else "No requiere corrección (cumple 4FN)."
            }

            clase_cumple = cumple_1fn and cumple_2fn and cumple_3fn and cumple_4fn
            if not clase_cumple:
                todas_cumplen = False

            clases_report.append({
                "clase": c_name,
                "cumple_todas": clase_cumple,
                "1FN": res_1fn,
                "2FN": res_2fn,
                "3FN": res_3fn,
                "4FN": res_4fn
            })

        # Construir resumen markdown legible y detallado para el chat
        md_lines = [
            "📊 **Auditoría de Normalización Relacional (1FN a 4FN)**",
            "_Nota: Evaluación asistida basada en el modelo lógico OMG UML 2.5. El lienzo no se modificará automáticamente._\n"
        ]

        norm_forms = [("1FN", "Primera Forma Normal"), ("2FN", "Segunda Forma Normal"), ("3FN", "Tercera Forma Normal"), ("4FN", "Cuarta Forma Normal")]
        if target_form:
            norm_forms = [(k, desc) for k, desc in norm_forms if k.lower() == target_form.lower()]

        for r in clases_report:
            if r.get("datos_insuficientes"):
                md_lines.append(f"### 🏷️ Clase: `{r['clase']}` — [⚠️ Datos insuficientes]")
                md_lines.append(f"• **Aviso:** {r['aviso']}\n")
                continue

            estado = "✅ Cumple 1FN–4FN" if r["cumple_todas"] else "⚠️ Requiere Normalización"
            md_lines.append(f"### 🏷️ Clase: `{r['clase']}` — [{estado}]")

            for fn_key, fn_title in norm_forms:
                fn_data = r[fn_key]
                st_icon = "✅ Cumple" if fn_data["cumple"] else "❌ No cumple"
                md_lines.append(f"• **{fn_key} ({fn_title}):**")
                md_lines.append(f"  - **Estado:** {st_icon}")
                if fn_data["cumple"]:
                    md_lines.append(f"  - **Diagnóstico:** {fn_data['violacion']}")
                else:
                    md_lines.append(f"  - **Causa de la violación:** {fn_data['violacion']}")
                    md_lines.append(f"  - **Sugerencia de corrección:** {fn_data['sugerencia']}")
            md_lines.append("")

        if todas_cumplen and clases_report:
            md_lines.append("🎉 **Conclusión Global:** El modelo se encuentra completamente normalizado hasta **4FN**.")
        else:
            md_lines.append("💡 _Recordatorio:_ Esta auditoría es de evaluación asistida. Ningún cambio se aplicará al lienzo sin confirmación.")

        reporte_md = "\n".join(md_lines)

        return {
            "cumple_todas": todas_cumplen,
            "resumen": "Modelo completamente normalizado hasta 4FN." if todas_cumplen else "Se detectaron violaciones de normalización en una o más clases.",
            "reporte_markdown": reporte_md,
            "schema": schema,
            "clases": clases_report
        }
