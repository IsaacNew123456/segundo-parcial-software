# Casos de uso — Continuación (Segundo Parcial)

Continúa la numeración del primer parcial (CU1–CU12). Mismo formato: propósito, actores, iniciador, precondición, flujo principal, postcondición y excepción.

## Priorización

| Ciclo | ID | Caso de uso | Estado | Prioridad | Riesgo | Actores | Sprint |
|---|---|---|---|---|---|---|---|
| 5 | CU13 | Autenticación y perfil (web y móvil) | Propuesto | Crítica | Medio | A1, A2, A3 | 1 |
| 5 | CU14 | Gestionar proyectos y miembros | Propuesto | Crítica | Alto | A1 | 1 |
| 5 | CU15 | Chat grupal del proyecto | Propuesto | Crítica | Alto | A1, A2, A3 | 1 |
| 6 | CU16 | Modificar el diagrama mediante la IA moderadora | Propuesto | Crítica | Alto | A1, A2, A4 | 2 |
| 6 | CU17 | Sugerir y revisar relaciones con IA | Propuesto | Crítica | Medio | A1, A2, A4 | 2 |
| 7 | CU18 | Auditar normalización (1FN–4FN) | Propuesto | Crítica | Alto | A1, A2, A3, A4 | 3 |
| 7 | CU19 | Consultar historial de sesiones | Propuesto | Crítica | Medio | A1, A2, A3 | 3 |
| 7 | CU20 | Resumir el estado del lienzo por chat | Propuesto | Normal | Medio | A1, A2, A3, A4 | 3 |
| 8 | CU21 | Visualizar proyecto desde la APK (espectador) | Propuesto | Crítica | Alto | A3 | 4 |

## Relaciones entre casos de uso

| Origen | Relación | Destino | Justificación |
|---|---|---|---|
| CU14 | «include» | CU13 | Crear/gestionar proyectos exige sesión iniciada |
| CU15 | «include» | CU13, CU14 | El chat requiere usuario autenticado y membresía |
| CU16 | «include» | CU15 | Las órdenes a la IA se emiten desde el chat |
| CU16 | «include» | CU3, CU4 | La mutación crea/edita clases y relaciones |
| CU16 | «extend» | CU8 | Evoluciona el comando por prompt hacia el chat moderado |
| CU17 | «include» | CU15 | Se solicita desde el chat |
| CU18 | «include» | CU15 | Se solicita desde el chat |
| CU20 | «include» | CU15 | Se solicita desde el chat |
| CU19 | «include» | CU15 | Registra los mensajes del chat de cada sesión |
| CU21 | «include» | CU13 | La APK exige login |
| CU21 | «include» | CU20, CU19 | Resumen e historial accesibles desde móvil |
| CU10 | «extend» | CU15 | Opcional: el resultado de la foto se anuncia en el chat |

> `extend` se usa solo donde la funcionalidad es **opcional**; las dependencias obligatorias son `include`.

---

## CU13: Autenticación y perfil (web y móvil)

| Campo | Contenido |
|---|---|
| Propósito | Identificar al usuario con credenciales únicas, válidas **en web y en la APK**. |
| Actores | A1, A2, A3 |
| Iniciador | Usuario |
| Precondición | Conexión activa. Para login: cuenta registrada. |
| Flujo principal | 1. El usuario abre la web o la APK. 2. Elige registrarse o iniciar sesión. 3. Ingresa correo y contraseña. 4. El sistema valida formato y política de contraseña. 5. El sistema emite un JWT (acceso y refresh). 6. El cliente guarda el token y redirige a la lista de proyectos. 7. Opcional: el usuario edita nombre y contraseña desde su perfil. |
| Postcondición | Sesión autenticada; la misma cuenta funciona en web y móvil. |
| Excepción | Credenciales inválidas, correo duplicado o contraseña débil: se muestra el error; no se inicia sesión. Token expirado: se renueva con el refresh o se pide login. |

## CU14: Gestionar proyectos y miembros

| Campo | Contenido |
|---|---|
| Propósito | Crear proyectos (grupos), invitar miembros y asignar roles. |
| Actores | A1 (Diseñador) |
| Iniciador | Diseñador |
| Precondición | Usuario autenticado (CU13). |
| Flujo principal | A. Crear proyecto: 1. Presiona "Nuevo proyecto" y escribe el nombre. 2. El sistema crea el proyecto y su lienzo (genera `room_id`, ver CU1). 3. El creador queda como diseñador. B. Invitar: 1. Ingresa el correo del invitado y elige el rol (`designer`, `collaborator`, `viewer`). 2. El sistema registra la membresía. C. Cambiar o quitar rol: el diseñador edita la membresía; el cambio rige de inmediato. |
| Postcondición | El proyecto existe con miembros y roles; solo los miembros lo ven. |
| Excepción | Correo no registrado: se informa. Intento de un no-diseñador de invitar o cambiar roles: 403. |

## CU15: Chat grupal del proyecto

| Campo | Contenido |
|---|---|
| Propósito | Comunicación en tiempo real del grupo, con la IA como moderadora. |
| Actores | A1, A2, A3 (A4 participa) |
| Iniciador | Usuario |
| Precondición | Usuario autenticado y miembro del proyecto. |
| Flujo principal | 1. El usuario abre el chat del proyecto. 2. Escribe un mensaje. 3. El sistema lo difunde por WebSocket a los miembros conectados y lo guarda en la sesión activa. 4. La IA evalúa si es una instrucción para ella (mención `@ia` o intención detectada) o conversación entre humanos. 5. Si es instrucción, ejecuta el caso de uso correspondiente (CU16, CU17, CU18, CU20) y responde en el chat. 6. Todo mensaje (humano e IA) queda registrado (CU19). |
| Postcondición | Mensajes sincronizados y persistidos en la sesión. |
| Excepción | Pérdida de conexión: reintento automático y sincronización de mensajes pendientes. Usuario sin membresía: 403. |

## CU16: Modificar el diagrama mediante la IA moderadora

| Campo | Contenido |
|---|---|
| Propósito | Modificar clases, añadir clases y relacionar clases pidiéndoselo a la IA en el chat. |
| Actores | A1, A2, A4 |
| Iniciador | Diseñador o Colaborador |
| Precondición | Miembro con rol `designer` o `collaborator` en el chat de un proyecto con lienzo activo. |
| Flujo principal | 1. El usuario escribe, p. ej., *"@ia agrega la clase Factura con id, fecha y total"*, *"@ia añade el atributo email a Estudiante"* o *"@ia relaciona Docente con Materia, uno a muchos"*. 2. El sistema verifica el rol del emisor. 3. El backend envía a Gemini `prompt + currentDiagram`. 4. Gemini devuelve una **mutación incremental en JSON**. 5. El sistema valida la mutación contra `UmlSchema` y las reglas UML. 6. Se aplica al lienzo sin borrar el trabajo previo y se difunde por WebSocket (CU6). 7. La IA anuncia en el chat quién lo pidió y qué cambió. 8. Se registra en el historial (CU19). |
| Postcondición | El diagrama refleja el cambio en todos los clientes y queda persistido. |
| Excepción | Orden ambigua: la IA pide aclaración y no cambia nada. Orden inválida (p. ej. multiplicidad en herencia, autoconexión no permitida): la IA la rechaza y explica el motivo. Emisor con rol `viewer`: la IA responde que su rol es de solo lectura. |

## CU17: Sugerir y revisar relaciones con IA

| Campo | Contenido |
|---|---|
| Propósito | Obtener sugerencias de relaciones y una revisión de las existentes. |
| Actores | A1, A2, A4 |
| Iniciador | Diseñador o Colaborador |
| Precondición | Lienzo con al menos dos clases. |
| Flujo principal | A. Sugerir: 1. *"@ia sugiere relaciones entre las clases"*. 2. La IA analiza clases y atributos y propone relaciones (tipo, multiplicidad, rol) **sin aplicarlas**. 3. El usuario responde, p. ej., *"@ia aplica la 2"*; el sistema valida y aplica (flujo de CU16). B. Revisar: 1. *"@ia revisa las relaciones"*. 2. La IA detecta dependencias circulares, clases huérfanas, multiplicidades incoherentes, tipos incompatibles y herencias mal formadas. 3. Responde con hallazgos y correcciones propuestas. |
| Postcondición | El grupo conoce sugerencias y problemas; el lienzo solo cambia con confirmación explícita. |
| Excepción | Modelo sin clases suficientes: la IA indica que no hay material que analizar. |

## CU18: Auditar normalización (1FN–4FN)

| Campo | Contenido |
|---|---|
| Propósito | Verificar si el modelo cumple las formas normales 1FN, 2FN, 3FN y 4FN. |
| Actores | A1, A2, A3 (consulta), A4 |
| Iniciador | Usuario |
| Precondición | Lienzo con al menos una clase con atributos. |
| Flujo principal | 1. *"@ia verifica la normalización"* (opcional: indicar una forma o una clase). 2. El sistema convierte el modelo de clases a un esquema relacional lógico (clase → tabla, atributo → columna, relación → clave foránea). 3. La IA evalúa cada forma por clase (tabla siguiente). 4. Devuelve un reporte por clase: cumple / no cumple, violación detectada y sugerencia de corrección. 5. Las correcciones **no se aplican** sin confirmación (se aplican por CU16). |
| Postcondición | El grupo obtiene un diagnóstico de normalización registrado en la sesión. |
| Excepción | Datos insuficientes para inferir dependencias: la IA lo indica y pide información. El reporte se etiqueta como **evaluación asistida**, validable por el equipo. |

| Forma | Qué comprueba |
|---|---|
| 1FN | Atributos atómicos; sin grupos repetitivos ni multivaluados |
| 2FN | Sin dependencias parciales respecto a una clave compuesta |
| 3FN | Sin dependencias transitivas entre atributos no clave |
| 4FN | Sin dependencias multivaluadas no triviales |

## CU19: Consultar historial de sesiones

| Campo | Contenido |
|---|---|
| Propósito | Revisar el trabajo pasado de un grupo: chat, órdenes a la IA y cambios del lienzo. |
| Actores | A1, A2, A3 |
| Iniciador | Usuario |
| Precondición | Miembro del proyecto con al menos una sesión cerrada o en curso. |
| Flujo principal | 1. Abre "Historial" del proyecto. 2. El sistema lista las sesiones (fecha, duración, participantes, resumen). 3. El usuario elige una sesión. 4. El sistema muestra la línea de tiempo (mensajes, órdenes a la IA y eventos del lienzo) y el snapshot del diagrama de esa sesión. |
| Postcondición | El usuario revisó la sesión sin alterarla. |
| Excepción | Proyecto sin sesiones: se muestra estado vacío. El historial es **solo lectura**; no se edita ni se borra desde la interfaz. |

**Definición de sesión.** Se abre cuando se conecta el primer miembro y se cierra por inactividad (tiempo configurable) o al desconectarse el último. Se guarda: mensajes, comandos a la IA y su resultado, eventos del lienzo, participantes, marcas de tiempo y snapshot al cierre.

## CU20: Resumir el estado del lienzo por chat

| Campo | Contenido |
|---|---|
| Propósito | Responder "¿qué hay en el lienzo?" y "¿qué han avanzado?". |
| Actores | A1, A2, A3, A4 |
| Iniciador | Usuario (cualquier rol) |
| Precondición | Miembro del proyecto. |
| Flujo principal | 1. *"@ia resume el lienzo"* o *"@ia ¿qué avanzamos hoy?"*. 2. El sistema entrega a la IA el diagrama actual y los eventos recientes de la sesión (y, si se pide, de sesiones anteriores). 3. La IA responde con clases, relaciones, cambios recientes y pendientes detectados. |
| Postcondición | El usuario recibe un resumen coherente con el estado real. |
| Excepción | Lienzo vacío: la IA lo indica. |

## CU21: Visualizar proyecto desde la APK (espectador)

| Campo | Contenido |
|---|---|
| Propósito | Seguir el avance del proyecto desde el móvil sin poder editar. |
| Actores | A3 (Espectador móvil) |
| Iniciador | Usuario |
| Precondición | Cuenta de CU13 (**mismo usuario y contraseña que la web**) y membresía en el proyecto. |
| Flujo principal | 1. Inicia sesión en la APK. 2. Ve la lista de sus proyectos. 3. Abre un proyecto: el **lienzo en modo lectura** (zoom y desplazamiento, sin arrastrar ni editar). 4. Recibe en tiempo real los cambios que otros hacen en la web. 5. Abre el chat y consulta a la IA (p. ej., resumen, CU20) o revisa el historial (CU19). |
| Postcondición | El usuario conoce el avance del diagrama. |
| Excepción | Cualquier intento de escritura desde el móvil: el servidor responde 403. Si un espectador pide a la IA una modificación, la IA responde que su rol es solo lectura. Sin conexión: se muestra el último estado cargado y se indica que no está actualizado. |
