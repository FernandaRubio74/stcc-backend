# ADR-010 — `docker-compose.yml` orquestador vive en `stcc-backend`

## Contexto

Ideator son dos repositorios (`stcc-backend`, `stcc-frontend`) sin un tercer
repo de infraestructura. Hace falta un `docker-compose.yml` que levante base
de datos + backend + frontend con un solo comando (US-038).

## Decisión

El compose orquestador vive en `stcc-backend` y construye el frontend
referenciando el repo hermano (`build: { context: ../stcc-frontend }`). Es un
requisito explícito de layout: los dos repos deben estar clonados como
carpetas hermanas del mismo directorio padre (documentado en el README del
backend).

## Alternativas consideradas

- **Repo `ideator-infra` separado**: correcto a mayor escala, pero agrega un
  tercer repo a clonar/sincronizar para un alcance de 2 servicios de
  aplicación — complejidad sin beneficio real para este proyecto.
- **Compose duplicado en cada repo**: duplica la definición de red/volúmenes
  y arriesga que diverjan.

## Consecuencias

- Levantar el entorno completo requiere haber clonado ambos repos con esa
  estructura de carpetas exacta; está documentado y es el único requisito no
  evidente del comando `docker compose up`.
- Si Ideator alguna vez pasa a tener más de 2 servicios de aplicación (o
  necesita desplegarse en un orquestador real), esta decisión debería
  revisarse a favor de un repo de infraestructura dedicado.
