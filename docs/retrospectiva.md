# Retrospectiva final — Ideator (Sprints 1-10)

## Qué funcionó

- **Deterministas para todo lo estructural, IA solo para proponer contenido**
  (ADR-004). Pagó dividendos en cada sprint: diagramas, documentos finales,
  reglas de consistencia y cobertura MVP siempre fueron testeables sin red y
  sin depender de la variabilidad de la IA.
- **El doble determinista a nivel de proveedor HTTP** (`fakeAiProvider.js`,
  ADR-007) mantuvo la suite E2E rápida y estable en CI durante los 10
  sprints, sin un solo flake atribuible a la IA real.
- **Versionado DRAFT/APPROVED** (ADR-003) resultó la pieza que hizo posible
  el motor de consistencia (US-031): sin un estado "aprobado e inmutable"
  por etapa, no habría nada estable contra lo cual detectar drift.
- **Checkpoints por sprint con Jira actualizado tarea por tarea** (no en un
  batch al final) dieron trazabilidad real de qué se hizo y cuándo, sin
  depender de reconstruir la historia desde los PRs al final.

## Qué no funcionó / qué se encontró roto

- **La pila de ramas de los sprints 5-8 nunca llegó a `develop`** (ADR-009):
  cada PR se mergeó contra el anterior de la cadena, pero nadie abrió el PR
  final de la punta hacia `develop`. Se detectó recién al arrancar el sprint
  9 y se corrigió con un PR consolidador explícito.
- **El presupuesto de tokens de la IA se subestimó dos veces** (ADR-006):
  800/1200/4096 y después 8192 tokens, ambos insuficientes, encontrados
  recién en pruebas manuales contra el proveedor real — los tests
  automatizados (con el doble determinista) nunca lo habrían detectado,
  porque el doble no consume tokens de razonamiento.
- **La heurística de cobertura por frase exacta** (ADR-008) fue otro hallazgo
  exclusivo de pruebas manuales: funcionaba con los fixtures cortos de los
  tests automatizados y fallaba sistemáticamente con las oraciones largas
  que el wizard real produce.
- **El README del backend quedó con placeholders del inicio del proyecto**
  ("Express / NestJS *(definir)*") sin actualizar una vez confirmado el stack
  real — encontrado y corregido en T-044.1, al cierre.

## Qué cambiaríamos si empezáramos de nuevo

- Agendar, desde el sprint que arranca una pila de ramas, el PR consolidador
  final hacia `develop` como una tarea explícita del último sprint de esa
  pila — no esperar a notarlo recién al arrancar el sprint siguiente.
- Incluir al menos una corrida manual contra el proveedor de IA real (no solo
  el doble determinista) antes de cerrar cada historia que agregue un prompt
  nuevo — varios de los bugs más importantes del proyecto (presupuesto de
  tokens, heurística de cobertura) solo aparecieron ahí.
- Revisar el README contra el estado real del código al cierre de cada
  épica, no solo al final del proyecto.

## Métricas de cierre

- 10 sprints, 44 historias de usuario (US-001 a US-044 según numeración del
  tablero; EPIC-01 a EPIC-08).
- Backend: ~340 tests unitarios/funcionales + 21 E2E, 3 gates de CI
  (`build`, `e2e`, `release-gate`).
- Frontend: ~134 tests unitarios de componentes.
