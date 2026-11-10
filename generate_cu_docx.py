# -*- coding: utf-8 -*-
"""
Script para generar el documento Word formal con las tablas de Casos de Uso del Segundo Parcial (CU13 a CU21).
Estilo idéntico a las tablas del Primer Parcial (CU1 a CU12) del proyecto UML Studio CASE.
"""

import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

CASOS_DE_USO = [
    {
        "id": "CU13",
        "nombre": "CU13: Autenticación y perfil (web y móvil)",
        "proposito": "Identificar y autenticar al usuario mediante credenciales únicas centralizadas, válidas e interoperables tanto en la plataforma web (Angular 20) como en el cliente móvil espectador (APK Flutter).",
        "actores": "A1 (Diseñador), A2 (Colaborador), A3 (Espectador móvil)",
        "iniciador": "Usuario (Diseñador, Colaborador o Espectador)",
        "precondicion": "Conexión a red activa. Para inicio de sesión: contar con una cuenta de usuario previamente registrada en el sistema.",
        "flujo": (
            "1. El usuario accede al cliente web o ejecuta la APK móvil.\n"
            "2. El usuario selecciona la acción deseada: \"Iniciar Sesión\" o \"Registrarse\".\n"
            "3. En caso de registro: introduce nombre de usuario, correo electrónico institucional y contraseña segura.\n"
            "4. En caso de inicio de sesión: ingresa sus credenciales (correo electrónico y contraseña).\n"
            "5. El backend Django valida el formato de entrada, aplica la política de seguridad y comprueba las credenciales contra el hash seguro en PostgreSQL.\n"
            "6. El sistema emite un par criptográfico de tokens JWT (Access Token de corta duración y Refresh Token persistente).\n"
            "7. El cliente almacena de forma segura los tokens en almacenamiento local y redirige al usuario a la lista de proyectos disponibles.\n"
            "8. (Opcional) El usuario accede a la sección de perfil para actualizar su información personal o modificar su contraseña de acceso."
        ),
        "postcondicion": "El usuario queda formalmente autenticado con una sesión JWT válida; la misma cuenta es operativa e intercambiable entre el entorno web y el dispositivo móvil.",
        "excepcion": "Credenciales inválidas (401 Unauthorized), correo duplicado (400 Bad Request) o contraseña que no cumple los estándares de robustez; el sistema deniega el acceso y muestra la alerta correspondiente. Token expirado sin refresh válido solicita re-autenticación."
    },
    {
        "id": "CU14",
        "nombre": "CU14: Gestionar proyectos y miembros",
        "proposito": "Crear proyectos colaborativos (grupos de trabajo), aprovisionar su lienzo de diagrama UML asociado con identificador único (UUID v4), invitar a miembros por correo electrónico y gobernar los roles de acceso.",
        "actores": "A1 (Diseñador)",
        "iniciador": "Diseñador (Propietario del proyecto)",
        "precondicion": "Usuario previamente autenticado en el sistema (CU13) con privilegios de Diseñador.",
        "flujo": (
            "A. Crear Proyecto:\n"
            "1. El diseñador presiona el botón \"Nuevo Proyecto\" e ingresa el nombre y descripción del proyecto.\n"
            "2. El sistema genera criptográficamente un identificador global único de sala (room_id UUID v4).\n"
            "3. El sistema crea el registro del proyecto en PostgreSQL, asocia el lienzo de trabajo y asigna al creador el rol de Diseñador (designer).\n"
            "4. El sistema redirige al diseñador a la vista del proyecto con el lienzo y chat habilitados.\n"
            "B. Invitar Miembros:\n"
            "1. El diseñador abre el panel \"Gestionar Miembros\", introduce el correo de un usuario registrado y selecciona el rol a asignar (designer, collaborator o viewer).\n"
            "2. El sistema verifica la existencia del usuario en la base de datos y registra la membresía en la tabla relacional correspondiente.\n"
            "C. Cambiar o Revocar Membresías:\n"
            "1. El diseñador selecciona a un miembro de la lista para modificar su rol o darlo de baja.\n"
            "2. El sistema actualiza los privilegios con efecto inmediato sobre las sesiones activas."
        ),
        "postcondicion": "El proyecto queda registrado y persistido con su lienzo asignado; el acceso al lienzo y a su chat grupal queda estrictamente restringido a los miembros autorizados.",
        "excepcion": "Correo electrónico no registrado en la plataforma; se notifica al diseñador. Intento de un no-diseñador de invitar o modificar roles; el servidor deniega la operación con código HTTP 403 Forbidden."
    },
    {
        "id": "CU15",
        "nombre": "CU15: Chat grupal del proyecto",
        "proposito": "Proporcionar un canal de comunicación interactivo y sincrónico en tiempo real para el equipo de trabajo, integrando a la IA como moderadora activa capaz de responder consultas e interpretar comandos arquitectónicos.",
        "actores": "A1 (Diseñador), A2 (Colaborador), A3 (Espectador móvil), A4 (IA Moderadora)",
        "iniciador": "Cualquier miembro autenticado del proyecto",
        "precondicion": "Usuario autenticado (CU13) con membresía activa en el proyecto.",
        "flujo": (
            "1. El usuario abre el panel de chat grupal del proyecto en el cliente web o en la APK móvil.\n"
            "2. El usuario redacta un mensaje de texto y presiona el botón de envío.\n"
            "3. El servidor difunde el mensaje en tiempo real a todos los miembros conectados mediante WebSocket (Daphne / Django Channels y Redis).\n"
            "4. El backend persiste el mensaje en la base de datos PostgreSQL asociándolo a la sesión colaborativa activa (CU19).\n"
            "5. La IA Moderadora analiza sintácticamente el contenido para evaluar si contiene una instrucción dirigida a ella (mención \"@ia\" o intención arquitectónica detectada).\n"
            "6. Si el mensaje es una orden para la IA, el sistema ejecuta el caso de uso correspondiente (CU16, CU17, CU18 o CU20) y la IA publica su respuesta estructurada en el chat.\n"
            "7. Si es una conversación humana habitual, la IA permanece en escucha pasiva y el mensaje queda registrado en el historial."
        ),
        "postcondicion": "Los mensajes se sincronizan instantáneamente entre todos los miembros y quedan auditados y persistidos en la sesión de trabajo.",
        "excepcion": "Pérdida de conectividad WebSocket; el cliente activa el protocolo de reconexión automática y recupera los mensajes pendientes. Intento de conexión por un usuario no perteneciente al proyecto; el canal WebSocket se cierra con código 4403."
    },
    {
        "id": "CU16",
        "nombre": "CU16: Modificar el diagrama mediante la IA moderadora",
        "proposito": "Permitir a los diseñadores y colaboradores solicitar modificaciones sobre el diagrama UML (añadir clases, modificar atributos o establecer relaciones) mediante instrucciones en lenguaje natural dirigidas a la IA en el chat.",
        "actores": "A1 (Diseñador), A2 (Colaborador), A4 (IA Moderadora)",
        "iniciador": "Diseñador o Colaborador",
        "precondicion": "Miembro autenticado con rol de designer o collaborator dentro del chat de un proyecto con lienzo activo.",
        "flujo": (
            "1. El usuario escribe una orden en el chat grupal dirigida a la IA (p. ej., \"@ia agrega la clase Factura con id: int, fecha: date y total: double\", \"@ia añade el atributo email a Estudiante\" o \"@ia relaciona Docente con Materia 1 a *\").\n"
            "2. El backend intercepta el mensaje y verifica en el servidor que el emisor posea privilegios de edición (designer o collaborator).\n"
            "3. El backend envía a la API de Google Gemini el prompt del usuario junto con el esquema canónico actual del diagrama (currentDiagram / BackupUML).\n"
            "4. Gemini sintetiza y devuelve una mutación incremental estructurada en formato JSON (adición o actualización de clases y conectores).\n"
            "5. El backend somete la mutación a validación estricta contra UmlSchema y las reglas del metamodelo UML (verificando que no se asignen multiplicidades en herencias o dependencias, ni enlaces ilegales).\n"
            "6. El sistema aplica la mutación incremental sobre BackupUML en PostgreSQL sin destruir ni re-renderizar todo el lienzo gráfico.\n"
            "7. El cambio se propaga de forma instantánea por WebSocket a todos los clientes web y móviles conectados.\n"
            "8. La IA Moderadora emite un mensaje en el chat anunciando los cambios aplicados y citando al usuario que originó la orden.\n"
            "9. La mutación y el evento se registran en el historial de la sesión activa (CU19)."
        ),
        "postcondicion": "El diagrama UML se actualiza incrementalmente en tiempo real en todos los clientes conectados, manteniendo la integridad del metamodelo y la persistencia en base de datos.",
        "excepcion": (
            "• Petición emitida por un usuario con rol viewer (espectador móvil); la IA rechaza la orden respondiendo que su rol es estrictamente de solo lectura.\n"
            "• Orden ambigua o contradictoria; la IA solicita aclaración en el chat sin aplicar modificaciones sobre el lienzo.\n"
            "• Mutación que viola reglas del metamodelo UML (p. ej. multiplicidad en relación de herencia); el validador del backend rechaza la mutación y la IA explica el error de modelado."
        )
    },
    {
        "id": "CU17",
        "nombre": "CU17: Sugerir y revisar relaciones con IA",
        "proposito": "Obtener asesoramiento inteligente de la IA Moderadora para proponer nuevas relaciones semánticas entre clases existentes o para auditar y detectar anomalías arquitectónicas en las relaciones actuales del modelo.",
        "actores": "A1 (Diseñador), A2 (Colaborador), A4 (IA Moderadora)",
        "iniciador": "Diseñador o Colaborador",
        "precondicion": "Lienzo de trabajo activo con al menos dos clases modeladas.",
        "flujo": (
            "A. Sugerir Relaciones:\n"
            "1. El usuario solicita en el chat: \"@ia sugiere relaciones entre las clases\".\n"
            "2. La IA analiza semánticamente las entidades, atributos y dominios de las clases modeladas.\n"
            "3. La IA responde en el chat con una lista numerada de sugerencias justificadas (tipo de relación, multiplicidad en ambos extremos y roles), sin alterar el lienzo (Regla Inviolable 3).\n"
            "4. El usuario evalúa las propuestas y responde con una confirmación explícita (p. ej., \"@ia aplica la sugerencia 2\").\n"
            "5. El sistema valida la selección y aplica la relación incrementalmente siguiendo el flujo de CU16.\n"
            "B. Revisar Relaciones Existentes:\n"
            "1. El usuario solicita en el chat: \"@ia revisa las relaciones del modelo\".\n"
            "2. La IA analiza exhaustivamente el grafo en busca de antipatrones: dependencias circulares, multiplicidades inconsistentes, clases huérfanas o relaciones mal formadas.\n"
            "3. La IA emite un reporte técnico en el chat con los hallazgos y propuestas de corrección."
        ),
        "postcondicion": "El equipo cuenta con recomendaciones arquitectónicas fundamentadas; el lienzo no sufre ninguna mutación hasta que un usuario con permisos confirme explícitamente la acción.",
        "excepcion": "Diagrama con menos de dos clases; la IA responde indicando que no existe material suficiente para inferir o auditar relaciones. Usuario con rol de espectador puede solicitar sugerencias pero no aplicarlas."
    },
    {
        "id": "CU18",
        "nombre": "CU18: Auditar normalización (1FN–4FN)",
        "proposito": "Auditar de forma asistida si el modelo de clases cumple rigurosamente las formas normales relacionales (1FN, 2FN, 3FN y 4FN) para garantizar la calidad del esquema de datos subyacente.",
        "actores": "A1 (Diseñador), A2 (Colaborador), A3 (Espectador móvil - modo consulta), A4 (IA Moderadora)",
        "iniciador": "Cualquier miembro del proyecto",
        "precondicion": "Diagrama con al menos una clase con atributos definidos.",
        "flujo": (
            "1. El usuario solicita en el chat: \"@ia verifica la normalización del diagrama\" (pudiendo indicar una clase específica o una forma normal particular).\n"
            "2. El servicio de normalización transforma el modelo UML a su esquema relacional lógico equivalente (clase a tabla, atributo a columna, relación 1:N a clave foránea y relación N:M a tabla asociativa).\n"
            "3. La IA evalúa sistemáticamente el cumplimiento de cada forma normal:\n"
            "   - 1FN: Atomicidad de atributos y ausencia de grupos repetitivos o multivaluados.\n"
            "   - 2FN: Dependencia funcional completa de atributos no clave respecto a la clave primaria.\n"
            "   - 3FN: Ausencia de dependencias transitivas entre atributos no clave.\n"
            "   - 4FN: Ausencia de dependencias multivaluadas no triviales e independientes.\n"
            "4. La IA emite en el chat un reporte técnico estructurado por entidad indicando estado (Cumple / No Cumple), causas de las anomalías detectadas y propuestas de normalización.\n"
            "5. El reporte se cataloga formalmente como \"evaluación asistida\"; las correcciones sugeridas no se aplican al lienzo sin la confirmación explícita del usuario mediante el CU16."
        ),
        "postcondicion": "El equipo obtiene un diagnóstico formal sobre la normalización relacional del modelo, el cual queda auditado y registrado en la sesión colaborativa.",
        "excepcion": "Entidades sin atributos definidos o falta de información suficiente para deducir dependencias funcionales; la IA emite un aviso preventivo indicando los datos faltantes. El diagnóstico es estrictamente de solo lectura."
    },
    {
        "id": "CU19",
        "nombre": "CU19: Consultar historial de sesiones",
        "proposito": "Permitir a los miembros del proyecto consultar y auditar la trazabilidad cronológica de las sesiones colaborativas previas, revisando mensajes de chat, órdenes procesadas por la IA y el estado histórico del diagrama mediante snapshots.",
        "actores": "A1 (Diseñador), A2 (Colaborador), A3 (Espectador móvil)",
        "iniciador": "Cualquier miembro del proyecto",
        "precondicion": "El usuario debe pertenecer al proyecto y debe existir al menos una sesión de trabajo registrada.",
        "flujo": (
            "1. El usuario accede a la sección \"Historial de Sesiones\" del proyecto en la web o en la APK.\n"
            "2. El sistema consulta PostgreSQL y presenta el listado de sesiones anteriores ordenadas cronológicamente, detallando fecha y hora, duración, participantes conectados y resumen de actividades.\n"
            "3. El usuario selecciona una sesión específica para inspeccionar.\n"
            "4. El sistema despliega la línea de tiempo unificada conteniendo: los mensajes del chat grupal, las órdenes procesadas por la IA con sus resultados y los eventos de edición del lienzo.\n"
            "5. El sistema carga y muestra en modo de solo lectura el snapshot canónico (snapshot JSON) del diagrama correspondiente al cierre de dicha sesión."
        ),
        "postcondicion": "El usuario visualiza la evolución histórica y las decisiones arquitectónicas tomadas en la sesión consultada, sin posibilidad de alterar los datos registrados.",
        "excepcion": "Proyecto sin sesiones registradas; se muestra un mensaje informativo de historial vacío. El historial es estrictamente de solo lectura; cualquier petición PUT o DELETE sobre el historial devuelve código HTTP 405 Method Not Allowed."
    },
    {
        "id": "CU20",
        "nombre": "CU20: Resumir el estado del lienzo por chat",
        "proposito": "Proporcionar a los usuarios una síntesis instantánea, coherente y precisa del contenido actual del lienzo (clases y relaciones) y del progreso acumulado durante la sesión colaborativa o en jornadas anteriores.",
        "actores": "A1 (Diseñador), A2 (Colaborador), A3 (Espectador móvil), A4 (IA Moderadora)",
        "iniciador": "Cualquier miembro del proyecto (incluyendo espectadores móviles)",
        "precondicion": "Usuario autenticado con membresía válida en el proyecto.",
        "flujo": (
            "1. El usuario formula en el chat una consulta de avance (p. ej., \"@ia ¿qué hay en el lienzo?\", \"@ia resume el avance de hoy\" o \"@ia ¿qué clases faltan por definir?\").\n"
            "2. El backend extrae el estado actual del diagrama (BackupUML) y recopila los eventos recientes registrados en la sesión activa.\n"
            "3. El sistema entrega este contexto a la IA Gemini para su procesamiento y síntesis ejecutiva.\n"
            "4. La IA genera y responde en el chat grupal con un resumen estructurado que detalla: número y listado de clases con sus responsabilidades, relaciones conectadas, modificaciones recientes y recomendaciones sobre elementos pendientes."
        ),
        "postcondicion": "Los integrantes del proyecto reciben una descripción sintética y actualizada del estado del diagrama en el chat grupal.",
        "excepcion": "Lienzo completamente vacío; la IA responde indicando que aún no se han modelado entidades ni relaciones en el proyecto. La consulta no produce mutaciones sobre el modelo."
    },
    {
        "id": "CU21",
        "nombre": "CU21: Visualizar proyecto desde la APK (espectador)",
        "proposito": "Permitir a los usuarios seguir y supervisar el avance de los proyectos y diagramas en tiempo real desde dispositivos móviles Android mediante una APK desarrollada en Flutter, operando bajo modalidad estrictamente de solo lectura para salvaguardar la integridad del modelo.",
        "actores": "A3 (Espectador móvil)",
        "iniciador": "Espectador móvil (Usuario en la APK)",
        "precondicion": "Cuenta de usuario registrada en el sistema (CU13, las mismas credenciales que en la plataforma web) con membresía en el proyecto.",
        "flujo": (
            "1. El usuario abre la aplicación móvil Flutter e inicia sesión con sus credenciales de usuario (correo y contraseña).\n"
            "2. El sistema autentica mediante JWT y presenta la lista de proyectos asignados al usuario.\n"
            "3. El usuario selecciona un proyecto para abrirlo.\n"
            "4. El sistema descarga el estado del diagrama y lo visualiza en el lienzo móvil en modo solo lectura, permitiendo gestos de zoom táctil y desplazamiento (pan), pero deshabilitando el arrastre, edición de clases o creación de relaciones.\n"
            "5. La APK se suscribe a los eventos del lienzo por WebSocket y refleja en tiempo real las modificaciones que los diseñadores efectúan en el cliente web.\n"
            "6. El usuario puede abrir el chat grupal para realizar consultas de resumen a la IA (CU20) o revisar el historial de sesiones (CU19)."
        ),
        "postcondicion": "El usuario móvil sigue el estado y la evolución del diagrama en tiempo real con garantías de inmutabilidad sobre el modelo.",
        "excepcion": (
            "• Cualquier intento de enviar operaciones de edición o mutación sobre el diagrama desde la APK; el servidor valida el encabezado de cliente/rol y rechaza la solicitud de manera categórica con código de error HTTP 403 Forbidden.\n"
            "• El usuario solicita en el chat una modificación a la IA; la IA detecta el origen/rol y responde informando que su rol es de solo lectura y no tiene privilegios de escritura.\n"
            "• Pérdida de conexión de red; la aplicación exhibe el último estado almacenado en caché y muestra un aviso visual de desconexión."
        )
    }
]

# Constantes de diseño idénticas al Primer Parcial
DXA_COL0 = 1560   # ~1.08 in
DXA_COL1 = 7649   # ~5.31 in
FILL_HEADER_LEFT = "C8DAF8" # Color azul suave institucional

def set_cell_props(cell, width_dxa, fill_hex=None):
    tcPr = cell._tc.get_or_add_tcPr()
    for child in list(tcPr):
        if child.tag.endswith(('tcW', 'shd')):
            tcPr.remove(child)
    tcW = parse_xml(f'<w:tcW {nsdecls("w")} w:w="{width_dxa}" w:type="dxa"/>')
    tcPr.append(tcW)
    if fill_hex:
        shd = parse_xml(f'<w:shd {nsdecls("w")} w:val="clear" w:color="auto" w:fill="{fill_hex}"/>')
        tcPr.append(shd)

def set_table_borders_and_margins(tbl):
    tblPr = tbl._tbl.tblPr
    for child in list(tblPr):
        if child.tag.endswith(('tblBorders', 'tblCellMar', 'tblW', 'tblLayout', 'tblInd')):
            tblPr.remove(child)
    
    tblPr.append(parse_xml(f'<w:tblW {nsdecls("w")} w:w="0" w:type="auto"/>'))
    tblPr.append(parse_xml(f'<w:tblInd {nsdecls("w")} w:w="348" w:type="dxa"/>'))
    tblPr.append(parse_xml(f'<w:tblLayout {nsdecls("w")} w:type="fixed"/>'))
    
    borders = parse_xml(f"""
        <w:tblBorders {nsdecls("w")}>
            <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
            <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
    """)
    tblPr.append(borders)
    
    margins = parse_xml(f"""
        <w:tblCellMar {nsdecls("w")}>
            <w:top w:w="90" w:type="dxa"/>
            <w:left w:w="140" w:type="dxa"/>
            <w:bottom w:w="90" w:type="dxa"/>
            <w:right w:w="140" w:type="dxa"/>
        </w:tblCellMar>
    """)
    tblPr.append(margins)

def create_cu_document(output_filename="Casos_de_Uso_Segundo_Parcial_CU13_CU21.docx"):
    doc = docx.Document()

    # Configuración de márgenes estándar (1 pulgada = 2.54 cm)
    for section in doc.sections:
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

    # Estilo base Normal
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Times New Roman'
    style_normal.font.size = Pt(11)
    style_normal.font.color.rgb = RGBColor(0, 0, 0)

    # Título principal del documento
    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_p.paragraph_format.space_before = Pt(0)
    title_p.paragraph_format.space_after = Pt(4)
    run_title = title_p.add_run("ESPECIFICACIÓN DE CASOS DE USO — SEGUNDO PARCIAL")
    run_title.font.name = 'Times New Roman'
    run_title.font.size = Pt(15)
    run_title.bold = True
    run_title.font.color.rgb = RGBColor(26, 54, 93)

    # Subtítulo institucional
    subtitle_p = doc.add_paragraph()
    subtitle_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subtitle_p.paragraph_format.space_before = Pt(0)
    subtitle_p.paragraph_format.space_after = Pt(14)
    run_sub = subtitle_p.add_run("UML Studio CASE · Colaboración en Tiempo Real, IA Moderadora y APK Espectadora\nIngeniería de Software 1 (INF-422) · UAGRM")
    run_sub.font.name = 'Times New Roman'
    run_sub.font.size = Pt(11)
    run_sub.italic = True
    run_sub.font.color.rgb = RGBColor(70, 70, 70)

    # Metadatos del proyecto
    meta_p = doc.add_paragraph()
    meta_p.paragraph_format.space_before = Pt(0)
    meta_p.paragraph_format.space_after = Pt(16)
    meta_p.paragraph_format.line_spacing = 1.15
    run_meta = meta_p.add_run(
        "Docente: Ing. Rolando Antonio Martínez Canedo\n"
        "Estudiante: Camacho Jimenez Jairo Lisandro (Registro: 222053348)\n"
        "Alcance: Casos de Uso CU13 a CU21 (Ciclos de Desarrollo #5 a #8)"
    )
    run_meta.font.name = 'Times New Roman'
    run_meta.font.size = Pt(10)
    run_meta.font.color.rgb = RGBColor(40, 40, 40)

    for cu in CASOS_DE_USO:
        # Título identificador antes de la tabla
        p_cu_title = doc.add_paragraph()
        p_cu_title.paragraph_format.space_before = Pt(12)
        p_cu_title.paragraph_format.space_after = Pt(4)
        p_cu_title.paragraph_format.keep_with_next = True
        run_h = p_cu_title.add_run(f"Caso de Uso — {cu['nombre']}")
        run_h.font.name = 'Times New Roman'
        run_h.font.size = Pt(12)
        run_h.bold = True
        run_h.font.color.rgb = RGBColor(16, 44, 87)

        # Crear tabla de 8 filas y 2 columnas
        table = doc.add_table(rows=8, cols=2)
        set_table_borders_and_margins(table)

        rows_data = [
            ("Caso de Uso", cu["nombre"], True),
            ("Propósito", cu["proposito"], False),
            ("Actores", cu["actores"], False),
            ("Iniciador", cu["iniciador"], False),
            ("Precondición", cu["precondicion"], False),
            ("Flujo de Suceso Principal", cu["flujo"], False),
            ("Postcondición", cu["postcondicion"], False),
            ("Excepción", cu["excepcion"], False)
        ]

        for r_idx, (label, val, is_header_row) in enumerate(rows_data):
            row = table.rows[r_idx]
            cell0 = row.cells[0]
            cell1 = row.cells[1]

            # Aplicar dimensiones y color de sombreado
            set_cell_props(cell0, DXA_COL0, FILL_HEADER_LEFT)
            set_cell_props(cell1, DXA_COL1, FILL_HEADER_LEFT if is_header_row else None)

            # Contenido Columna 0 (Etiqueta)
            p0 = cell0.paragraphs[0]
            p0.paragraph_format.space_before = Pt(3)
            p0.paragraph_format.space_after = Pt(3)
            p0.paragraph_format.line_spacing = 1.15
            run0 = p0.add_run(label)
            run0.font.name = 'Times New Roman'
            run0.font.size = Pt(10.5)
            run0.bold = True

            # Contenido Columna 1 (Valor)
            lines = val.split('\n')
            for l_idx, line in enumerate(lines):
                if l_idx == 0:
                    p1 = cell1.paragraphs[0]
                else:
                    p1 = cell1.add_paragraph()
                p1.paragraph_format.space_before = Pt(1.5)
                p1.paragraph_format.space_after = Pt(1.5)
                p1.paragraph_format.line_spacing = 1.15
                
                run1 = p1.add_run(line)
                run1.font.name = 'Times New Roman'
                run1.font.size = Pt(10.5)
                if is_header_row:
                    run1.bold = True

        # Separador entre tablas
        p_sep = doc.add_paragraph()
        p_sep.paragraph_format.space_before = Pt(6)
        p_sep.paragraph_format.space_after = Pt(6)

    # Guardar documento
    doc.save(output_filename)
    print(f"Documento guardado con éxito en: {os.path.abspath(output_filename)}")

if __name__ == "__main__":
    create_cu_document()
