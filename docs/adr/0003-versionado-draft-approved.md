# ADR-003 — Versionado DRAFT/APPROVED para modelo de datos y API

## Contexto

El modelo de datos y la especificación de API se generan con IA y se editan
colaborativamente. Hace falta un ciclo de vida que permita editar sin
arriesgar lo ya aprobado, y que las etapas posteriores (API, pantallas,
arquitectura, documentos) siempre referencien una versión estable.

## Decisión

`DataModelVersion` y `ApiSpecVersion` versionan con dos estados: `DRAFT`
(editable in-place, a lo sumo una fila por proyecto) y `APPROVED` (inmutable).
Editar actualiza el `DRAFT` existente, o crea uno nuevo si la última versión
ya está `APPROVED` — nunca se pisa una versión aprobada.

Pantallas (`ScreenMap`) y arquitectura (`ProjectArchitecture`) son 1:1 por
proyecto **sin** este ciclo de versionado: el DoD de esas historias no pide
historial ni aprobación, así que agregarlo habría sido complejidad sin un
requisito real detrás.

Los documentos finales (`GeneratedDocument`, ADR-007) usan un tercer patrón:
versionado por tipo de documento, sin estado DRAFT (cada generación es ya una
versión definitiva).

## Consecuencias

- Las etapas posteriores siempre leen la versión `APPROVED` más reciente
  (`getApprovedVersionOrThrow`), nunca un `DRAFT` en progreso.
- Editar el modelo de datos **después** de que la API ya fue aprobada es una
  operación válida (crea un nuevo `DRAFT`, luego aprobado) — es exactamente
  el escenario que el motor de consistencia (ADR-005) existe para detectar.
- Tres patrones de versionado distintos convivencia en el mismo dominio
  (DRAFT/APPROVED, 1:1 sin versionado, versionado simple por tipo): cada uno
  elegido por lo que su propio DoD pedía, no por uniformidad arquitectónica.
