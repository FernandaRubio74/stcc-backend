# ADR-006 — Presupuesto de tokens (16384) y timeout (90s) para llamadas a la IA

## Contexto

gpt-5 (vía Azure AI Foundry) es un modelo de razonamiento: consume tokens de
"pensamiento" ocultos antes de emitir contenido visible. Ese consumo varía
con la complejidad del prompt — **y también varía entre dos llamadas con el
exact mismo prompt**.

## Decisión

`maxOutputTokens` por defecto en 16384, timeout en 90000ms, con reintento
automático (1 vez) si la respuesta llega sin contenido.

## Motivo (hallazgo real en pruebas manuales, no solo teórico)

El presupuesto se subió dos veces en este proyecto, ambas por fallos reales
reproducidos manualmente, no por precaución:

1. **800/1200/4096 tokens**: insuficientes para prompts largos (modelo de
   datos); el razonamiento oculto agotaba el presupuesto entero y dejaba el
   contenido vacío.
2. **8192 tokens**: todavía insuficiente para la tarea más pesada
   (especificación de API: CRUD completo + 401/403/404 por entidad). Medido
   directamente contra Azure: la misma llamada, con el mismo prompt exacto,
   gastó una vez `reasoning_tokens: 8192` (el presupuesto entero, contenido
   vacío, `finish_reason: "length"`) y la siguiente vez solo `2944`.

Esa variabilidad es la razón de fondo de la decisión: el presupuesto tiene
que sobrar para el **peor caso** observado, no alcanzar para el caso típico.

El timeout subió de 45s a 90s en paralelo: una respuesta real tardó hasta
~50s una vez que el presupuesto de tokens fue suficiente para completarla.

## Consecuencias

- Cada llamada a la IA puede tardar hasta ~90s (con reintento, hasta ~180s en
  el peor caso) — aceptable para una operación que el usuario dispara a
  mano (generar modelo/API/pantallas/arquitectura), no para una ruta de
  alta frecuencia.
- En CI, el doble determinista (`fakeAiProvider.js`) responde instantáneo:
  esta variabilidad nunca afecta los tiempos de build.
- Si Azure cambia de modelo o de política de razonamiento, este valor
  debería volver a medirse en vez de asumirse vigente indefinidamente.
