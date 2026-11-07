# Especificación Técnica y Directrices Maestras del Proyecto
# Diagramador UML Colaborativo en Tiempo Real con Generación de Código e IA

## 1. Visión y Propósito del Proyecto
Este proyecto es una plataforma integral de ingeniería de software diseñada para modelado visual de diagramas de clases UML, colaboración multiusuario en tiempo real mediante WebSockets, persistencia relacional y generación automatizada de arquitecturas de software completas (código fuente backend/frontend y colecciones Postman), asistida por un copiloto de Inteligencia Artificial.

El proyecto está diseñado bajo los estándares de evaluación de **Ingeniería de Software 1 (UAGRM)** y se rige por los 7 atributos de calidad de la norma **ISO/IEC 25010**.

---

## 2. Mapa de Topología y Puertos de Servicios

| Servicio | Tecnología / Runtime | Puerto | Protocolo | Responsabilidad Principal |
| :--- | :--- | :--- | :--- | :--- |
| **Frontend Diagramador** | Angular 20 + TypeScript | `4200` | HTTP | Interfaz SPA visual, canvas UML (2 paneles), reactividad |
| **Backend IA & Colaboración** | Python 3.12 + Django 5 + Channels | `8000` | HTTP / WS | WebSockets tiempo real (Daphne), salas UUID, IA y persistencia |
| **Backend Generador** | Java 21 LTS + Spring Boot 3.5.x | `7000` | HTTP / REST | Motor de generación de código (Mustache), exportación Postman v2.1 |
| **Base de Datos** | PostgreSQL 17 | `5432` | TCP | Persistencia relacional (base de datos `uml_bd`) |

---

## 3. Estructura del Monorepositorio
```text
Diagramador_UML_Examen1/
├── frontend_diagramador_uml/    # Cliente Angular 20 (Canvas UML, Signals, 2 Paneles)
├── backend_generador_spring/    # Microservicio Spring Boot 3 / Java 21 (Generador de Código)
├── backend_ia_colaboracion/     # Microservicio Django Channels (WebSockets, IA, PostgreSQL)
├── .agents/rules/               # Reglas modulares profundas por tecnología y calidad
│   ├── 01-calidad-y-arquitectura.md
│   ├── 02-frontend-angular.md
│   ├── 03-backend-spring.md
│   └── 04-backend-django.md
├── docker-compose.app.yml       # Orquestación de contenedores de aplicaciones
├── docker-compose.db.yml        # Orquestación de base de datos PostgreSQL 17
├── .gitignore                   # Reglas de exclusión de repositorio
└── GEMINI.md                    # Este manifiesto maestro
```

---

## 4. Runbook de Ejecución Local (Guía Rápida de Arranque)

### A. Base de Datos (PostgreSQL 17)
- **Host:** `127.0.0.1:5432`
- **Base de datos:** `uml_bd`
- **Usuario:** `postgres` | **Password:** `123456`
- **Levantar servicio (si se usa docker):**
  ```bash
  docker compose -f docker-compose.db.yml up -d
  ```

### B. Backend Django / Daphne (Puerto 8000)
- **Directorio:** `backend_ia_colaboracion`
- **Comandos de activación y arranque:**
  ```powershell
  cd "D:\Materias UAGRM\ING. DE SOFWARE 1\Modelo examen\Diagramador_UML_Examen1\backend_ia_colaboracion"
  .\venv\Scripts\activate
  python manage.py migrate
  daphne -b 127.0.0.1 -p 8000 diagramador_uml.asgi:application
  python manage.py runserver 8000
  .\venv\Scripts\python.exe manage.py runserver 8000
  ```
  

### C. Backend Spring Boot (Puerto 7000)
- **Directorio:** `backend_generador_spring`
- **Java requerido:** Java 21 LTS (`JAVA_HOME` apuntando a JDK 21)
- **Comandos de compilación y arranque:**
  ```powershell
  cd "D:\Materias UAGRM\ING. DE SOFWARE 1\Modelo examen\Diagramador_UML_Examen1\backend_generador_spring"
  .\mvnw.cmd clean compile
  .\mvnw.cmd spring-boot:run
  ```

### D. Frontend Angular (Puerto 4200)
- **Directorio:** `frontend_diagramador_uml`
- **Comandos de arranque:**
  ```powershell
  cd "D:\Materias UAGRM\ING. DE SOFWARE 1\Modelo examen\Diagramador_UML_Examen1\frontend_diagramador_uml"
  npm start
  ```
- **Acceso:** `http://localhost:4200/`

---

## 5. Reglas Maestras de Calidad y Gobernanza del Asistente IA
1. **Prioridad Absoluta Local:** Este archivo y las reglas en `.agents/rules/` prevalecen sobre cualquier configuración genérica del IDE.
2. **Defensas Universitarias:** Toda decisión técnica debe poder fundamentarse ante el docente bajo la norma ISO/IEC 25010 y patrones GoF (Factory, Strategy, Observer, Template Method).
3. **No romper código existente:** Antes de refactorizar o modificar contratos, verificar la compatibilidad entre Frontend, Django y Spring Boot.
4. **Prohibido 'any' en TypeScript y 'raw types' en Java:** Tipado estricto, robustez y `null-safety` en todas las capas.
5. **Consulta las Reglas Modulares:** Para detalles profundos de cada componente, consultar directamente los archivos correspondientes en `.agents/rules/`.\n