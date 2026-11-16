# Ideator — Backend

[![CI Backend](https://github.com/FernandaRubio74/stcc-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/FernandaRubio74/stcc-backend/actions/workflows/ci.yml)

API y lógica de negocio de **Ideator**, la aplicación que acompaña a un usuario o equipo en el proceso de transformar una idea inicial en una especificación técnica completa (modelo de datos, API, frontend y arquitectura).

## Stack

Confirmado y en uso (ver [ADR-001](./docs/adr/0001-monolito-modular.md) y
[ADR-006](./docs/adr/0006-presupuesto-ia.md) para el porqué de las decisiones clave):

- **Runtime:** Node.js 20+
- **Framework:** Express (monolito modular por dominio: `src/modules/*`)
- **Base de datos:** PostgreSQL 16 (vía Docker, puerto `5433` en local)
- **ORM:** Prisma (`src/database/schema.prisma`, no en `./prisma/`)
- **Autenticación:** JWT propio + SSO (Google OAuth2); roles de membresía por proyecto (owner/editor/viewer)
- **IA:** Azure AI Foundry / Azure OpenAI (gpt-5), superficie compatible con OpenAI v1
- **Testing:** Jest + Supertest (unitarios, funcionales contra Postgres real, E2E contra el servidor real)

## Módulos implementados

| Módulo (`src/modules/`) | Qué hace | Historias |
|---|---|---|
| `auth` | Registro, login, SSO con Google, logout con invalidación de sesión | US-005, US-006, US-042 |
| `projects` | CRUD de proyectos y gestión de miembros/roles | US-009, US-012, T-007/T-008 |
| `ai` | Cliente del proveedor de IA con reintentos y presupuesto de tokens | US-014 |
| `definition` | Wizard conversacional de definición del producto | US-015 a US-017 |
| `data-model` | Generación, edición colaborativa y aprobación del modelo de datos | US-019 a US-021 |
| `api-spec` | Generación, edición y versionado de la especificación de API | US-023, US-024 |
| `screens` | Mapa de pantallas y navegación | US-027 |
| `architecture` | Catálogo de arquitecturas, recomendación y selección | US-028, US-029 |
| `consistency` | Validación cruzada entre etapas (bloquea/libera la generación final) | US-031 |
| `review` | Revisión consolidada del proyecto (`readyToGenerate`) | US-032 |
| `documents` | Generación determinista de los documentos finales + descarga conjunta | US-035, US-036 |
| `health` | Health check, logger estructurado y métricas | US-039 |

## Requisitos previos

- Node.js 20 o superior
- Docker y Docker Compose
- PostgreSQL (si no se usa vía Docker)

## Instalación

```bash
git clone https://github.com/tu-org/ideator-backend.git
cd ideator-backend
npm install
cp .env.example .env
```

Completa las variables de `.env` (ver sección siguiente) y luego:

```bash
docker compose up -d      # levanta la base de datos
npm run migrate           # ejecuta migraciones
npm run dev                # levanta el servidor en modo desarrollo
```

El servidor queda disponible en `http://localhost:3000`.

## Levantar el entorno completo desde cero (Docker)

Levanta base de datos, backend y frontend con un solo comando (US-038).

**Requisito**: los dos repositorios tienen que estar como carpetas hermanas, porque el
compose construye el frontend desde `../stcc-frontend`:

```
Ideator/
├── stcc-backend/     <- se corre el compose desde acá
└── stcc-frontend/
```

```bash
cd stcc-backend
cp .env.example .env                                  # completar JWT_SECRET y credenciales de IA
docker compose up --build -d                          # db + backend + frontend
docker compose run --rm backend npm run migrate       # migraciones (paso explícito)
```

| Servicio | URL | Notas |
|---|---|---|
| Frontend | http://localhost:5173 | build de Vite servido por nginx |
| Backend | http://localhost:3000 | `GET /health` para verificar |
| PostgreSQL | localhost:5433 | puerto 5433 para no chocar con un Postgres nativo |

Las migraciones **no** se ejecutan al arrancar el contenedor a propósito: son un paso
explícito del despliegue, para que un reinicio no aplique cambios de schema por sorpresa.

```bash
docker compose logs -f backend    # seguir logs
docker compose down               # bajar todo (conserva los datos)
docker compose down -v            # bajar y borrar el volumen de la base
```

## Variables de entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `PORT` | Puerto del servidor | `3000` |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL | `postgresql://user:pass@localhost:5432/ideator` |
| `JWT_SECRET` | Clave de firma de tokens | `(generar valor seguro)` |
| `JWT_EXPIRES_IN` | Expiración del token | `1d` |
| `SSO_CLIENT_ID` | Client ID del proveedor OAuth2/OIDC | — |
| `SSO_CLIENT_SECRET` | Client Secret del proveedor OAuth2/OIDC | — |
| `SSO_CALLBACK_URL` | URL de callback del flujo SSO | `http://localhost:3000/auth/sso/callback` |
| `AI_PROVIDER_API_KEY` | Credencial del proveedor de IA (motor conversacional) | — |
| `AI_ENDPOINT` | Endpoint del proveedor de IA (superficie compatible con OpenAI v1) | — |
| `AI_DEPLOYMENT` | Nombre del deployment/modelo a usar | `gpt-5` |
| `AI_TIMEOUT_MS` | Timeout por llamada a la IA | `90000` |
| `AI_MAX_RETRIES` | Reintentos ante fallas transitorias | `1` |
| `FRONTEND_URL` | Origen permitido por CORS | `http://localhost:5173` |
| `NODE_ENV` | Entorno de ejecución | `development` |

Nunca commitear el archivo `.env`. Usar siempre `.env.example` como plantilla sin valores reales.
`tests/unit/env-example.test.js` falla si el código lee una variable que no está documentada
en `.env.example`, o si alguna clave sensible trae un valor en el ejemplo.

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta el servidor en modo desarrollo con recarga automática |
| `npm run build` | Compila el proyecto para producción |
| `npm start` | Ejecuta la build de producción |
| `npm run migrate` | Ejecuta migraciones pendientes de base de datos |
| `npm run seed` | Carga datos de prueba |
| `npm test` | Ejecuta pruebas unitarias y funcionales |
| `npm run test:coverage` | Ejecuta pruebas con reporte de cobertura |
| `npm run test:e2e` | Ejecuta la suite E2E contra un servidor real (requiere Postgres + `fakeAiProvider.js` arriba) |
| `npm run lint` | Ejecuta el linter |

## Tres niveles de test

1. **`npm test`** — unitarios (funciones puras: plantillas, reglas de consistencia, heurísticas)
   y funcionales (rutas HTTP contra el `app` en el mismo proceso, Postgres real, solo se mockea
   `ai.service`). Corre en el job `build` de CI en cada PR.
2. **`npm run test:e2e`** — servidor real en su propio proceso + Postgres real; el único doble
   es el proveedor de IA (`tests/e2e/fakeAiProvider.js`, a nivel de proceso HTTP, nunca un mock
   de módulos propios). Corre en el job `e2e` de CI: es el **gate de merge** a `develop`/`main`.
3. **Gate de release** — el job `release-gate` de CI corre solo
   `tests/e2e/full-flow.e2e.test.js` (el recorrido completo, como lo haría una persona real),
   disparado por un tag `v*` o un PR hacia `main`.

## Base de datos

Modelo de datos inicial (`User`, `Project`, `ProjectMember`), diagrama ER,
políticas de cascada y tests de esquema: ver [`docs/database/README.md`](./docs/database/README.md).

## Estructura del proyecto

Ver detalle completo en la sección de estructura de carpetas más abajo.

## Convenciones de trabajo

Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) para flujo de ramas, convención de commits y checklist de Pull Request.

## Health check

`GET /health` — retorna el estado de la API y su conexión a la base de datos. Usado para verificación de despliegue y monitoreo (ver `EPIC-06 · US-039`).

## Documentación relacionada

- Decisiones de arquitectura: [`docs/adr/`](./docs/adr/README.md)
- Auditoría de seguridad: [`docs/security/audit-endpoints.md`](./docs/security/audit-endpoints.md)
- Retrospectiva final del proyecto: [`docs/retrospectiva.md`](./docs/retrospectiva.md)
- Modelo de datos (ER, políticas de cascada): [`docs/database/README.md`](./docs/database/README.md)
- Catálogo de arquitecturas: [`docs/architecture/README.md`](./docs/architecture/README.md)
- Tablero de trabajo: Jira, proyecto `stcc`