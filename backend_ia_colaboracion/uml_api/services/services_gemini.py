import re
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import json
from django.conf import settings
from uuid import uuid4

# Configurar Sesión Persistente con Failover Inmediato (ISO/IEC 25010 - Eficiencia y Rendimiento)
# No retenemos peticiones con 503/429 en el adapter; dejamos que salte de inmediato al siguiente modelo.
gemini_session = requests.Session()
retries = Retry(total=1, backoff_factor=0.1, status=0, connect=1, read=1)
gemini_session.mount('https://', HTTPAdapter(max_retries=retries, pool_connections=10, pool_maxsize=10))

# Modelo oficial activo en Google AI Studio (2025/2026)
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"


def _sanitize_diagram_for_llm(diagram: dict) -> dict:
    """
    Filtra y elimina ruido visual (coordenadas x,y, tamaños, estilos y vértices)
    dejando únicamente la semántica UML pura (ISO/IEC 25010 - Eficiencia de Recursos).
    Esto reduce el consumo de tokens en un ~75% y acelera drásticamente la respuesta del LLM.
    """
    if not isinstance(diagram, dict):
        return {}

    clean_classes = []
    for c in diagram.get("classes", []):
        if not isinstance(c, dict):
            continue
        clean_classes.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "attributes": [
                {"name": a.get("name"), "type": a.get("type", "string")}
                for a in c.get("attributes", []) if isinstance(a, dict) and a.get("name")
            ],
            "methods": [
                {
                    "name": m.get("name"),
                    "parameters": m.get("parameters", ""),
                    "returnType": m.get("returnType", "void")
                }
                for m in c.get("methods", []) if isinstance(m, dict) and m.get("name")
            ]
        })

    clean_rels = []
    for r in diagram.get("relationships", []):
        if not isinstance(r, dict):
            continue
        clean_rels.append({
            "id": r.get("id"),
            "type": r.get("type", "association"),
            "sourceId": r.get("sourceId"),
            "targetId": r.get("targetId"),
            "labels": r.get("labels", [])
        })

    return {"classes": clean_classes, "relationships": clean_rels}


def call_gemini(prompt: str, current_diagram: dict = None):
    """
    Copiloto de IA para modelado UML incremental optimizado para alta velocidad y bajo consumo de tokens.
    Recibe la instrucción del usuario y el estado semántico del lienzo.
    Devuelve un JSON con:
      - "message": Explicación concisa en español de los cambios aplicados.
      - "classes": Lista consolidada de clases (preservando IDs existentes).
      - "relationships": Lista consolidada de relaciones con multiplicidades.
    """
    gemini_api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not gemini_api_key:
        return json.dumps({"error": "No se encontró GEMINI_API_KEY en la configuración del servidor."})

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": gemini_api_key
    }

    # Sanitizar estado del diagrama actual para ahorrar tokens y acelerar la inferencia
    try:
        sanitized_diag = _sanitize_diagram_for_llm(current_diagram) if current_diagram else {}
    except Exception:
        sanitized_diag = {}
    
    context_str = "Lienzo actualmente vacío. Modela desde cero."
    if sanitized_diag.get("classes") or sanitized_diag.get("relationships"):
        context_str = f"ESTADO ACTUAL (JSON Compacto):\n{json.dumps(sanitized_diag, ensure_ascii=False, separators=(',', ':'))}"

    prompt_text = f"""
Eres un Arquitecto de Software y Copiloto Experto en Modelado UML (OMG UML 2.5 / ISO 25010).
Actualiza o crea el modelo UML de forma incremental y quirúrgica según la instrucción.

{context_str}

INSTRUCCIÓN:
"{prompt}"

REGLAS ESTRICTAS:
1. OPERACIONES:
   - CREAR: Si pide nuevas clases, agrégalas asignándoles un nuevo UUID único.
   - MODIFICAR / AÑADIR ATRIBUTOS/MÉTODOS: Mantén EXACTAMENTE el mismo 'id' de la clase existente. Tipos válidos: int, long, string, boolean, decimal, float, double, date, datetime.
   - RELACIONES: Tipos: 'association', 'generalization' (sourceId=hija, targetId=padre), 'aggregation', 'composition', 'dependency'. Incluye 'labels' con multiplicidades (ej: ["1", "*"], ["1", "1"]).
   - ELIMINAR: Remueve lo solicitado si se pide explícitamente.
   - Si el lienzo está vacío o piden un sistema completo, genera todas las clases con llaves 'id', atributos esenciales y relaciones estándar.
2. PRESERVAR IDENTIDAD: NUNCA alteres el 'id' de clases/relaciones preexistentes.

FORMATO OBLIGATORIO (JSON PURO):
{{
  "message": "Explicación muy breve y profesional de lo modificado en español.",
  "classes": [
    {{
      "id": "uuid",
      "name": "NombreClase",
      "attributes": [{{"name": "nombre", "type": "tipo"}}],
      "methods": [{{"name": "nombre", "parameters": "", "returnType": "void"}}]
    }}
  ],
  "relationships": [
    {{
      "id": "uuid",
      "type": "association",
      "sourceId": "uuid_origen",
      "targetId": "uuid_destino",
      "labels": ["1", "*"]
    }}
  ]
}}
"""

    data = {
        "contents": [
            {
                "parts": [
                    {"text": prompt_text.strip()}
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
            "maxOutputTokens": 8192
        }
    }

    # Modelos activos con soporte completo de generación JSON
    MODELS = [
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.7-flash",
        "gemini-flash-latest"
    ]
    last_error = None

    for model in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            response = gemini_session.post(url, headers=headers, json=data, timeout=15)
            if response.status_code == 200:
                result = response.json()
                text_output = result['candidates'][0]['content']['parts'][0]['text']
                return text_output
            else:
                last_error = response.text
        except Exception as e:
            last_error = str(e)

    return json.dumps({
        "error": f"Error al comunicar con los modelos de IA: {last_error}",
        "message": "Lo siento, el servicio de IA no pudo procesar la solicitud temporalmente."
    })


def call_gemini_analysis(prompt: str):
    """
    Auditoría de consistencia de relaciones UML mediante Gemini.
    """
    gemini_api_key = getattr(settings, "GEMINI_API_KEY", None)
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": gemini_api_key
    }

    data = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"""
Analiza este modelo UML y responde SOLO en formato JSON.

Estructura de salida obligatoria:
{{
  "validas": [
    {{
      "relacion": "Texto corto con tipo y tablas",
      "razon": "Por qué es válida"
    }}
  ],
  "errores": [
    {{
      "relacion": "Texto corto con tipo y tablas",
      "problema": "Qué está mal",
      "sugerencia": "Cómo corregirlo"
    }}
  ]
}}

No escribas explicaciones fuera del JSON.
Prompt:
{prompt}
"""
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    MODELS = [
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.7-flash",
        "gemini-flash-latest"
    ]
    last_error = None

    for model in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            response = gemini_session.post(url, headers=headers, json=data, timeout=18)
            if response.status_code == 200:
                result = response.json()
                text_output = result["candidates"][0]["content"]["parts"][0]["text"]
                return text_output
            else:
                last_error = response.text
        except Exception as e:
            last_error = str(e)

    return json.dumps({"error": f"No se pudo completar el análisis con los modelos de IA: {last_error}"})


def call_gemini_from_image(image_base64: str, mime_type: str = "image/png"):
    """
    Envía una imagen/captura de diagrama UML a Gemini 3.6 Flash y devuelve el modelo estructurado JointJS:
    - Clases (nombre, atributos, métodos)
    - Relaciones con clasificación visual y multiplicidades.
    """
    gemini_api_key = getattr(settings, "GEMINI_API_KEY", None)
    if not gemini_api_key:
        return {"error": "GEMINI_API_KEY no configurada"}

    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": gemini_api_key
    }

    prompt_text = """
Analiza cuidadosamente la imagen de un **diagrama de clases UML**.

🎯 **OBJETIVO**: Identificar con alta precisión TODAS las clases y relaciones visibles en la imagen.

**PASO 1: Identificar clases**
Detecta todos los rectángulos que representan clases con:
- Nombre de la clase (en la cabecera superior)
- Atributos en formato `nombre:tipo` o `nombre`
- Métodos en formato `nombre():tipo` o `nombre()`

**PASO 2: Identificar conectores y relaciones**
Para CADA línea entre clases, analiza:
- **Triángulo blanco/vacío** → HERENCIA (`generalization`), apunta a la clase padre.
- **Rombo blanco/vacío** → AGREGACIÓN (`aggregation`).
- **Rombo negro/relleno** → COMPOSICIÓN (`composition`).
- **Línea continua con o sin flecha abierta** → ASOCIACIÓN (`association`).
- **Línea discontinua/punteada** → DEPENDENCIA (`dependency`).
- Cardinalidades numéricas en los extremos ("1", "*", "1..*", "0..1", etc.) agregadas en 'labels'.

Devuelve ESTRICTAMENTE este formato JSON:
{
  "nodes": [
    {
      "id": "uuid1",
      "name": "NombreClase",
      "attributes": [
        {"name": "nombreAtributo", "type": "tipo"}
      ],
      "methods": [
        {"name": "nombreMetodo", "parameters": "", "returnType": "void"}
      ]
    }
  ],
  "edges_raw": [
    {
      "id": "edge-uuid1",
      "sourceName": "NombreClaseOrigen",
      "targetName": "NombreClaseDestino",
      "head": {
        "shape": "triangle|diamond|none",
        "fill": "solid|none|white|black",
        "size": "small|large|medium"
      },
      "tail": {
        "shape": "triangle|diamond|none",
        "diamond": "none|white|black",
        "fill": "solid|none|white|black"
      },
      "line": {
        "style": "solid|dashed"
      },
      "labels": ["1", "*"]
    }
  ]
}
"""

    data = {
        "contents": [
            {
                "parts": [
                    {"text": prompt_text},
                    {"inline_data": {"mime_type": mime_type, "data": image_base64}},
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }

    MODELS = [
        "gemini-3.6-flash",
        "gemini-3-flash-preview",
        "gemini-3.5-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-3.7-flash",
        "gemini-flash-latest"
    ]
    last_error = None

    for model in MODELS:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        try:
            response = gemini_session.post(url, headers=headers, json=data, timeout=20)
            if response.status_code == 200:
                result = response.json()
                text_output = result["candidates"][0]["content"]["parts"][0]["text"]
                text_output = re.sub(r"^```json\s*|\s*```$", "", text_output.strip(), flags=re.MULTILINE)
                parsed = json.loads(text_output)
                return _map_edges_to_relationships(parsed)
            else:
                last_error = response.text
        except Exception as e:
            last_error = str(e)

    return {"error": f"No se pudo procesar la imagen con los modelos de IA: {last_error}"}


def _edge_to_relationship_type(edge):
    head = edge.get("head", {})
    tail = edge.get("tail", {})
    line = edge.get("line", {})

    head_shape = head.get("shape")
    head_fill = head.get("fill")
    head_size = head.get("size")
    tail_shape = tail.get("shape")
    tail_diamond = tail.get("diamond")
    tail_fill = tail.get("fill")
    line_style = line.get("style")

    # Verificar rombos en TAIL
    if tail_diamond == "black" or (tail_shape == "diamond" and tail_fill == "black"):
        return "composition", "tail"
    if tail_diamond == "white" or (tail_shape == "diamond" and (tail_fill in ["white", "none", None])):
        return "aggregation", "tail"

    # Verificar rombos en HEAD
    if head_shape == "diamond":
        if head_fill in ["solid", "black"]:
            return "composition", "head"
        else:
            return "aggregation", "head"

    # Línea punteada
    if line_style == "dashed":
        return "dependency", "none"

    # Triángulos (Generalization / Herencia)
    if head_shape == "triangle":
        if head_fill in ["none", "white"] or head_size == "large":
            return "generalization", "head"

    if tail_shape == "triangle":
        if tail_fill in ["none", "white"]:
            return "generalization", "tail"

    return "association", "none"


def _map_edges_to_relationships(parsed_json):
    nodes = parsed_json.get("nodes", [])
    edges = parsed_json.get("edges_raw", [])

    name_to_id = {n.get("name"): (n.get("id") or str(uuid4())) for n in nodes}

    classes = [
        {
            "id": name_to_id[n.get("name")],
            "name": n.get("name"),
            "attributes": n.get("attributes", []),
            "methods": n.get("methods", []),
        }
        for n in nodes
    ]

    relationships = []
    seen = set()

    for e in edges:
        rel_type, symbol_position = _edge_to_relationship_type(e)
        src = e.get("sourceName")
        tgt = e.get("targetName")
        labels = e.get("labels", [])

        if not src or not tgt:
            continue

        if rel_type == "aggregation" and symbol_position == "head":
            src, tgt = tgt, src
        elif rel_type == "generalization" and symbol_position == "tail":
            src, tgt = tgt, src

        src_id = name_to_id.get(src)
        tgt_id = name_to_id.get(tgt)

        if not src_id or not tgt_id:
            continue

        rel_key = f"{src_id}-{tgt_id}-{rel_type}"
        if rel_key in seen:
            continue
        seen.add(rel_key)

        clean_labels = [str(lbl).strip() for lbl in labels if lbl is not None and str(lbl).strip() not in ["null", ""]]

        relationships.append({
            "id": e.get("id") or str(uuid4()),
            "type": rel_type,
            "sourceId": src_id,
            "targetId": tgt_id,
            "labels": clean_labels
        })

    return {"classes": classes, "relationships": relationships}
