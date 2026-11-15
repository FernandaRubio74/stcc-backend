# Auditoría de endpoints — US-042

Matriz completa de endpoints de proyecto: middlewares aplicados y rol mínimo
requerido. Generada a mano revisando cada `*.routes.js`, y verificada por
`tests/functional/security-audit.routes.test.js` (T-042.2), que ejercita cada
fila contra el servidor real.

Criterio de permisos vigente desde US-007/US-008 (sin cambios): el acceso a
cualquier recurso de proyecto se resuelve **siempre** vía `ProjectMember`
(nunca asumiendo que el cliente ya filtró), y un proyecto inexistente y uno
ajeno responden **el mismo 404** — si el ajeno respondiera 403, cualquier
usuario logueado podría enumerar UUIDs y descubrir qué proyectos existen sin
tener acceso a ninguno.

## Resultado de la auditoría

**100% de los endpoints de proyecto pasan por `requireProjectMembership`.**
Verificado recorriendo los 13 archivos `*.routes.js` del repo: no se encontró
ninguna ruta `/:projectId/**` sin el guard.

| Método | Ruta | Guards | Rol mínimo |
|---|---|---|---|
| POST | `/projects` | `requireAuth` | cualquier usuario autenticado |
| GET | `/projects` | `requireAuth` | cualquier usuario autenticado (lista solo los propios) |
| GET | `/projects/:id` | `requireProjectMembership` | miembro |
| PATCH | `/projects/:id` | `requireProjectMembership`, `requireRole('owner')` | owner |
| DELETE | `/projects/:id` | `requireProjectMembership`, `requireRole('owner')` | owner |
| GET | `/projects/:id/members` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/members` | `requireProjectMembership`, `requireRole('owner')` | owner |
| PATCH | `/projects/:id/members/:memberId` | `requireProjectMembership`, `requireRole('owner')` | owner |
| DELETE | `/projects/:id/members/:memberId` | `requireProjectMembership`, `requireRole('owner')` | owner |
| GET | `/projects/:id/definition` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/definition/messages` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/definition/blocking-questions` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/definition/advance` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/data-model` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/data-model/generate` | `requireProjectMembership` | miembro |
| PATCH | `/projects/:id/data-model/entities` | `requireProjectMembership`, `requireRole(['owner','editor'])` | editor |
| POST | `/projects/:id/data-model/approve` | `requireProjectMembership`, `requireRole('owner')` | owner |
| GET | `/projects/:id/api-spec` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/api-spec/generate` | `requireProjectMembership` | miembro |
| PATCH | `/projects/:id/api-spec/endpoints` | `requireProjectMembership`, `requireRole(['owner','editor'])` | editor |
| POST | `/projects/:id/api-spec/approve` | `requireProjectMembership`, `requireRole('owner')` | owner |
| GET | `/projects/:id/screens` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/screens/generate` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/architecture/catalog` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/architecture` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/architecture/recommend` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/architecture/select` | `requireProjectMembership`, `requireRole('owner')` | owner |
| GET | `/projects/:id/consistency-check` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/consistency-check/final-generation` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/review-summary` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/documents/spec` | `requireProjectMembership` | miembro |
| POST | `/projects/:id/documents/architecture` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/documents` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/documents/bundle` | `requireProjectMembership` | miembro |
| GET | `/projects/:id/documents/:documentId` | `requireProjectMembership` | miembro (+ filtra por `projectId` en la query, no solo por `documentId`) |
| GET | `/health` | — | público a propósito (lo consultan el healthcheck del contenedor y el `wait-on` de CI, sin credenciales) |
| GET | `/metrics` | `requireAuth` | cualquier usuario autenticado (no expone datos de proyecto) |

## Manejo de tokens (T-042.3)

- **Expiración**: `JWT_EXPIRES_IN` (`.env`, default `1d`). `requireAuth` usa
  `jwt.verify`, que rechaza un token vencido con el mismo 401 genérico que un
  token inválido (nunca se distingue el motivo exacto en la respuesta).
- **Invalidación en logout — gap encontrado y cerrado en esta historia**: el
  JWT era puramente *stateless* y no existía `POST /auth/logout`; una vez
  emitido, un token circulaba válido hasta su expiración natural sin forma de
  revocarlo antes. Se agregó:
  - un `jti` (identificador único) a cada token emitido (login, registro y
    SSO, vía `generateSessionToken`);
  - una tabla `RevokedToken (jti, expiresAt)` — denylist, no allowlist: no
    revocar nada es el camino feliz, y solo los `jti` deslogueados explícitos
    quedan ahí hasta su propia expiración;
  - `POST /auth/logout` (autenticado) inserta el `jti` del token con el que
    se llamó;
  - `requireAuth` rechaza con 401 cualquier token cuyo `jti` esté en la
    denylist, aunque la firma y la expiración sean válidas.
  - Se eligió `jti` + denylist sobre un `tokenVersion` por usuario porque
    cierra **solo la sesión que hizo logout**, no todas las sesiones activas
    del usuario (un `tokenVersion` invalidaría también la sesión del celular
    si se cierra sesión en el navegador).
