# CLAUDE.md — Contexto del proyecto stcc-backend

Este archivo es leído automáticamente por Claude Code al trabajar en este repo.
Contiene el contexto estable del proyecto — no tareas puntuales de sprint (esas
se dan directamente en el chat al arrancar cada ticket).

## Qué es este proyecto

Backend de **Ideator**, una app que acompaña a un usuario o equipo en el
proceso de transformar una idea inicial en una especificación técnica completa
(modelo de datos, API, frontend y arquitectura), pensada para que otra IA
externa pueda implementarla después con la menor cantidad posible de
decisiones adicionales.

Repos relacionados: `stcc-backend` (este), `stcc-frontend`, `ideator-docs`
(especificación funcional y de arquitectura). Tablero: Jira, proyecto `stcc`.

## Stack real (confirmado en el código, no el propuesto por defecto del README)

- **Runtime:** Node.js
- **Framework:** Express (confirmado en `src/app.js` / `src/server.js`)
- **Base de datos:** PostgreSQL 16, vía Docker (`docker-compose.yml`)
- **ORM:** Prisma — el schema vive en `src/database/schema.prisma`, **no** en
  `./prisma/` (la ubicación por defecto de Prisma). Todo comando de Prisma
  necesita `--schema=src/database/schema.prisma` (ya está en los scripts de
  `package.json`, usar `npm run migrate`, `npm run migrate:dev`, etc. en vez
  de invocar `prisma` directo).
- **Autenticación:** JWT (`src/modules/auth/`: controller, service, routes,
  dto). SSO/OAuth2 todavía no implementado — el modelo de `User` ya tiene los
  campos (`auth_provider`, `provider_id`) listos para cuando se haga.
- **Testing:** Jest. Tests en `tests/unit/` y `tests/functional/`.
- **Lint/formato:** ESLint + Prettier ya configurados (`eslint.config.js`,
  `.prettierrc.json`). Usar `npm run lint`, `npm run lint:fix`, `npm run format`.
- **CI:** GitHub Actions (`.github/workflows/ci.yml`) corre en cada PR.

## Estructura de carpetas (ya definida, respetarla)

```
src/
  common/{dto,middlewares,utils}/   # utilidades compartidas
  config/                           # configuración (env.js, etc.)
  database/                         # schema.prisma + migrations/ + seeds/
  modules/
    auth/          # ya implementado (JWT)
    projects/      # pendiente de expandir
    data-model/    # generación del modelo de datos (feature de Ideator)
    api-spec/      # generación de spec de API (feature de Ideator)
    screens/       # generación de mockups de frontend (feature de Ideator)
    architecture/  # selección de arquitectura (feature de Ideator)
    consistency/   # validación de consistencia entre etapas
    documents/     # generación de los .md finales
    ai/            # integración con el motor de IA conversacional
tests/
  unit/
  functional/
docs/
  database/        # README.md + diagrama-er.drawio del modelo de datos
```

Los módulos bajo `src/modules/*` de Ideator (`data-model`, `api-spec`,
`screens`, etc.) son el corazón funcional de la app: el propósito del
producto es que un usuario dialogue con el sistema y este vaya generando y
validando cada una de estas etapas de especificación, deteniéndose en
**preguntas bloqueantes** cuando falta una decisión importante.

## Modelo de datos actual (ya implementado, T-004)

`User`, `Project`, `ProjectMember` en `src/database/schema.prisma`.

- `ProjectMember` ya tiene `role: ProjectRole` (`owner` | `editor` | `viewer`)
  — el enum existe desde T-004, pero **sin lógica de autorización todavía**
  (eso es responsabilidad de tickets de la épica de autorización, ej. T-007/T-008).
  **Confirmado: estos 3 roles son los únicos que existen por ahora — T-008.1
  ("Extender ProjectMember con enum de roles") ya está satisfecho por este
  enum existente, no requiere cambios de schema.** Lo que sí falta es la
  lógica de autorización en sí (guards/middlewares de T-007 y matriz de
  permisos de T-008.2/T-008.4).
- FKs con políticas de cascada explícitas y justificadas — ver
  `docs/database/README.md` sección 4 antes de tocar cualquier FK.
- Auditoría (`created_at`, `created_by`, `updated_at`) en toda tabla nueva:
  mantener esta convención en cualquier entidad futura.
- Cada proyecto es privado por defecto; el acceso se resuelve **siempre** vía
  `ProjectMember`, nunca asumiendo que el frontend ya filtró.

## Convenciones de Git (de `CONTRIBUTING.md` — seguir siempre, sin excepción)

- **Ramas permanentes:** `main` (estable) y `develop` (integración). Nunca
  push directo a ninguna de las dos.
- **Ramas de trabajo:** `feature/`, `fix/`, `chore/`, `docs/`, `hotfix/`
  (este último nace de `main`, el resto de `develop`).
  Convención de nombre: `tipo/ID-descripcion-corta-kebab-case`
  (ej. `feature/T-007-guard-membresia`).
- **Toda rama nace de `develop`** y su PR va **hacia `develop`**, nunca a `main`.
- **Commits:** Conventional Commits (`feat`, `fix`, `docs`, `test`, `chore`,
  `refactor`, `style`, `ci`, `perf`). Minúscula, imperativo, sin punto final.
  Footer con `Refs: T-XXX` o `Closes: T-XXX`.
- **PR:** checklist completo antes de pedir revisión (rama actualizada con
  `develop`, build sin errores, tests agregados y pasando, lint sin errores,
  sin `console.log`/credenciales hardcodeadas, migración probada en entorno
  limpio si aplica). Mínimo **1 aprobación real en GitHub** (no vale un "dale"
  informal) antes de mergear.
- **Merge:** Squash and merge. Se borra la rama de origen al mergear.
- Jira se actualiza a mano — no es automático.

## Entorno local — cosas que ya rompieron una vez, no repetirlas

- Docker Desktop tiene que estar **abierto y corriendo** antes de
  `docker compose up` / `npm run setup` — instalado no alcanza.
- Si aparece `P1000: Authentication failed... credentials for (not available)`
  al migrar: probablemente hay otro Postgres nativo (no-Docker) escuchando en
  el puerto 5432. Verificar con `netstat -ano | findstr 5432` +
  `tasklist /FI "PID eq <pid>"`. Este proyecto expone Postgres en el puerto
  **5433** en `docker-compose.yml` (no 5432) por esta misma razón — no volver
  a 5432 sin chequear antes que esté libre.
- Nunca mezclar resolución de conflictos de Git en el navegador (GitHub web)
  y en la terminal al mismo tiempo — trabajar en uno o el otro, no ambos.
- `package-lock.json` nunca se edita a mano en un conflicto: resolver
  `package.json` primero, después borrar el lock y correr `npm install` para
  regenerarlo limpio.

## Cómo correr el proyecto

```bash
npm install
cp .env.example .env
npm run setup      # docker up + migrate + generate
npm run dev        # si ya está implementado; si no, revisar package.json
npm run test
npm run lint
```

## Al trabajar en un ticket nuevo

1. Confirmar en qué rama se está parado (`git branch`) antes de tocar archivos.
2. Crear rama desde `develop` actualizado, con el nombre siguiendo la convención.
3. Antes de implementar algo relacionado a roles/permisos, revisar si ya
   existe en `schema.prisma` o en módulos ya mergeados — evitar reimplementar
   lo que ya está (ej. el enum de `role` en `ProjectMember`).
4. Tests siempre contra Postgres real (no mockear Prisma), siguiendo el
   patrón de `tests/unit/schema.test.js`.
5. Correr `npm run lint` y `npm run test` antes de abrir el PR.
