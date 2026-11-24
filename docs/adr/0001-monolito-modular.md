# ADR-001 — Arquitectura: monolito modular

## Contexto

Ideator necesita una arquitectura de backend. El dominio es acotado (proyectos,
definición, modelo de datos, API, pantallas, arquitectura, consistencia,
documentos) y el equipo es chico.

## Decisión

Monolito modular en Node.js/Express, organizado por módulos de dominio bajo
`src/modules/*`, con PostgreSQL como base relacional (ver ADR-002) y Prisma
como ORM.

Esta decisión está, además, confirmada por el propio producto: es el escenario
que `architecture/catalog.js` recomienda para proyectos del tamaño de Ideator
mismo (dominio chico, API con pocos endpoints, necesidad de consistencia
transaccional fuerte) — Ideator terminó usando para sí mismo el mismo criterio
que le propone a los proyectos que ayuda a especificar.

## Alternativas consideradas

- **Microservicios**: la complejidad operativa (orquestación, comunicación
  entre servicios, consistencia distribuida) no se justifica para el volumen
  de este proyecto; el catálogo de arquitecturas sí la ofrece como opción para
  proyectos con otro perfil.
- **Serverless**: costos variables y escalado automático no son relevantes
  para una entrega académica/de equipo chico con carga predecible.

## Consecuencias

- Un solo proceso, un solo deploy pipeline — bajo costo operativo.
- Escalado vertical o por réplicas idénticas si hiciera falta.
- Los módulos se comunican por llamada de función directa (mismo proceso), no
  por red: no hay que resolver consistencia eventual entre servicios.
