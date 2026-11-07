# AGENTS.md — UML Studio CASE (Segundo Parcial)

Guía corta para agentes. **Léela siempre primero**; luego lee solo los archivos que correspondan a la tarea.

## Qué es el proyecto
CASE colaborativo para diagramas de clases UML 2.5 con generación de código. Primer parcial: lienzo, colaboración en tiempo real, IA como copiloto, XMI, generación Spring Boot / Postman / Flutter. **Segundo parcial:** la IA pasa a ser **moderadora de un chat grupal por proyecto**, con auditoría de normalización, historial de sesiones y una **APK móvil espectadora (solo lectura)**.

## Stack y puertos
| Componente | Tecnología | Puerto |
|---|---|---|
| Frontend web | Angular 20 (standalone, signals) + JointJS | 4200 |
| Colaboración + IA + REST | Django REST + Channels + Daphne + Redis | 8000 |
| Generador de backend | Spring Boot 3 / Java 21 + Mustache | 7000 |
| Base de datos | PostgreSQL 17 | — |
| IA | Google Gemini (texto y visión) | — |
| Móvil | Flutter (APK Android, solo lectura) | — |

## Reglas inviolables
1. **El móvil nunca escribe en el diagrama.** Toda escritura desde cliente móvil devuelve 403, validada en el servidor.
2. **Los permisos se validan en el servidor**, nunca solo en el cliente.
3. **La IA no aplica cambios sin validar**: toda mutación se valida contra `UmlSchema` y las reglas UML antes de aplicarse. Las *sugerencias* requieren confirmación explícita de un diseñador/colaborador.
4. **Herencia y dependencia no admiten multiplicidades** (anti-patrón UML, bloqueado).
5. **El historial de sesiones es de solo lectura.**
6. **Edición incremental**: la IA nunca re-renderiza ni borra todo el lienzo.
7. **Secretos solo en `.env`** (llaves de Gemini, credenciales de PostgreSQL). Nada hardcodeado.
8. **Todo lo del primer parcial (CU1–CU12) debe seguir funcionando.**

## Qué leer según la tarea
| Tarea | Archivos |
|---|---|
| Entender el contexto general | `00-contexto-y-alcance.md` |
| Tocar algo heredado (lienzo, XMI, generadores, colaboración) | `01-resumen-primer-parcial.md` |
| Implementar un caso de uso nuevo (CU13–CU21) | `02-casos-de-uso-segundo-parcial.md` |
| Validar permisos, límites, calidad | `03-requisitos.md` |
| Tablas, eventos WebSocket, capas, endpoints | `04-arquitectura-y-datos.md` |
| Implementar un sprint | `sprints/sprint-N.md` + los CU que cite |
| Riesgos, supuestos, trazabilidad con el docente | `99-riesgos-supuestos-trazabilidad.md` |

## Convenciones de código (heredadas del primer parcial)
- **Django:** apps `collab` (WebSockets) y `uml_api` (REST, persistencia, IA). `AsyncWebsocketConsumer` + `database_sync_to_async`. Modelos en `models.py`, vistas en `views.py`, LLM en `services_gemini.py`.
- **Angular 20:** componentes standalone, `signal()`/`computed()`, `inject()`, TypeScript estricto (**prohibido `any`**), interfaces `UmlClass`, `UmlAttribute`, `UmlRelationship`, `UmlSchema`.
- **Spring Boot 3:** capas `controller`, `service`, `repository`, `entity`, `dto`; inyección por constructor (`@RequiredArgsConstructor`); `@RestControllerAdvice` para errores.

## Terminología
- **Lienzo / sala / room:** diagrama identificado por `room_id` (UUID v4).
- **Proyecto = grupo:** contiene un lienzo, miembros, chat y sesiones.
- **Sesión:** período continuo de actividad de un proyecto (ver CU19).
- **Mutación:** cambio incremental en JSON que la IA propone/aplica sobre el diagrama.
