# ADR-002 — PostgreSQL en el puerto 5433 y schema de Prisma fuera de `./prisma/`

## Contexto

Dos decisiones de infraestructura local que ya rompieron una vez y quedaron
fijadas para no repetir el problema.

## Decisión

1. **Puerto 5433** para el Postgres de Docker (`docker-compose.yml`), no el
   5432 por defecto.
2. **`src/database/schema.prisma`**, no `./prisma/schema.prisma` (la ubicación
   por defecto de Prisma) — para respetar la estructura de carpetas ya
   definida del repo (`src/database/` agrupa schema + migraciones + cliente).
   Todo comando de Prisma en `package.json` usa `--schema=src/database/schema.prisma`.

## Motivo (incidente real)

Un Postgres nativo (no-Docker) ya escuchando en el 5432 causaba
`P1000: Authentication failed... credentials for (not available)` al migrar,
sin que el error apuntara al puerto como causa. Cambiar a 5433 evita el
choque sin depender de que cada desarrollador libere el 5432 primero.

## Consecuencias

- `DATABASE_URL` en todos los entornos (local, CI, Docker) usa el puerto que
  corresponda explícitamente — nunca se asume el 5432 por defecto.
- Dentro de la red de `docker-compose`, el backend alcanza la base por
  `db:5432` (el puerto *interno* del contenedor), no por el `5433` publicado
  al host — son dos redes distintas y hay que tenerlo presente al tocar
  `DATABASE_URL` del servicio `backend`.
