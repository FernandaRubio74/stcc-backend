# Ideator — Backend

[![CI Backend](https://github.com/FernandaRubio74/stcc-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/FernandaRubio74/stcc-backend/actions/workflows/ci.yml)

API y lógica de negocio de **Ideator**, la aplicación que acompaña a un usuario o equipo en el proceso de transformar una idea inicial en una especificación técnica completa (modelo de datos, API, frontend y arquitectura).

## Stack

- **Runtime:** Node.js 20+
- **Framework:** Express / NestJS *(definir según arquitectura seleccionada en EPIC-09)*
- **Base de datos:** PostgreSQL
- **ORM:** Prisma / TypeORM *(a definir)*
- **Autenticación:** JWT + OAuth2/OIDC (SSO)
- **Testing:** Jest + Supertest

> Este stack es el propuesto por defecto. Si el equipo confirma una arquitectura distinta en `EPIC-09`, actualizar esta sección antes de avanzar en Sprint 2.

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
| `NODE_ENV` | Entorno de ejecución | `development` |

Nunca commitear el archivo `.env`. Usar siempre `.env.example` como plantilla sin valores reales.

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
| `npm run lint` | Ejecuta el linter |

## Estructura del proyecto

Ver detalle completo en la sección de estructura de carpetas más abajo.

## Convenciones de trabajo

Ver [`CONTRIBUTING.md`](./CONTRIBUTING.md) para flujo de ramas, convención de commits y checklist de Pull Request.

## Health check

`GET /health` — retorna el estado de la API y su conexión a la base de datos. Usado para verificación de despliegue y monitoreo (ver `EPIC-06 · US-039`).

## Documentación relacionada

- Especificación funcional del producto: repositorio `ideator-docs`
- Documentación de arquitectura: repositorio `ideator-docs`
- Tablero de trabajo: Jira, proyecto `stcc`