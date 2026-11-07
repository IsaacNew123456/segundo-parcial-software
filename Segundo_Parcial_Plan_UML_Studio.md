# UML Studio CASE — Segundo Parcial: IA moderadora, chat grupal y app móvil espectadora

**Materia:** Ingeniería de Software 1 (INF-422) SC · **Docente:** Ing. Rolando Antonio Martínez Canedo
**Estudiante:** Camacho Jimenez Jairo Lisandro · **Gestión:** Semestre 2 – 2026
**Base:** Sistema CASE colaborativo del Primer Parcial (CU1–CU12), evolucionado según los requisitos del docente.

---

## 1. Resumen de la evolución

El primer parcial entregó un CASE colaborativo para diagramas de clases UML 2.5 con generación de código. En este parcial la **IA pasa a tener mayor protagonismo**: deja de ser un panel de comandos aislado y se convierte en un **chatbot moderador dentro de un chat grupal por proyecto**. Además se añade un **historial de sesiones** consultable y una **APK móvil de solo lectura (espectador)**.

| Aspecto | Primer parcial | Segundo parcial |
|---|---|---|
| Rol de la IA | Copiloto: voz/texto en panel lateral (CU8) y visión (CU10) | **Moderador del chat grupal** del proyecto |
| Colaboración | Sala por UUID, sin chat | Chat grupal por proyecto con IA integrada |
| Calidad del modelo | Validación básica de relaciones | **Auditoría de relaciones y normalización 1FN–4FN** |
| Trazabilidad | Solo estado actual del lienzo (`BackupUML`) | **Historial de sesiones por grupo**, revisable |
| Móvil | Proyecto Flutter *generado* (CRUD) | **APK Flutter espectadora**: seguimiento, sin edición |
| Identidad | Salas anónimas por UUID | **Usuarios con login**, mismo usuario en web y móvil |

> **Regla del parcial:** todo lo del primer parcial se conserva (CU1–CU12, generación Spring Boot / Postman / Flutter, XMI 2.1, Gemini Vision, colaboración en tiempo real).

---

## 2. Alcance

### Incluye
- Todo el alcance del Primer Parcial.
- **Chat grupal por proyecto** con IA moderadora.
- Comandos en lenguaje natural dirigidos a la IA: modificar clase, añadir clase, crear relaciones, **sugerir** relaciones, **revisar** relaciones.
- **Verificación de normalización 1FN, 2FN, 3FN y 4FN** sobre el modelo.
- **Historial de sesiones por grupo** (guardado y consulta).
- **Resumen del lienzo bajo demanda** ("¿qué han avanzado?").
- **APK móvil espectadora** con autenticación (mismo usuario/contraseña que la web).

### No incluye
- Edición del diagrama desde el móvil (es solo informativo).
- Generación de código desde el móvil.
- Diagramas distintos al de clases (se mantiene la exclusión del Primer Parcial).

---

## 3. Actores

| ID | Actor | Descripción |
|---|---|---|
| A1 | Diseñador | Crea proyectos y lienzos, invita miembros, modela, exporta (heredado del Parcial 1) |
| A2 | Colaborador | Edita el diagrama y usa el chat con la IA (heredado) |
| A3 | Espectador móvil | Consulta el avance desde la APK; **no edita el diagrama** |
| A4 | IA Moderadora | Actor de sistema: interpreta mensajes, muta el diagrama, audita y resume |

---

## 4. Casos de uso

### 4.1 Heredados del Primer Parcial

| ID | Caso de uso | Estado en este parcial |
|---|---|---|
| CU1 | Crear nuevo lienzo | Se mantiene; ahora se asocia a un proyecto |
| CU2 | Ingresar a un lienzo existente | Se mantiene; requiere ser miembro del proyecto |
| CU3 | Gestionar clases en el lienzo | Se mantiene |
| CU4 | Crear y eliminar relaciones | Se mantiene |
| CU5 | Gestionar labels y multiplicidades | Se mantiene |
| CU6 | Colaborar en tiempo real | Se mantiene |
| CU7 | Generar backend Spring Boot | Se mantiene |
| CU8 | Gestionar diagrama mediante prompts (voz y texto) | **Evoluciona:** pasa a operar dentro del chat grupal (CU16) |
| CU9 | Generar colección Postman | Se mantiene |
| CU10 | Generar diagrama desde imagen (Gemini Vision) | Se mantiene; el resultado se anuncia en el chat |
| CU11 | Generar frontend Flutter | Se mantiene |
| CU12 | Interoperar con Enterprise Architect (XMI 2.1) | Se mantiene |

### 4.2 Nuevos

| ID | Caso de uso | Prio | Pts | Actores | Resumen |
|---|---|---|---|---|---|
| CU13 | Autenticación y perfil (web y móvil) | Alta | 5 | A1, A2, A3 | Registro, login/logout con JWT; **mismo usuario y contraseña en web y APK** |
| CU14 | Gestionar proyectos y miembros | Alta | 8 | A1 | Crear proyecto/grupo, invitar miembros, asignar rol (diseñador, colaborador, espectador) |
| CU15 | Chat grupal del proyecto | Alta | 8 | A1, A2, A3 | Mensajería en tiempo real por proyecto; la IA participa como moderadora |
| CU16 | Modificar el diagrama mediante la IA moderadora | Alta | 8 | A1, A2, A4 | Pedir por chat: **modificar clase, añadir clase, relacionar clases** (extiende CU8) |
| CU17 | Sugerir y revisar relaciones con IA | Alta | 5 | A1, A2, A4 | La IA propone relaciones/multiplicidades y revisa las existentes |
| CU18 | Auditar normalización (1FN–4FN) | Alta | 8 | A1, A2, A4 | La IA evalúa si el modelo cumple cada forma normal y reporta violaciones con sugerencias |
| CU19 | Consultar historial de sesiones | Alta | 8 | A1, A2, A3 | Listar y revisar sesiones pasadas del grupo (chat, acciones y cambios del lienzo) |
| CU20 | Resumir el estado del lienzo por chat | Alta | 5 | A1, A2, A3, A4 | Preguntar "¿qué hay / qué han avanzado?" y recibir un resumen generado por la IA |
| CU21 | Visualizar proyecto desde la APK (espectador) | Alta | 8 | A3 | Ver lienzo en modo lectura, avance y chat de consulta desde el móvil |

**Total nuevo:** 63 puntos.

### 4.3 Detalle de los casos de uso nuevos

#### CU15 — Chat grupal del proyecto
- **Precondición:** usuario autenticado y miembro del proyecto.
- **Flujo principal:**
  1. El usuario abre el panel de chat del proyecto.
  2. Escribe un mensaje; el sistema lo difunde por WebSocket a los miembros conectados.
  3. La IA moderadora evalúa si el mensaje es una **instrucción dirigida a ella** (mención `@ia` o intención detectada) o conversación entre humanos.
  4. Si es instrucción, ejecuta el caso de uso correspondiente (CU16–CU18, CU20) y responde en el mismo chat.
  5. Todo mensaje (humano e IA) se registra en la sesión activa (CU19).
- **Excepción:** pérdida de conexión → se reintenta y se sincronizan los mensajes pendientes.

#### CU16 — Modificar el diagrama mediante la IA
- **Ejemplos de mensajes:** *"@ia agrega la clase Factura con id, fecha y total"*, *"@ia añade el atributo email a Estudiante"*, *"@ia relaciona Docente con Materia, uno a muchos"*.
- **Flujo principal:** el chat envía `prompt + currentDiagram` → Gemini devuelve una **mutación incremental en JSON** → el frontend la aplica sin borrar el trabajo previo → se propaga por WebSocket y se anuncia en el chat quién lo pidió y qué cambió.
- **Excepción:** orden ambigua → la IA pide aclaración en el chat; orden inválida (p. ej. multiplicidad en herencia) → la IA la rechaza explicando el motivo.
- **Permisos:** solo A1 y A2 pueden disparar mutaciones.

#### CU17 — Sugerir y revisar relaciones
- **Sugerir:** la IA analiza clases y atributos y propone relaciones (tipo, multiplicidad, rol) sin aplicarlas; el usuario acepta con una confirmación en el chat.
- **Revisar:** la IA detecta relaciones circulares de dependencia, clases huérfanas, multiplicidades incoherentes y tipos incompatibles, y lo reporta.
- **Postcondición:** ningún cambio al lienzo sin confirmación explícita de un A1/A2.

#### CU18 — Auditar normalización (1FN–4FN)
- **Alcance:** el modelo de clases se interpreta como esquema relacional lógico (cada clase → tabla; atributos → columnas; relaciones → claves foráneas).
- **Verificaciones:**

| Forma | Qué comprueba la IA |
|---|---|
| 1FN | Atributos atómicos; sin grupos repetitivos ni atributos multivaluados |
| 2FN | Sin dependencias parciales respecto a una clave compuesta |
| 3FN | Sin dependencias transitivas entre atributos no clave |
| 4FN | Sin dependencias multivaluadas no triviales |

- **Salida:** reporte por clase con estado (cumple / no cumple), la violación detectada y una **sugerencia de corrección** (p. ej. extraer una nueva clase). La IA **no aplica** la corrección sin confirmación.
- **Nota técnica:** las dependencias funcionales se infieren de nombres y tipos; el reporte debe indicar que es una **evaluación asistida**, validable por el equipo.

#### CU19 — Historial de sesiones
- **Definición de sesión:** período continuo de actividad de un proyecto; se abre al conectarse el primer miembro y se cierra tras inactividad configurable o al desconectarse el último.
- **Se guarda por sesión:** mensajes del chat, comandos a la IA y su resultado, eventos del lienzo (alta/baja/edición de clases y relaciones), participantes y marcas de tiempo, y un **snapshot** del diagrama al cierre.
- **Consulta:** lista de sesiones por proyecto (fecha, duración, participantes, resumen) → detalle con línea de tiempo y vista del diagrama en ese momento.
- **Regla:** el historial es **solo lectura**; no se edita ni se borra desde la interfaz.

#### CU20 — Resumir el estado del lienzo
- **Ejemplos:** *"@ia ¿qué hay en el lienzo?"*, *"@ia ¿qué avanzamos hoy?"*.
- **Flujo:** la IA recibe el diagrama actual y los eventos recientes de la sesión → responde con clases, relaciones, cambios recientes y pendientes detectados.
- **Disponible para todos los roles**, incluido el espectador móvil (es una consulta, no una mutación).

#### CU21 — Visualizar proyecto desde la APK (espectador)
- **Precondición:** usuario autenticado con el mismo usuario/contraseña de la web y rol espectador (o miembro) del proyecto.
- **Funciones:** lista de proyectos, **lienzo en modo lectura** (zoom y desplazamiento, sin arrastrar ni editar), actualización en tiempo real del avance, acceso al **chat** para consultas a la IA (resumen) y acceso al **historial** (CU19).
- **Restricciones:**
  - El backend rechaza (403) cualquier operación de escritura sobre el diagrama originada en un cliente móvil.
  - Si un espectador pide a la IA una modificación, la IA responde que su rol es de solo lectura.

---

## 5. Requisitos

### Funcionales (nuevos)
- **RF16** Autenticación con JWT compartida por web y móvil.
- **RF17** Gestión de proyectos, miembros y roles.
- **RF18** Chat grupal por proyecto en tiempo real.
- **RF19** La IA modera el chat y distingue conversación de instrucciones.
- **RF20** Modificar, añadir y relacionar clases por chat.
- **RF21** Sugerir y revisar relaciones por chat.
- **RF22** Auditoría de normalización 1FN–4FN con reporte.
- **RF23** Historial de sesiones persistente y consultable por grupo.
- **RF24** Resumen del estado del lienzo bajo demanda.
- **RF25** APK espectadora de solo lectura con chat de consulta.

### No funcionales
- **RNF1** Permisos de escritura validados **en el servidor**, nunca solo en el cliente.
- **RNF2** Latencia de difusión del chat y del lienzo < 100 ms (se mantiene del Parcial 1).
- **RNF3** La IA devuelve mutaciones en JSON validado contra el esquema `UmlSchema` antes de aplicarse.
- **RNF4** Llaves de Gemini y credenciales solo en variables de entorno.
- **RNF5** Rate limiting de llamadas a la IA por proyecto para controlar costo.
- **RNF6** Aislamiento por proyecto: un usuario solo ve proyectos de los que es miembro.

---

## 6. Modelo de datos (adiciones)

Se conserva `uml_api_backupuml` (estado actual del lienzo). Se agregan:

| Tabla | Campos principales |
|---|---|
| `users` | id, email (único), password_hash, nombre, created_at |
| `projects` | id, nombre, room_id (UUID → lienzo), owner_id, created_at |
| `project_members` | project_id, user_id, rol (`designer` / `collaborator` / `viewer`) |
| `sessions` | id, project_id, started_at, ended_at, snapshot (jsonb), summary |
| `chat_messages` | id, session_id, author_type (`user` / `ai`), author_id, content, intent, created_at |
| `session_events` | id, session_id, tipo (`class_add`, `class_update`, `link_add`, …), payload (jsonb), actor_id, created_at |

> Decisión de diseño: el diagrama sigue almacenándose como **JSONB** (grafo canónico); las tablas nuevas cubren identidad, membresía y trazabilidad.

---

## 7. Arquitectura

- **Frontend web:** Angular 20 + JointJS (lienzo) + panel de chat.
- **Backend colaboración / IA:** Django REST + Channels (Daphne) + Redis. Nuevo consumidor `ProjectChatConsumer` y servicio `moderator_service` (orquesta Gemini).
- **Generador:** microservicio Spring Boot 3 / Java 21 (sin cambios).
- **Base de datos:** PostgreSQL 17.
- **Móvil:** Flutter (APK) consumiendo REST + WebSocket en **modo lectura**.
- **IA:** Google Gemini (texto, voz vía Web Speech API en web, y visión).

**Flujo del moderador:** mensaje → clasificador de intención (`modificar`, `añadir`, `relacionar`, `sugerir`, `revisar`, `normalizar`, `resumir`, `charla`) → validación de rol → acción → respuesta en el chat → registro en la sesión.

### Paquetes (actualizados)

| Paquete | Contenido |
|---|---|
| Gestión de Lienzo | CU1–CU5 |
| Colaboración y Asistencia | CU6, CU13–CU15, CU19 |
| IA Moderadora *(antes "Entrada Multimodal")* | CU8→CU16, CU10, CU17, CU18, CU20 |
| Exportación e Integración | CU7, CU9, CU11, CU12 |
| Cliente Móvil | CU21 |

---

## 8. Plan de sprints

### Sprint 1 — Identidad, proyectos y chat base
**Puntos:** 21 · **Casos de uso:** CU13, CU14, CU15 (sin IA)

**Objetivo:** usuarios con login (web), proyectos con miembros y roles, y chat grupal en tiempo real.

- [x] **S1-1** Módulo de autenticación JWT (registro, login, logout, refresh)
- [x] **S1-2** Modelos `users`, `projects`, `project_members` + migraciones
- [x] **S1-3** Endpoints de proyectos e invitaciones; permisos por rol
- [x] **S1-4** Vincular lienzo (`room_id`) a proyecto; CU1/CU2 respetan membresía
- [x] **S1-5** `ProjectChatConsumer` y persistencia de `chat_messages`
- [x] **S1-6** Frontend: login, lista de proyectos, panel de chat grupal

**DoD**
- [x] Un usuario se registra, inicia sesión y crea un proyecto.
- [x] Un usuario no miembro recibe 403 al acceder a un proyecto ajeno.
- [x] Dos usuarios intercambian mensajes en tiempo real en el mismo proyecto.

### Sprint 2 — IA moderadora: modificar, añadir y relacionar
**Puntos:** 21 · **Casos de uso:** CU16, CU17

**Objetivo:** la IA entiende órdenes del chat y modifica el lienzo de forma incremental; sugiere y revisa relaciones.

- [x] **S2-1** Servicio `moderator_service` y clasificador de intención
- [x] **S2-2** Prompt con contexto del diagrama + esquema JSON de mutación
- [x] **S2-3** Validación de mutaciones contra `UmlSchema` y reglas UML (herencia/dependencia sin multiplicidad)
- [x] **S2-4** Aplicación incremental en el lienzo + difusión por WebSocket
- [x] **S2-5** Flujo "sugerir → confirmar → aplicar" en el chat
- [x] **S2-6** Revisión de relaciones (circulares, huérfanas, multiplicidades incoherentes)
- [x] **S2-7** Rechazo de mutaciones para rol `viewer`

**DoD**
- [x] *"@ia agrega la clase Factura con id, fecha y total"* crea la clase sin borrar el resto.
- [x] *"@ia relaciona X con Y"* crea la relación y la anuncia en el chat.
- [x] Una sugerencia no modifica el lienzo hasta confirmarla.
- [x] Orden ambigua → la IA pide aclaración; no inventa cambios.

### Sprint 3 — Normalización, resumen e historial de sesiones
**Puntos:** 21 · **Casos de uso:** CU18, CU19, CU20

**Objetivo:** calidad del modelo verificable, trazabilidad completa y resumen bajo demanda.

- [x] **S3-1** Convertidor modelo UML → esquema relacional lógico
- [x] **S3-2** Prompt/reglas de auditoría 1FN, 2FN, 3FN y 4FN con reporte por clase
- [x] **S3-3** Gestión de sesiones (apertura, cierre por inactividad, snapshot)
- [x] **S3-4** Registro de `session_events` y vínculo con `chat_messages`
- [x] **S3-5** API e interfaz de historial: lista de sesiones → detalle con línea de tiempo
- [x] **S3-6** Intención `resumir`: resumen del lienzo y de los cambios recientes
- [x] **S3-7** Vista del diagrama en el momento de una sesión (snapshot)

**DoD**
- [x] La IA reporta cumple/no cumple para 1FN–4FN con la violación y su sugerencia.
- [x] Toda sesión queda guardada y es consultable después de cerrarla.
- [x] El historial es de solo lectura.
- [x] *"@ia ¿qué avanzamos hoy?"* devuelve un resumen coherente con el lienzo real.

### Sprint 4 — APK espectadora y cierre
**Puntos:** 13 · **Casos de uso:** CU21 + regresión de CU1–CU12

**Objetivo:** seguimiento móvil de solo lectura y entrega integrada.

- [x] **S4-1** App Flutter: login con las mismas credenciales de la web
- [x] **S4-2** Lista de proyectos y vista de lienzo en solo lectura (zoom/pan)
- [x] **S4-3** Actualización en tiempo real del lienzo por WebSocket
- [x] **S4-4** Chat de consulta en móvil (resumen por IA) e historial
- [x] **S4-5** Enforcement en servidor: 403 a toda escritura desde cliente móvil
- [x] **S4-6** Compilación y firma de la APK; instalación en dispositivo real
- [x] **S4-7** Pruebas de regresión del Primer Parcial (exportaciones, XMI, Gemini Vision)
- [x] **S4-8** Despliegue final y actualización del manual interactivo

**DoD**
- [x] El mismo usuario inicia sesión en web y móvil.
- [x] En la APK no existe ninguna acción de edición del diagrama.
- [x] Un intento de escritura desde móvil devuelve 403.
- [x] Los cambios hechos en la web aparecen en el móvil sin recargar.
- [x] CU1–CU12 siguen funcionando.

---

## 9. Trazabilidad con lo pedido por el docente

| Requisito del docente | Caso(s) de uso | Sprint |
|---|---|---|
| Todo lo del primer parcial | CU1–CU12 | S4 (regresión) |
| Mayor protagonismo de la IA | CU15–CU18, CU20 | S2–S3 |
| IA como chatbot moderador | CU15, CU16 | S1–S2 |
| Chat grupal por proyecto | CU14, CU15 | S1 |
| Pedir modificar clase / añadir clase / relacionar | CU16 | S2 |
| Sugerencias para las relaciones | CU17 | S2 |
| Revisar relaciones | CU17 | S2 |
| Verificar normalización 4N | CU18 | S3 |
| Historial de sesiones por grupo, revisable | CU19 | S3 |
| Móvil = APK espectadora, no edita | CU21 | S4 |
| Pedir a la IA un resumen del lienzo | CU20 | S3 |
| Mismo usuario y contraseña en móvil y web | CU13 | S1 / S4 |

---

## 10. Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R1 | La IA interpreta mal una orden y daña el diagrama | Validación contra `UmlSchema`, confirmación en sugerencias, historial como respaldo |
| R2 | Inferencia imprecisa de dependencias funcionales en 2FN–4FN | Reporte etiquetado como evaluación asistida; reglas explícitas en el prompt |
| R3 | Costo/latencia de Gemini | Rate limiting por proyecto, prompts con contexto acotado |
| R4 | Crecimiento del historial | Eventos compactos, snapshot por sesión, paginación |
| R5 | Escritura indebida desde móvil | Autorización en el servidor, pruebas e2e de rol `viewer` |
| R6 | Carga académica del semestre | Priorizar CU15–CU18 y CU21; CU19–CU20 como segundo nivel si hay recorte |

---

## 11. Supuestos a confirmar con el docente

1. **"4N"** se interpreta como **1FN, 2FN, 3FN y 4FN**. Si se refiere a incluir la forma normal de Boyce-Codd (FNBC), se agrega como verificación adicional.
2. El **espectador móvil puede escribir en el chat solo para consultas** (resumen, historial); no puede ordenar modificaciones. Si el docente quiere el chat también en solo lectura, se elimina esa función de CU21.
3. Un **proyecto equivale a un grupo y a un lienzo** (relación 1:1 con `room_id`).
4. Una **sesión** se delimita por actividad continua del proyecto (cierre por inactividad configurable).
5. La **APK se entrega para Android** únicamente.

---

## 12. Definición de terminado global
- [x] Todo el contenido del Primer Parcial sigue operativo.
- [x] La IA modera el chat y ejecuta modificar/añadir/relacionar/sugerir/revisar.
- [x] La auditoría 1FN–4FN entrega un reporte por clase.
- [x] El historial de sesiones es revisable por grupo.
- [x] La APK permite seguir el avance y consultar a la IA, sin editar.
- [x] Endpoints documentados (Swagger/OpenAPI); lint y pruebas en verde; sistema desplegado.

