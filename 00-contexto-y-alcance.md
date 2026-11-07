# Contexto, alcance y actores — Segundo Parcial

**Materia:** Ingeniería de Software 1 (INF-422) SC · **Docente:** Ing. Rolando Antonio Martínez Canedo
**Estudiante:** Camacho Jimenez Jairo Lisandro · **Gestión:** Semestre 2 – 2026

## Evolución respecto al primer parcial

| Aspecto | Primer parcial | Segundo parcial |
|---|---|---|
| Rol de la IA | Copiloto en panel lateral (CU8) y visión (CU10) | **Moderador del chat grupal** del proyecto |
| Colaboración | Sala por UUID, sin chat | Chat grupal por proyecto con IA integrada |
| Calidad del modelo | Validación básica de relaciones | **Auditoría de relaciones y normalización 1FN–4FN** |
| Trazabilidad | Solo estado actual (`BackupUML`) | **Historial de sesiones por grupo**, revisable |
| Móvil | Proyecto Flutter *generado* (CRUD) | **APK espectadora**: seguimiento, sin edición |
| Identidad | Salas anónimas por UUID | **Usuarios con login**, mismo usuario en web y móvil |

> Todo el primer parcial se conserva. Ver `01-resumen-primer-parcial.md`.

## Requisitos del docente (fuente original)
- Debe estar todo el primer parcial.
- Mayor protagonismo de la IA: ahora es un **chatbot moderador**.
- **Chat grupal por proyecto** donde la IA modera.
- Cada desarrollador puede pedir a la IA: modificar una clase, añadir una clase, relacionar, dar sugerencias para relaciones, revisar relaciones y verificar si cumple **normalización (4N)**.
- **Historial de sesiones por grupo**, guardado y revisable.
- **Móvil = APK espectadora**, no edita; permite ver el avance del diagrama.
- En el chat se puede pedir a la IA un **resumen de lo que hay en el lienzo** ("¿qué han avanzado?").
- El móvil no edita pero tiene usuario y contraseña, **los mismos que en la web**.

## Alcance

### Incluye
- Todo el alcance del primer parcial.
- Chat grupal por proyecto con IA moderadora.
- Comandos en lenguaje natural: modificar clase, añadir clase, relacionar, sugerir relaciones, revisar relaciones.
- Verificación de normalización 1FN, 2FN, 3FN y 4FN.
- Historial de sesiones por grupo (guardado y consulta).
- Resumen del lienzo bajo demanda.
- APK móvil espectadora con autenticación compartida con la web.

### No incluye
- Edición del diagrama desde el móvil.
- Generación de código desde el móvil.
- Diagramas distintos al de clases.

## Actores

| ID | Actor | Descripción |
|---|---|---|
| A1 | Diseñador | Crea proyectos y lienzos, invita miembros, modela, exporta (heredado) |
| A2 | Colaborador | Edita el diagrama y usa el chat con la IA (heredado) |
| A3 | Espectador móvil | Consulta el avance desde la APK; **no edita el diagrama** |
| A4 | IA Moderadora | Actor de sistema: interpreta mensajes, muta el diagrama, audita y resume |

## Matriz de permisos por rol

| Acción | A1 Diseñador | A2 Colaborador | A3 Espectador |
|---|:-:|:-:|:-:|
| Ver lienzo | ✅ | ✅ | ✅ (solo lectura) |
| Editar clases/relaciones (manual) | ✅ | ✅ | ❌ |
| Pedir mutaciones a la IA | ✅ | ✅ | ❌ |
| Pedir resumen / consultas a la IA | ✅ | ✅ | ✅ |
| Auditar normalización | ✅ | ✅ | ✅ (consulta) |
| Ver historial de sesiones | ✅ | ✅ | ✅ |
| Escribir en el chat | ✅ | ✅ | Solo consultas a la IA |
| Invitar miembros / asignar roles | ✅ | ❌ | ❌ |
| Exportar (Spring, Flutter, Postman, XMI) | ✅ | ✅ | ❌ |
