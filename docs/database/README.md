# Base de datos — Modelo de datos inicial (T-004)

Documentación del modelo de datos fundacional de Ideator: `User`, `Project`,
`ProjectMember`. Corresponde a la épica **"Modelo de datos inicial"** y a las
tareas T-004.1 a T-004.5.

El schema vive en [`../../src/database/schema.prisma`](../../src/database/schema.prisma)
(no en `./prisma/`, la ubicación por defecto de Prisma, para respetar la
estructura de carpetas ya definida en este repo: `src/database/migrations`,
`src/database/seeds`).

## 1\. Descripción de cada entidad

**`User`** — Representa a cualquier persona que puede autenticarse en Ideator,
ya sea con credenciales locales (email/password) o mediante un proveedor SSO
externo (los campos `auth\_provider` / `provider\_id` dejan el modelo listo
para cuando se implemente el epic de autenticación/SSO). Es la entidad raíz
de identidad: todo lo que se crea o modifica en el sistema queda asociado a
un `User` a través de los campos de auditoría. Un usuario no tiene, por sí
solo, acceso a ningún proyecto; el acceso se otorga exclusivamente mediante
`ProjectMember`.

**`Project`** — Representa un proyecto de definición de producto dentro de
Ideator. Es privado por defecto (`is\_private = true`) y siempre tiene un
único creador (`created\_by`, obligatorio). Un `Project` no contiene
directamente la lista de usuarios que pueden verlo o editarlo: esa
información vive en `ProjectMember`.

**`ProjectMember`** — Resuelve la relación N:M entre `User` y `Project`, y es
donde vive el control de acceso: solo puede consultar o modificar un
proyecto un usuario que tenga una fila en esta tabla para ese proyecto. Cada
fila registra un `role` (owner/editor/viewer) como dato — sin lógica de
autorización todavía, según lo acordado para esta iteración — y quién agregó
a ese miembro (`created\_by`), lo que da trazabilidad sobre las invitaciones.

## 2\. Atributos por tabla

### `users`

|Campo|Tipo|Restricciones|
|-|-|-|
|id|UUID|PK|
|email|VARCHAR(255)|**UNIQUE**, NOT NULL|
|password\_hash|VARCHAR(255)|NULL (permite usuarios 100% SSO)|
|full\_name|VARCHAR(150)|NOT NULL|
|auth\_provider|VARCHAR(30)|NOT NULL, default `'local'`|
|provider\_id|VARCHAR(255)|NULL|
|created\_at|TIMESTAMPTZ|NOT NULL (auditoría)|
|created\_by|UUID|FK → `users.id`, NULL (auditoría; null = auto-registro)|
|updated\_at|TIMESTAMPTZ|NOT NULL (auditoría)|

Constraint adicional: `UNIQUE(auth\_provider, provider\_id)`.

### `projects`

|Campo|Tipo|Restricciones|
|-|-|-|
|id|UUID|PK|
|name|VARCHAR(150)|NOT NULL|
|description|TEXT|NULL|
|is\_private|BOOLEAN|NOT NULL, default `true`|
|created\_at|TIMESTAMPTZ|NOT NULL (auditoría)|
|created\_by|UUID|FK → `users.id`, NOT NULL (auditoría)|
|updated\_at|TIMESTAMPTZ|NOT NULL (auditoría)|

### `project\_members`

|Campo|Tipo|Restricciones|
|-|-|-|
|id|UUID|PK|
|user\_id|UUID|FK → `users.id`, NOT NULL|
|project\_id|UUID|FK → `projects.id`, NOT NULL|
|role|ENUM(`owner`,`editor`,`viewer`)|NOT NULL, default `viewer`|
|created\_at|TIMESTAMPTZ|NOT NULL (auditoría)|
|created\_by|UUID|FK → `users.id`, NULL (auditoría)|
|updated\_at|TIMESTAMPTZ|NOT NULL (auditoría)|

Constraint adicional: `UNIQUE(user\_id, project\_id)`.

> \*\*Alcance:\*\* `role` solo se modela como dato en esta historia. La lógica de
> autorización (qué puede hacer cada rol) queda para una historia futura.

## 3\. Cardinalidades

* **User 1 — N ProjectMember**
* **Project 1 — N ProjectMember**
* ⇒ **User N:M Project**, resuelta a través de `ProjectMember`.
* **User 1 — N Project** (vía `created\_by`).
* **User 0..1 — N User** (auto-referencia vía `created\_by`).

Ver diagrama completo en [`diagrama-er.drawio`](./diagrama-er.drawio) (abrir en [app.diagrams.net](https://app.diagrams.net)).

## 4\. Restricciones y política de cascada por FK

|FK|Política|Justificación|
|-|-|-|
|`users.created\_by → users.id`|`SET NULL`|Borrar al usuario "creador" de otro usuario no debe borrar en cascada la cuenta creada; solo se pierde la trazabilidad.|
|`projects.created\_by → users.id`|`RESTRICT`|Un proyecto nunca debe quedar sin dueño; no se permite borrar un usuario mientras sea creador de al menos un proyecto.|
|`project\_members.user\_id → users.id`|`CASCADE`|Si se elimina un usuario, sus membresías se limpian automáticamente.|
|`project\_members.project\_id → projects.id`|`CASCADE`|Si se elimina un proyecto, sus membresías se eliminan junto con él.|
|`project\_members.created\_by → users.id`|`SET NULL`|Perder al usuario que invitó no debe eliminar la membresía en sí.|

`email` es `UNIQUE` a nivel de columna en Postgres (no solo validado en la
aplicación).

## 5\. Cómo levantar la base de datos y aplicar migraciones

Desde la raíz del repo (`stcc-backend/`):

```bash
npm install
cp .env.example .env
npm run setup
```

Esto levanta Postgres en Docker, aplica `src/database/migrations/20260101000000\_init`
y genera el cliente de Prisma.

> \*\*Nota:\*\* si tenés un Postgres instalado directamente en Windows/Mac/Linux

> (fuera de Docker), puede chocar con el puerto `5432` y dar

> `P1000: Authentication failed`. Por eso este `docker-compose.yml` expone

> el contenedor en el puerto `5433` en vez del `5432` por defecto. Si no

> tenés otro Postgres corriendo, podés volver a `5432` sin problema.


## 6\. Tests (T-004.5)

`tests/unit/schema.test.js` valida contra una base Postgres real que:

* No se pueden crear dos usuarios con el mismo `email`.
* No se pueden crear dos `ProjectMember` para el mismo par `(user\_id, project\_id)`.
* No se puede crear un `ProjectMember` o `Project` con una FK a un registro inexistente.
* Al borrar un `Project`, sus `ProjectMember` se eliminan en cascada.
* Al borrar el usuario que invitó a un miembro, `created\_by` queda en `NULL`.
* No se puede borrar un usuario dueño de un proyecto (`RESTRICT`).

Para correrlos:

```bash
docker exec -it stcc\_backend\_db psql -U ideator -c "CREATE DATABASE ideator\_test\_db;"

# Mac/Linux
export TEST\_DATABASE\_URL="postgresql://ideator:ideator@localhost:5432/ideator\_test\_db?schema=public"
DATABASE\_URL=$TEST\_DATABASE\_URL npx prisma migrate deploy --schema=src/database/schema.prisma

# Windows (PowerShell)
$env:TEST\_DATABASE\_URL="postgresql://ideator:ideator@localhost:5432/ideator\_test\_db?schema=public"
$env:DATABASE\_URL=$env:TEST\_DATABASE\_URL; npx prisma migrate deploy --schema=src/database/schema.prisma

npm run test
```

## 7\. Checklist de Definition of Done

**Épica:**

* \[x] Diagrama ER con `User`, `Project`, `ProjectMember` (PK/FK, tipos, unicidad de email) → `diagrama-er.drawio`.
* \[x] Cardinalidades documentadas → sección 3.
* \[x] Migraciones iniciales ejecutables de punta a punta en entorno limpio → `src/database/migrations/20260101000000\_init/migration.sql`.
* \[x] Campos de auditoría en las tres tablas → sección 2.

**Tareas técnicas:**

* \[x] **T-004.1** Modelar entidades (atributos, tipos, nullability) → `src/database/schema.prisma`, sección 2.
* \[x] **T-004.2** Restricciones (unique email, FK con cascada controlada) → sección 4.
* \[x] **T-004.3** Script de migración inicial → `src/database/migrations/20260101000000\_init/migration.sql`.
* \[x] **T-004.4** Documentar el modelo (diagrama + descripción) → `diagrama-er.drawio` + sección 1.
* \[x] **T-004.5** Tests de unicidad e integridad referencial → `tests/unit/schema.test.js`, sección 6.

