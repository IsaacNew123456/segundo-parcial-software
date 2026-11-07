# Resumen del Primer Parcial

**Título:** Sistema Colaborativo Asistido por Computadora (CASE) para Modelado UML 2.5 con Generación Multicapa de Código e Integración Multimodal de Inteligencia Artificial.
**Universidad:** UAGRM — Facultad de Ingeniería en Ciencias de la Computación y Telecomunicaciones.

## 1. Problema
Cuellos de botella en el desarrollo de software de gestión:
- Desarticulación entre el diseño conceptual y la implementación (transcripción manual de entidades, repositorios, servicios, controladores).
- Fricción al capturar diseños hechos en pizarra.
- Falta de interoperabilidad con herramientas CASE estándar (Enterprise Architect).
- Herramientas monousuario, sin edición simultánea.
- Demoras en probar endpoints (configuración manual de Postman).

## 2. Objetivo general
Construir una infraestructura CASE colaborativa y remota asistida por IA que permita modelar diagramas de clases UML 2.5 en tiempo real, interoperar con Enterprise Architect (OMG XMI 2.1) y generar automáticamente backend Spring Boot 3, PostgreSQL, colección Postman v2.1 y frontend Flutter.

## 3. Objetivos específicos (síntesis)
1. Lienzo UML 2.5 reactivo en Angular 20 con 5 relaciones: Asociación, Herencia, Agregación, Composición, Dependencia (con cardinalidades editables).
2. Colaboración multiusuario con WebSockets (Django Channels, Daphne, Redis), salas con UUID v4, persistencia en PostgreSQL 17.
3. Copiloto IA multimodal (Gemini): digitalizar fotos de pizarra y mutar el lienzo por voz/texto sin redibujar todo.
4. Motor XMI 2.1: exportar a y importar desde Enterprise Architect.
5. Generador Spring Boot 3 / Java 21 en 4 capas (Entity, Repository, Service, Controller) con PostgreSQL y Maven.
6. Colecciones Postman v2.1 con CRUD por entidad y payloads válidos.
7. Generador de proyectos Flutter con pantallas CRUD.
8. Atributos de calidad ISO/IEC 25010.

## 4. Alcance y límites
- **Incluye:** modelado estructural UML 2.5, salas UUID con presencia, persistencia dual (`localStorage` + PostgreSQL con debounce de 500 ms), IA multimodal, XMI compatible con Enterprise Architect 15/16, generación descargable `.zip`.
- **Excluye:** diagramas de comportamiento (estado, secuencia, actividades); el generador produce **solo** Spring Boot 3 + JPA/Hibernate + PostgreSQL; la voz depende de Web Speech API (Chrome/Edge).

## 5. Actores
- **A1 Diseñador:** crea lienzos, modela, importa/exporta XMI, usa la IA, genera código.
- **A2 Colaborador:** se une con el código de sala, edita en concurrencia, usa la IA y exporta.

## 6. Casos de uso (CU1–CU12)

| Ciclo | ID | Caso de uso | Prioridad | Riesgo | Actores |
|---|---|---|---|---|---|
| 1 | CU1 | Crear nuevo lienzo | Crítica | Alto | A1 |
| 1 | CU2 | Ingresar a un lienzo existente | Crítica | Alto | A1, A2 |
| 1 | CU3 | Gestionar clases en el lienzo | Crítica | Alto | A1, A2 |
| 2 | CU4 | Crear y eliminar relaciones | Crítica | Alto | A1, A2 |
| 2 | CU5 | Gestionar labels y multiplicidades | Normal | Medio | A1, A2 |
| 2 | CU6 | Colaborar en tiempo real | Normal | Alto | A1, A2 |
| 3 | CU10 | Generar diagrama desde imagen (Gemini Vision) | Crítica | Alto | A1, A2 |
| 3 | CU8 | Gestionar diagrama por prompts (voz y texto) | Normal | Medio | A1, A2 |
| 3 | CU11 | Generar frontend Flutter | Crítica | Alto | A1, A2 |
| 4 | CU7 | Generar backend Spring Boot | Normal | Alto | A1, A2 |
| 4 | CU9 | Generar casos de prueba Postman | Crítica | Medio | A1, A2 |
| 4 | CU12 | Interoperar con Enterprise Architect (XMI 2.1) | Crítica | Alto | A1, A2 |

### Cómo funciona cada uno (lo que importa al integrar)

| CU | Comportamiento clave |
|---|---|
| CU1 | Botón "Crear nuevo lienzo" → el sistema genera UUID v4 → inicializa la sala en PostgreSQL → redirige al lienzo vacío. Excepción: error de conexión → reintentar. |
| CU2 | Se ingresa el UUID → se valida en BD → conexión WebSocket → se recupera el estado canónico (`BackupUML`) → se notifica `presence join`. Excepción: "No existe un diagrama con ese ID". |
| CU3 | Crear (botón o arrastre), editar (modal: nombre, atributos, métodos), eliminar (Supr; borra relaciones conectadas). Todo se persiste y difunde. Excepción: nombre vacío o con caracteres no permitidos. |
| CU4 | Se elige el tipo en la barra UML, clic en origen y destino, el sistema valida y dibuja el conector. Excepción: autoconexión no permitida. |
| CU5 | Doble clic en extremo para cardinalidad (1, 0..1, 1..*, *); label centrado en la arista. **Bloquea multiplicidades en herencia y dependencia.** |
| CU6 | Mutación → `debounceTime(500ms)` → mensaje JSON `broadcast` por WebSocket → Daphne → Redis → difusión a la sala **excluyendo al emisor** → persistencia asíncrona. Objetivo: latencia < 100 ms. Reconexión automática con respaldo en `localStorage`. |
| CU8 | Panel "Generar modelo": voz (Web Speech API) o texto → `POST /api/chatbot/` con `{prompt, currentDiagram}` → `call_gemini` devuelve mutación JSON → aplicación incremental. |
| CU10 | "Importar Imagen" → `uml-image.service.ts` → `POST /api/uml_from_image/` (multipart) → Base64 → `call_gemini_from_image` → JSON de clases/atributos/relaciones → `DiagramService` dibuja en JointJS. |
| CU7 | "Exportar a Backend" → `backend-generator.service.ts` serializa a `UmlSchema` → `POST http://127.0.0.1:7000/generate` → `GenerateController` → `ProjectGenerator` (Mustache) → `generated-app.zip`. Excepción: esquema sin clases → 400. |
| CU9 | `PostmanCollectionGenerator.java` genera GET (todos / por id), POST (payload de ejemplo), PUT, DELETE por entidad, en formato Postman v2.1. Tipos incompatibles → valores por defecto seguros. |
| CU11 | "Exportar Flutter" → `frontend-generator.service.ts` → `POST /api/generar_flutter/` → `FlutterCRUDGenerator` → `flutter_project.zip`. Excepción: diagrama sin clases. |
| CU12 | **Exportar:** recorre JointJS, genera `<uml:Model>` con `packagedElement xmi:type="uml:Class"`. **Importar:** `xmi-import.service.ts` con `DOMParser`, calcula coordenadas, renderiza y sincroniza. Excepción: XMI corrupto o versión no soportada. |

### Relaciones entre CU del primer parcial
- CU3 «include» CU1; CU3 «extend» CU2.
- CU4 «include» CU3; CU5 «include» CU4.
- CU6 «include» CU3 y CU4.
- CU7, CU11 «include» CU3; CU9 «include» CU7.
- CU8, CU10 relacionados con CU1 y CU2 (precondición: lienzo activo).

## 7. Análisis: paquetes

| Paquete | Casos de uso |
|---|---|
| Gestión de Lienzo | CU1, CU2, CU3, CU4, CU5 |
| Colaboración y Asistencia | CU6 |
| Entrada Multimodal | CU8, CU10 |
| Exportación e Integración | CU7, CU9, CU11, CU12 |

Dependencias: los otros tres paquetes dependen de **Gestión de Lienzo**.

## 8. Diseño

### Despliegue físico
Servidor Azure/Cloud con Django/Daphne, Angular SPA, PostgreSQL 17 y Spring Boot 3; Cloudflare como proxy (HTTP/HTTPS/WSS); clientes web (móvil, desktop, laptop) por HTTPS; nodo externo Gemini API; archivos `.xmi` hacia/desde Enterprise Architect.

### Diseño lógico en capas
- **Específica:** los 4 paquetes funcionales.
- **General:** View, Controller, Service, Repository, API, WebSocket.
- **Interna:** Angular 20, Django, Spring Boot 3, PostgreSQL 17, Servicio IA.
- **Software:** Azure/Docker, Cloudflare.

### Metamodelo (diagrama de clases de diseño)
- `DiagramModel` (diagramId UUID, name, classes, relationships; `toJSON()`, `fromJSON()`)
- `ClassModel` (id, name, x, y, attributes, methods)
- `AttributeModel` (name, type, visibility, isPrimaryKey)
- `MethodModel` (name, returnType, visibility, parameters)
- `RelationshipModel` (id, sourceClassId, targetClassId, type, sourceMultiplicity, targetMultiplicity, label; `validateCardinality()`)
- `RelationshipType` enum: ASSOCIATION, GENERALIZATION, AGGREGATION, COMPOSITION, DEPENDENCY
- `ProjectGenerator` (Spring Boot 3): `generate(schema, pkg)`, `synthesizeEntities()`, `synthesizeRepositoriesAndServices()`

### Datos
Una sola tabla: `uml_api_backupuml` (`id` bigint PK identity, `room_id` uuid UNIQUE, `data` jsonb, `created_at` timestamptz). El grafo completo del diagrama vive en `data` (decisión de diseño: JSONB como estado canónico).

## 9. Implementación
- **Frontend Angular:** servicios `uml-image`, `frontend-generator`, `backend-generator`, `xmi-import`, `DiagramService` (JointJS), `CollaborationService`, `DiagramExportService`.
- **Django:** `Asgi`, `Consumers` (`CanvasConsumer`), `Routing`, `View`, `Urls`, `Models`.
- **Spring Boot:** `Controller`, `Configuration`, `Services`, `Entity`, `Template` (Mustache).
- Subsistemas: Gestionar Diagrama de Clases, Gestionar Colaborativo, Generación UML con IA, Gestionar exportación Backend y Frontend.

## 10. Pruebas e interfaz
Interfaz de inicio ("Diseña, Colabora y Genera Código Full-Stack en Segundos"), panel lateral (entidades, 5 relaciones, copiloto IA por voz/texto), panel de exportación (XMI, Spring Boot ZIP, Flutter ZIP, Script SQL, PNG), importación (XMI, foto con IA Vision) y botón "Auditar Modelo". Salas guardadas en la pantalla de inicio.

## 11. Notas para el agente (inconsistencias del documento original)
- Algunos diagramas de subsistemas dicen "P2P / Signal"; la implementación real es **WebSocket con Daphne/Channels + Redis**. Tratar como WebSocket.
- La tabla aparece como `Backup_uml` en el diagrama lógico y `uml_api_backupuml` en el script. **Usar `uml_api_backupuml`.**
- El lienzo se describe como "SVG" en objetivos y como **JointJS** en los casos de uso. **Usar JointJS.**
- Los endpoints reales: `/api/chatbot/`, `/api/uml_from_image/`, `/api/generar_flutter/`, `/api/set_backup_uml/{uuid}/` y `http://127.0.0.1:7000/generate`.

## 12. Qué hereda el segundo parcial
Todo lo anterior. CU8 evoluciona hacia el chat moderado (CU16); CU10 anuncia su resultado en el chat; el paquete "Entrada Multimodal" pasa a llamarse **IA Moderadora**.
