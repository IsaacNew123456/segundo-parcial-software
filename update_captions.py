import docx

doc_path = '1er Examen Parcial - DiagramadorUML.docx'
doc = docx.Document(doc_path)

caption_map = {
    'Figura 2.1:': 'Figura 2.1: Diagrama General de Casos de Uso - Segundo Parcial [Archivo EA: diagramas_enterprise_architect/01_Casos_de_Uso/diagrama_general_casos_de_uso_p2.xmi]',
    'Figura 2.2:': 'Figura 2.2: Diagrama de Paquetes de Análisis - Segundo Parcial [Archivo EA: diagramas_enterprise_architect/02_Analisis_Paquetes/diagrama_paquetes_analisis_p2.xmi]',
    'Figura 2.3:': 'Figura 2.3: Diagrama de Comunicación BCE - Ciclo #5 [Archivo EA: diagramas_enterprise_architect/03_Comunicacion_BCE/diagrama_comunicacion_ciclo5.xmi]',
    'Figura 2.4:': 'Figura 2.4: Diagrama de Comunicación BCE - Ciclo #6 [Archivo EA: diagramas_enterprise_architect/03_Comunicacion_BCE/diagrama_comunicacion_ciclo6.xmi]',
    'Figura 2.5:': 'Figura 2.5: Diagrama de Comunicación BCE - Ciclo #7 [Archivo EA: diagramas_enterprise_architect/03_Comunicacion_BCE/diagrama_comunicacion_ciclo7.xmi]',
    'Figura 2.6:': 'Figura 2.6: Diagrama de Comunicación BCE - Ciclo #8 [Archivo EA: diagramas_enterprise_architect/03_Comunicacion_BCE/diagrama_comunicacion_ciclo8.xmi]',
    'Figura 2.7:': 'Figura 2.7: Diagrama de Despliegue Físico - Segundo Parcial [Archivo EA: diagramas_enterprise_architect/04_Diseno_Arquitectura/diagrama_despliegue_fisico_p2.xmi]',
    'Figura 2.8:': 'Figura 2.8: Diagrama de Clases de Diseño - Metamodelo Completo [Archivo EA: diagramas_enterprise_architect/04_Diseno_Arquitectura/diagrama_clases_diseno_metamodelo.xmi]',
    'Figura 2.9:': 'Figura 2.9: Esquema Relacional Lógico Normalizado 1FN a 4FN [Archivo EA: diagramas_enterprise_architect/05_Diseno_Datos_1FN_4FN/diagrama_relacional_normalizacion_1fn_4fn.xmi]',
    'Figura 2.10:': 'Figura 2.10: Diagrama de Secuencia CU13 - Autenticación JWT [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu13_login.xmi]',
    'Figura 2.11:': 'Figura 2.11: Diagrama de Secuencia CU14 - Gestión de Proyectos [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu14_proyectos.xmi]',
    'Figura 2.12:': 'Figura 2.12: Diagrama de Secuencia CU15 - Chat Grupal [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu15_chat_grupal.xmi]',
    'Figura 2.13:': 'Figura 2.13: Diagrama de Secuencia CU16 - Mutación Incremental con IA [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu16_ia_mutacion.xmi]',
    'Figura 2.14:': 'Figura 2.14: Diagrama de Secuencia CU17 - Sugerencia y Confirmación [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu17_sugerencias.xmi]',
    'Figura 2.15:': 'Figura 2.15: Diagrama de Secuencia CU18 - Auditoría Normalización [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu18_normalizacion.xmi]',
    'Figura 2.16:': 'Figura 2.16: Diagrama de Secuencia CU19 - Historial de Sesiones [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu19_historial.xmi]',
    'Figura 2.17:': 'Figura 2.17: Diagrama de Secuencia CU21 - APK Espectador y Regla 403 [Archivo EA: diagramas_enterprise_architect/06_Secuencias_Casos_de_Uso/secuencia_cu21_movil_403.xmi]',
    'Figura 2.18:': 'Figura 2.18: Diagrama de Componentes del Sistema - Segundo Parcial [Archivo EA: diagramas_enterprise_architect/07_Implementacion_Componentes/diagrama_componentes_segundo_parcial.xmi]',
}

updated_count = 0
for p in doc.paragraphs:
    for prefix, new_text in caption_map.items():
        if p.text.strip().startswith(prefix):
            p.text = new_text
            p.runs[0].font.italic = True
            p.runs[0].font.size = docx.shared.Pt(9.5)
            p.runs[0].font.color.rgb = docx.shared.RGBColor(80, 80, 80)
            updated_count += 1
            break

try:
    doc.save(doc_path)
    print(f"Updated {updated_count} figure captions in {doc_path}!")
except PermissionError:
    final_path = '1er Examen Parcial - DiagramadorUML_ACTUALIZADO.docx'
    doc.save(final_path)
    print(f"Nota: Word tiene abierto '{doc_path}'. Se guardó la versión con todas las citas de XMI en '{final_path}' ({updated_count} figuras actualizadas).")

