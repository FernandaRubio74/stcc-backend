# ADR-008 — Heurística de cobertura por palabras clave con umbral asimétrico

## Contexto

`screens/coverage.js` (¿toda funcionalidad del MVP tiene pantalla?) y
`consistency/rules.js` (¿todo tipo de usuario está reflejado?) necesitan
comparar texto libre generado por la IA contra frases de otras etapas.

## Decisión (y su historia real)

La primera versión comparaba por **substring exacto** de la frase completa.
Funcionaba con los fixtures cortos de los tests automatizados, pero en
pruebas manuales con el wizard real falló sistemáticamente: el wizard
describe cada funcionalidad con una oración larga ("Panel simple para
dueños: alta de sede y canchas, edición básica de datos") que ninguna
pantalla repite palabra por palabra.

El arreglo final compara por **palabras clave significativas** (se
descartan conectores y palabras cortas, truncadas a un prefijo de 5
caracteres para tolerar plural/género), con un **umbral distinto según la
dirección**:

- **Falta cobertura** (¿está la funcionalidad en alguna pantalla?): alcanza
  con la **mitad** de las palabras clave. Un falso negativo bloquearía al
  usuario sin razón.
- **Fuga de alcance** (¿una pantalla implementa algo explícitamente fuera
  del MVP?): exige **todas** las palabras clave en la misma pantalla. Un
  falso positivo bloquearía igual sin razón — y se encontró exactamente ese
  caso: una pantalla legítima de "reserva como invitado" quedaba marcada
  como fuga de "Cuentas/registro del jugador (el jugador reserva como
  invitado)" solo por compartir las palabras "jugador"/"invitado" de la
  frase aclaratoria entre paréntesis.

Se agregó además un filtro para ignorar entradas de `mvpScope.in` redactadas
como negación ("Sin pagos online"): el wizard a veces repite ahí una
exclusión que ya está, correctamente, en `mvpScope.out`.

## Motivo de fondo

Todos estos hallazgos salieron de **probar manualmente contra la IA real**,
nunca de los tests automatizados (que usan fixtures cortos y controlados).
Es la evidencia concreta de por qué el DoD de varias historias pedía
explícitamente pruebas E2E contra un entorno real.

## Consecuencias

- La misma técnica se aplicó en dos módulos distintos (`screens/coverage.js`
  y `consistency/rules.js`) sin extraerla a un helper compartido: es
  duplicación deliberada de ~15 líneas, no una abstracción prematura, ya que
  cada módulo documenta su propio motivo en su propio comentario.
- Limitación conocida de `consistency/rules.js` (combinar todo el proyecto
  en un solo string): ver ADR-005.
