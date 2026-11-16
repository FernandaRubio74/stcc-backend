# ADR-009 — Ramas apiladas durante los sprints 5-8, vuelta a ramas desde `develop` desde el sprint 9

## Contexto

`CONTRIBUTING.md` indica que toda rama nace de `develop` y su PR va hacia
`develop`. Durante los sprints 5-8, cada historia dependía en código de la
historia inmediatamente anterior (ej. US-023 necesita el modelo de datos de
US-019 ya en la rama, no solo en `develop`, porque la aprobación de PRs es
asíncrona y no se podía esperar cada merge antes de seguir).

## Decisión

Sprints 5-8: cada rama de feature nace de la rama de la historia anterior
(pila), no de `develop`. El PR de cada una apunta a la anterior, formando una
cadena. Desde el sprint 9: vuelta a la convención original (rama desde
`develop`, PR hacia `develop`), porque ya no hay dependencias de código tan
ajustadas entre historias consecutivas.

## Consecuencias (una real, encontrada y corregida en este mismo proyecto)

- **Gap encontrado**: los PRs de la pila (sprints 5-8) se fueron mergeando
  cada uno contra el anterior de la cadena, nunca contra `develop`. Resultado:
  `develop` se quedó con solo el contenido de US-014 durante varios sprints,
  mientras el trabajo real (US-019 en adelante) vivía únicamente en la punta
  de la pila. Se corrigió con un PR consolidador explícito
  (`feature/US-034-e2e-consistency-suite` → `develop`) antes de arrancar el
  sprint 9, resolviendo los conflictos que quedaron entre el contenido viejo
  de `develop` (budget de IA en 8192, timeout en 45s) y el nuevo.
- **Lección para el futuro**: una pila de ramas larga necesita, en algún
  punto explícito, un PR final de "la punta de la pila → develop" — no basta
  con que cada eslabón individual se haya mergeado.
