# ADR-005 — Motor de consistencia sin estado: recalcula en caliente

## Contexto

Las etapas de un proyecto se pueden editar en cualquier orden después de
aprobadas (ADR-003). Eso puede dejar una etapa posterior desalineada con una
anterior que cambió después (ej. la API sigue referenciando una entidad que
el modelo de datos ya no tiene).

## Decisión

El motor de consistencia (`consistency/rules.js`,
`consistency/consistency.service.js`) **no persiste nada**: cada llamada a
`checkConsistency` carga el estado vigente de cada etapa y corre las 3 reglas
de cero. No hay una tabla de "inconsistencias detectadas" que haya que
actualizar o limpiar.

## Motivo

Un motor con estado requeriría invalidar/recalcular ese estado cada vez que
cualquier etapa cambia — y "cualquier etapa" son 5 módulos distintos. Sin
estado, no hay forma de que quede desincronizado entre que algo cambia y que
la validación lo detecte: la próxima lectura ya está al día.

## Consecuencias

- La liberación de un bloqueo (al corregir la etapa que lo causaba) es
  automática: no existe un paso de "resetear" el bloqueo a mano. Verificado
  explícitamente en los E2E de US-034 y US-040 (bloqueo → corrección →
  liberación, sin intervención manual).
- El costo es recalcular en cada request en vez de leer una fila cacheada —
  aceptable dado el volumen de datos por proyecto (unas pocas entidades,
  endpoints y pantallas).
- **Limitación conocida, documentada y no resuelta**: `rules.js` combina
  todo el proyecto (todas las pantallas, toda la API) en un único string
  antes de buscar palabras clave. Esto puede dar un falso positivo si dos
  funcionalidades legítimas y distintas, combinadas, contienen entre ambas
  todas las palabras clave de una frase que ninguna implementa en realidad.
  La forma correcta de resolverlo es comparar por pantalla/entidad/endpoint
  individual, como ya hace `screens/coverage.js` — es un cambio más grande
  que quedó fuera de alcance de los sprints de cierre.
