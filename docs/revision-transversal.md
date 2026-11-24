# Revision transversal del motor de consistencia y del flujo de etapas

Alcance: modulo `consistency`, revision consolidada (`review`), flujo de
definicion y el resto de los modulos de etapa, backend y frontend.

Caso de prueba usado en todo el documento: servicio de courier. Actores
`Revisador` y `Supervisor`; los clientes que envian paquetes no usan la
plataforma. Fuera del MVP: pagos en linea, rastreo, aduana, integraciones
con otros transportistas, app nativa.

## 1. Causa raiz de los cuatro sintomas

### Sintoma 1 - Valida antes de tiempo

`consistency.service.loadContext()` carga solo versiones `APPROVED` y pasa
`null` para las etapas que todavia no existen. `rules.js` no distinguia
"no existe todavia" de "existe y no cumple": la regla de cobertura de tipos
de usuario exigia presencia simultanea en modelo de datos, API y pantallas,
asi que apenas se completaba la definicion ya reportaba inconsistencias
contra etapas que no se habian generado. No habia ningun estado neutro: el
contrato solo tenia `issues` e `isConsistent`, de modo que todo lo que no
era "ok" se mostraba como problema.

**Correccion**: cada regla declara las etapas que compara y solo se evalua
si TODOS esos artefactos existen; si falta alguno queda en estado
`pendiente` con el mensaje "Todavia no se puede comprobar: falta generar
...". Ver `rules.js` (`evaluateRules`, `artifactPresence`, `pendingCheck`).

### Sintoma 2 - Confunde roles con entidades

La regla `target-users-coverage` comparaba el `label` de cada `targetUser`
como TEXTO (stems de 5 caracteres, umbral de la mitad de las palabras)
contra nombres de entidad, nombres y tipos de atributo, descripciones de
endpoints y textos de pantallas. Un rol modelado como valor de un campo no
deja rastro textual, asi que el hallazgo era permanente e irresoluble sin
inventar una entidad por actor.

**Correccion**: la regla se reemplazo por `actors-coverage`, que
(a) construye el conjunto de actores desde los datos estructurados
(`definition.targetUsers`), (b) no exige NUNCA una entidad por actor, y
(c) detecta la diferenciacion de forma estructural: un atributo con tipo
enumerado (tipo no escalar), una entidad cuyo nombre es exactamente el
actor, un endpoint que declara 403, o pantallas con distinto
`visibleToRoles`. Si nada de eso aparece, emite `advertencia`, que no
bloquea. La unica regla que puede afirmar "falta una entidad" es
`entities-coverage`, 100% estructural (un `resourceEntity` de la API que no
existe en el modelo aprobado).

### Sintoma 3 - Exige cosas que no corresponden

Dos focos:

1. `checkMvpScopeDrift` armaba un unico blob de texto con TODA la API y
   TODAS las pantallas y buscaba ahi las palabras de cada exclusion, asi
   que dos artefactos legitimos y distintos podian, entre los dos,
   contener todas las palabras de algo que ninguno implementaba. Estaba
   documentado en el propio codigo como limitacion conocida.
   **Correccion**: la comparacion es por artefacto individual (cada
   endpoint, cada pantalla), y el hallazgo nombra el artefacto concreto.
2. `screens/coverage.js:validateMvpCoverage()` exigia que cada
   funcionalidad de `mvpScope.in` apareciera por coincidencia de palabras y
   **bloqueaba la generacion** (`MvpCoverageError` -> 502), con una lista
   fija de palabras de rol/permiso en el codigo (prohibida por la regla B).
   **Correccion**: ver hallazgo H-04.

### Sintoma 4 - La resolucion con sugerencia no resuelve

Tres causas acumuladas:

1. El motor solo lee versiones `APPROVED`. "Resolver"/"Ajustar con IA" crea
   un `DRAFT`, asi que el hallazgo seguia identico hasta aprobar, sin que
   nada lo dijera. **Correccion**: la respuesta expone `pendingApproval`
   (etapas con borrador sin aprobar) y la interfaz lo explica en el aviso
   de la etapa.
2. Los hallazgos no tenian id estable, evidencia ni sugerencia, asi que no
   se podian correlacionar ni mostrar de forma accionable.
   **Correccion**: cada hallazgo lleva `id` estable (derivado de la regla y
   del artefacto, no de la posicion), `status`, `evidence` y `suggestion`.
3. El frontend re-derivaba la sugerencia por su cuenta con una tabla de
   reglas duplicada, que se desincronizo (apuntaba a
   `target-users-coverage`, una regla que ya no existe).
   **Correccion**: `conflictInstructions.ts` usa `issue.suggestion` del
   backend como unica fuente de verdad.

Fuera de esto, en una iteracion anterior se habia corregido que el editor
de modelo de datos y de API no refrescaba su copia local despues de
generar/ajustar (el borrador conserva el mismo id, y el efecto que
re-sembraba el estado local solo se disparaba al cambiar de id).

## 2. Tabla de hallazgos de la revision transversal

| id | etapa | sintoma | clase | causa | archivos | prueba | estado |
|---|---|---|---|---|---|---|---|
| H-01 | todas | un miembro `viewer` podia GENERAR y modificar en cualquier etapa: `data-model/generate`, `api-spec/generate`, `screens/generate`, `testing/generate`, `architecture/recommend`, `definition/messages`, `definition/advance`, `documents/spec`, `documents/architecture` solo exigian membresia | A | las rutas de `refine`/`patch`/`approve` tenian `requireRole`, las de generacion no: se asumio que generar era una lectura, pero sobrescribe el borrador vigente | `*/\*.routes.js` (7 modulos) | `tests/functional/viewer-permissions.routes.test.js` (17 casos) | corregido |
| H-02 | consistency, review | no existia estado `pendiente`: una etapa sin generar se mostraba como problema | A | el contrato solo tenia `issues`/`isConsistent` | `consistency/rules.js`, `consistency.service.js`, `consistency.controller.js`, front: `types/review.ts`, `ReviewChecklist.tsx`, `StageInconsistencyAlert.tsx` | `consistency-rules.test.js`, `consistency.service.test.js`, `consistency.routes.test.js`, `ReviewChecklist.test.tsx` | corregido |
| H-03 | consistency | roles tratados como entidades por coincidencia de palabras | A | `target-users-coverage` comparaba texto libre | `consistency/rules.js` | `consistency-rules.test.js` (`checkActorsCoverage`) | corregido |
| H-04 | screens | la cobertura MVP<->pantallas decidia por palabras y **bloqueaba** la generacion, con lista fija de palabras de rol | A | heuristica textual usada como gate | `screens/coverage.js`, `screens/screens.service.js` | `screens-coverage.test.js`, `screens.service.test.js`, `screens.routes.test.js` | corregido |
| H-05 | consistency | fuga de alcance con falso positivo por blob global | A | `buildHaystack` unia toda la API y todas las pantallas | `consistency/rules.js` | `consistency-rules.test.js` (palabras repartidas entre artefactos) | corregido |
| H-06 | documents | `ProjectNotReadyError` no decia que etapa faltaba | B | el detalle viajaba solo en `blockers` | `documents/documents.service.js` | `documents.service.test.js` | corregido |
| H-07 | consistency | hallazgos sin id estable, evidencia ni sugerencia | B | el contrato era `{rule, stages, message}` | `consistency/rules.js` | `consistency-rules.test.js` (id estable) | corregido |
| H-08 | definition -> modelo | no se puede detectar "la definicion describe datos a guardar y el modelo no los representa" sin coincidencia de palabras sobre texto libre: no existe un campo estructurado de datos a persistir | C | el modelo de definicion no tiene ese dato | — | — | **no corregido por decision**: se opto por quedarse solo con la deteccion estructural existente (`entities-coverage`), sin campo nuevo ni LLM en el chequeo |
| H-09 | entre etapas | al regenerar y re-aprobar una etapa previa, las posteriores no quedaban marcadas de ninguna forma | A | no habia comparacion de antiguedad entre etapas | `consistency/consistency.service.js` (`findStaleStages`) | `consistency.service.test.js` (etapa posterior aprobada antes) | corregido, sin migracion: usa los `approvedAt` existentes y emite `advertencia` |
| H-10 | todas | el manejo de respuesta invalida/vacia de la IA era correcto pero no estaba cubierto de punta a punta | D (sin defecto) | hueco de cobertura, no un bug | — | `tests/functional/ai-failure.routes.test.js` (3 casos) | sin reproducir: no habia defecto; se cerro el hueco de cobertura |

### Segunda tanda (reportada despues de la primera pasada)

| id | etapa | sintoma | clase | causa | archivos | prueba | estado |
|---|---|---|---|---|---|---|---|
| H-11 | modelo de datos | el diagrama ER no renderiza: "Parse error on line 5 ... Expecting 'ATTRIBUTE_WORD', got ':'" | A | **regresion introducida por la correccion de H-03**: en `erDiagram` el tipo y el nombre de un atributo tienen que ser UNA palabra, y al pedirle al modelo que deje los tipos de usuario escritos en el `type` del campo de rol ("enum: miembro del equipo \| admin") eso se emitia tal cual y rompia el diagrama entero | `data-model/mermaid.js` | `tests/unit/mermaid.test.js` (4 casos) + validado contra el parser real de mermaid 12 | corregido |
| H-12 | pantallas | una comilla doble en el nombre de una pantalla rompe el diagrama de navegacion | B | el nombre se emitia sin escapar dentro de `["..."]`; las etiquetas de navegacion si se escapaban | `screens/flowchart.js` | `tests/unit/flowchart.test.js` (2 casos) | corregido |
| H-13 | pruebas | 409 "El plan de pruebas no cubre todo lo necesario: pantallas sin casos de prueba: ..." con pantallas que si existen, y sin forma de avanzar | A | al detectar un hueco se descartaba TODO el plan generado y no se persistia nada, asi que reintentar era repetir la misma loteria de la IA; la cobertura completa se exigia al generar en vez de al aprobar | `testing/testing.service.js`, `testing/testing.controller.js`, front: `types/testing.ts`, `TestingPage.tsx` | `tests/unit/testing.service.test.js`, `tests/functional/testing.routes.test.js` | corregido |

| H-14 | revision final | el boton "Generar documentacion final" no hacia nada: no generaba documentos ni llevaba a ninguna parte | A | solo llamaba a `POST /consistency-check/final-generation`, que es un gate de validacion y no genera nada; la generacion real vive en `POST /documents/spec` y `POST /documents/architecture`, que nunca se invocaban desde ahi | front: `ReviewPage.tsx` | `tests/unit/ReviewPage.test.tsx` (3 casos) | corregido |

Detalle de H-14: el boton ahora valida (mismo gate, que ya informa que
etapa falta), genera los dos documentos en paralelo (son deterministicos,
sin IA, y se versionan por tipo asi que no colisionan) y navega a
`/projects/:projectId/documents`. Si el gate falla, no genera nada ni
navega, y muestra el mensaje del backend. No habia ninguna prueba de la
pagina de revision: se agrego.

| H-15 | modelo de datos, pantallas | el mismo "Parse error ... got ':'" seguia apareciendo despues de corregir H-11 | A | el diagrama se PERSISTE en la fila de la version, asi que arreglar el generador solo arreglaba los diagramas nuevos: una version guardada antes del fix devolvia el texto roto para siempre | `data-model/data-model.service.js`, `screens/screens.service.js` (`serializeVersion`) | `tests/unit/data-model.service.test.js` (2 casos) + validado contra el parser de mermaid 12 con el caso exacto reportado | corregido |

Detalle de H-15: el diagrama se vuelve a derivar del contenido
estructurado al LEER, en vez de devolver el texto persistido. Es 100%
derivable (nunca lo escribe la IA ni el usuario), asi que las filas viejas
con un diagrama invalido se sanan solas, sin migracion ni script de
backfill. Se aplico el mismo criterio al flowchart de pantallas.

Detalle de H-11: el tipo se emite ahora como su "cabeza" (`enum`) y el texto
completo va como comentario del atributo, que Mermaid si admite con
espacios: `enum rol "enum: miembro del equipo | admin"`. El nombre del
atributo tambien se sanea. Verificado con el parser de `mermaid@12.2.0`
(el mismo que usa el frontend): la salida nueva parsea y la vieja falla con
el error exacto reportado.

Detalle de H-13: generar, ajustar con IA y editar a mano ahora **guardan
siempre** el borrador y devuelven `coverageGaps` (campo aditivo) con lo que
falta; `GET /:projectId/testing` tambien lo incluye para que el aviso
sobreviva a un refresh. El gate se movio a `approveVersion`, que ahora
valida cobertura completa: asi se mantiene la invariante que consumen las
etapas siguientes y la revision final ("aprobado implica cobertura
completa") sin dejar al usuario sin salida. `getTestPlanState` calcula los
huecos solo cuando se le pide (`withCoverage`), para no agregar 4 consultas
por proyecto en el listado.

Revisados sin hallazgo: precondiciones de generacion de cada etapa (todas
dependen solo de etapas anteriores: modelo de datos exige definicion
completa, pantallas exigen API aprobada, arquitectura exige modelo
aprobado); "Avanzar de etapa" y las preguntas bloqueantes (dependen solo de
la etapa actual); `screens/coherence.js`, `api-spec/coherence.js` y
`testing/coverage.js` (comparaciones exactas por referencia, no textuales);
`validateRoleCoverage` (enum fijo de roles reales de membresia).

## 3. Comportamiento resultante

- **Estados**: `ok`, `pendiente`, `advertencia`, `error`. Solo `error`
  bloquea. `isConsistent` es ahora "no hay errores" (una advertencia no
  bloquea).
- **Campos nuevos, todos aditivos** en `GET /:projectId/consistency-check`:
  `status`, `checks`, `pendingStages`, `pendingApproval`; y en cada item de
  `issues`: `id`, `status`, `evidence`, `suggestion`. `issues` e
  `isConsistent` conservan su forma. En
  `POST /:projectId/consistency-check/final-generation` se agrego
  `pendingStages` al cuerpo del 409.
- **Revision final**: una etapa sin generar se muestra "Pendiente de
  generar", nunca como inconsistencia, y la generacion final sigue
  bloqueada nombrando lo que falta.

Verificacion en vivo del caso del courier (definicion terminada, nada mas
generado):

```
status: pendiente
issues: []
isConsistent: true
pendingStages: ["data-model","api-spec","screens"]
checks:
  - entities-coverage => pendiente | Todavia no se puede comprobar: falta generar el modelo de datos y la especificacion de API
  - actors-coverage   => pendiente | Todavia no se puede comprobar: falta generar el modelo de datos y la especificacion de API y el mapa de pantallas
  - mvp-scope-drift   => pendiente | Todavia no se puede comprobar: falta generar la especificacion de API y el mapa de pantallas
review-summary: inconsistencies: [] | dataModel.complete: false | readyToGenerate: false
final-generation: 409 "Todavia falta generar el modelo de datos, la especificacion de API, el mapa de pantallas antes de la generacion final."
```

Y generando el modelo de datos del mismo proyecto con IA real:

```
entidades: User, Package, Product
campos de rol: [{"e":"User","n":"role","t":"enum: revisador | supervisor"}]
consistencia: status pendiente | issues 0 | pendingApproval ["data-model"]
```

Los dos actores quedan modelados como un unico campo de rol, sin entidad
por actor y sin exigir una entidad "Cliente" (los clientes no usan la
plataforma).

## 4. Archivos cambiados

Backend:

- `src/modules/consistency/rules.js` (reescrito: gate por etapa, estados,
  `actors-coverage` estructural, fuga de alcance por artefacto, ids
  estables, evidencia y sugerencia)
- `src/modules/consistency/consistency.service.js` (contexto con
  borradores, `pendingStages`, `pendingApproval`, `findStaleStages`,
  resumen de estado, bloqueo solo por errores)
- `src/modules/consistency/consistency.controller.js` (409 con mensaje de
  etapas pendientes)
- `src/modules/screens/coverage.js` (`validateMvpCoverage` ->
  `findUncoveredMvpFeatures`, diagnostico no bloqueante; se elimino la
  lista fija de palabras de rol)
- `src/modules/screens/screens.service.js` (la validacion del mapa queda
  solo con chequeos estructurales)
- `src/modules/documents/documents.service.js` (mensaje de precondicion que
  nombra lo que falta)
- `src/modules/{data-model,api-spec,screens,testing}/\*.routes.js`,
  `architecture.routes.js`, `definition.routes.js`, `documents.routes.js`
  (guards de rol en generacion/modificacion)
- `src/modules/data-model/prompts.js` (iteracion previa: pedir que los
  tipos de usuario que se distinguen por permisos se modelen como un campo
  de rol con los nombres escritos, en vez de una entidad por actor)

Frontend:

- `src/types/review.ts`, `src/services/reviewService.ts` (contratos
  aditivos: estados, checks, pendientes)
- `src/components/StageInconsistencyAlert.tsx` (error vs advertencia,
  sugerencia del backend, aviso de borrador sin aprobar)
- `src/pages/project/review/ReviewChecklist.tsx` ("Pendiente de generar"
  distinto de conflicto, avisos separados de errores, detalle de lo que
  falta generar)
- `src/pages/project/review/conflictInstructions.ts` (usa la sugerencia del
  backend)
- `src/pages/project/{data-model,api-spec,screens}/\*Page.tsx` (se quita el
  prop redundante de borrador pendiente)

Pruebas:

- nuevas: `tests/functional/viewer-permissions.routes.test.js`,
  `tests/functional/ai-failure.routes.test.js`
- reescritas o ampliadas: `tests/unit/consistency-rules.test.js`,
  `tests/unit/consistency.service.test.js`,
  `tests/functional/consistency.routes.test.js`,
  `tests/unit/screens-coverage.test.js`, `tests/unit/screens.service.test.js`,
  `tests/functional/screens.routes.test.js`,
  `tests/unit/documents.service.test.js`,
  front: `tests/unit/ReviewChecklist.test.tsx`,
  `tests/unit/conflictInstructions.test.ts`

## 5. Mapa de las pruebas obligatorias

| # | Prueba | Donde |
|---|---|---|
| 1 | definicion completa sin modelo: cero errores, pendiente | `consistency-rules.test.js`, `consistency.service.test.js`, verificacion en vivo |
| 2 | modelo sin entidad "Cliente" pero con rol como campo: cero hallazgos por roles | `consistency-rules.test.js` (`checkActorsCoverage`) |
| 3 | entidad de datos realmente ausente: hallazgo real | `consistency-rules.test.js` (`entities-coverage`, endpoint que referencia `Paquete` inexistente) |
| 4 | elemento fuera del alcance: sin hallazgo | `consistency-rules.test.js` (`checkMvpScopeDrift` con el scope del courier) |
| 5 | hallazgo real, aplicar correccion, re-chequeo: desaparece y no se recrea | `consistency.routes.test.js` (incluye el re-chequeo posterior) |
| 6 | revision final con etapas sin generar: bloqueada con mensaje de pendiente | `consistency.routes.test.js`, `documents.service.test.js` |
| 7 | cada etapa no valida contra etapas posteriores inexistentes | `consistency-rules.test.js` (`evaluateRules`, tres escalones) |
| 8 | regenerar etapa previa con posteriores existentes: quedan marcadas | `consistency.service.test.js` (`stage-outdated`) |
| 9 | un viewer no puede generar ni modificar en ninguna etapa | `viewer-permissions.routes.test.js` |
| 10 | respuesta invalida o vacia de la IA: no rompe el proyecto, error accionable | `ai-failure.routes.test.js` |
| 11 | regresion por cada defecto extra corregido | H-01, H-04, H-05, H-06, H-07, H-09 tienen prueba propia (ver tabla) |

## 6. Verificado y pendiente

Ejecutado:

- backend: `eslint` sin hallazgos; `jest --runInBand tests/unit
  tests/functional` -> 59 suites, 493 pruebas, todas en verde (contra
  Postgres real).
- frontend: `eslint` sin hallazgos; `tsc --noEmit` sin errores;
  `vitest run` -> 31 archivos, 205 pruebas en verde; `npm run build` ok
  (solo el aviso preexistente de tamano de chunks).
- verificacion manual en vivo del caso del courier contra una instancia
  aislada (puerto 3098) con IA real, con los resultados citados arriba.

No verificado / pendiente:

- `tests/e2e` no se ejecuto en esta pasada (solo `tests/unit` y
  `tests/functional`).
- `StageInconsistencyAlert.tsx` no tiene prueba automatizada propia: el
  proyecto no tiene hoy un patron para testear componentes que dependen de
  `useAuth` + react-query de forma aislada. Su comportamiento se verifico a
  mano y los contratos que consume estan cubiertos por las pruebas de
  servicio.
- H-08 queda abierto por decision explicita: hoy no se detecta "la
  definicion describe datos que el sistema debe guardar y el modelo no los
  representa" salvo que la API ya referencie la entidad faltante.
- `MvpCoverageError` y su mapeo en `screens.controller.js` quedan como
  codigo inalcanzable: se dejaron para no tocar el contrato de errores de
  ese modulo en esta pasada.
