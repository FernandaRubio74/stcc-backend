# Decisiones de arquitectura (ADR) — Ideator

Consolidado al cierre del proyecto (T-044.2). Formato: contexto, decisión,
alternativas, consecuencias.

| # | Decisión |
|---|---|
| [0001](./0001-monolito-modular.md) | Arquitectura: monolito modular |
| [0002](./0002-postgres-5433-prisma.md) | PostgreSQL en el puerto 5433 y schema de Prisma fuera de `./prisma/` |
| [0003](./0003-versionado-draft-approved.md) | Versionado DRAFT/APPROVED para modelo de datos y API |
| [0004](./0004-artefactos-deterministas.md) | Los artefactos estructurales son deterministas, nunca generados por la IA |
| [0005](./0005-motor-consistencia-sin-estado.md) | Motor de consistencia sin estado: recalcula en caliente |
| [0006](./0006-presupuesto-ia.md) | Presupuesto de tokens (16384) y timeout (90s) para llamadas a la IA |
| [0007](./0007-ia-doble-determinista-en-ci.md) | En CI, la IA se reemplaza por un doble determinista a nivel de proveedor HTTP |
| [0008](./0008-heuristica-palabras-clave.md) | Heurística de cobertura por palabras clave con umbral asimétrico |
| [0009](./0009-ramas-apiladas-sprints-5-8.md) | Ramas apiladas durante los sprints 5-8, vuelta a ramas desde `develop` desde el sprint 9 |
| [0010](./0010-docker-compose-en-backend.md) | `docker-compose.yml` orquestador vive en `stcc-backend` |

Decisiones de autorización (JWT + SSO + roles por membresía, auditadas en
US-042) están documentadas en [`docs/security/audit-endpoints.md`](../security/audit-endpoints.md)
en vez de repetirse acá.
