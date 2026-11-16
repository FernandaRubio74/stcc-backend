# ADR-007 — En CI, la IA se reemplaza por un doble determinista a nivel de proveedor HTTP

## Contexto

La suite E2E corre contra un servidor real en su propio proceso (no en el
mismo proceso que el test runner). Los tests funcionales mockean
`ai.service` con `jest.mock`, pero eso no cruza el límite de proceso del
servidor real: en E2E no hay forma de mockear un módulo interno del servidor
desde el proceso de test.

## Decisión

`tests/e2e/fakeAiProvider.js` levanta un servidor HTTP propio que imita la
superficie del proveedor real (`POST {AI_ENDPOINT}/chat/completions`) y
responde siempre lo mismo según el prompt de sistema recibido (detectando la
tarea por una frase característica de cada prompt). El servidor de la app
apunta `AI_ENDPOINT` a este doble en vez de a Azure.

## Motivo

- Determinismo: sin esto, cada corrida de CI dependería de la variabilidad
  real de gpt-5 (ver ADR-006) — un test E2E no debe fallar porque el
  "razonamiento" de la IA varió esa vez.
- Costo y velocidad: cero llamadas reales a Azure en cada PR.
- Nunca se mockea un módulo propio (`ai.service`, `ai.client`) en E2E: el
  doble está del lado del proveedor externo, que es la frontera real del
  sistema bajo prueba — consistente con el DoD de US-026/US-041 ("sin mocks
  internos del sistema bajo prueba").

## Consecuencias

- Las respuestas canónicas del doble tienen que ser **mutuamente
  consistentes** entre tareas (ej. las pantallas tienen que cubrir por
  palabras clave las funcionalidades del `mvpScope.in` canónico) para no
  bloquear accidentalmente el motor de consistencia (ADR-005) en los E2E que
  llegan hasta la revisión final o los documentos.
- Agregar una etapa nueva a Ideator que llame a la IA (como pasó con
  pantallas y arquitectura en US-040) exige extender `fakeAiProvider.js` con
  esa tarea antes de poder escribir el E2E correspondiente.
