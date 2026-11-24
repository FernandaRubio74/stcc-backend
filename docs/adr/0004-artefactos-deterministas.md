# ADR-004 — Los artefactos estructurales son deterministas, nunca generados por la IA

## Contexto

Ideator usa IA para proponer contenido (entidades, endpoints, pantallas,
recomendación de arquitectura). Pero algunos artefactos son *derivados* de
ese contenido: diagramas, documentos finales, validaciones cruzadas.

## Decisión

Todo artefacto estructural o de validación se genera con **código
determinista en JS**, nunca pidiéndoselo a la IA:

- Diagramas Mermaid (ER en `data-model/mermaid.js`, flowchart de navegación
  en `screens/flowchart.js`) — siempre el mismo input produce el mismo
  diagrama.
- Documentos finales (`documents/spec.template.js`,
  `documents/architecture.template.js`) — se arman a partir del estado ya
  aprobado de cada etapa; la IA no participa de la generación del documento
  en sí.
- Validación de cobertura MVP↔pantallas (`screens/coverage.js`) y motor de
  consistencia entre etapas (`consistency/rules.js`).

## Motivo

Pedirle a la IA que genere un diagrama o valide su propio trabajo mezcla dos
responsabilidades distintas (proponer contenido vs. garantizar una
invariante) en la misma llamada no determinista. Un generador en código:

- es testeable como función pura, con fixtures exactos y aserciones exactas;
- nunca varía entre llamadas (la IA sí: ver ADR-006, donde el mismo prompt
  gastó una vez 8192 tokens de razonamiento y la siguiente solo 2944);
- no agrega latencia ni costo de otra llamada a un proveedor externo.

## Consecuencias

- Toda la suite de tests de plantillas/diagramas/reglas corre sin red y sin
  depender de un proveedor de IA (ni real ni doble).
- Cuando la heurística determinista resultó demasiado estricta en la
  práctica (ver más abajo, hallazgo de QA manual), el arreglo fue ajustar el
  código, no "mejorar el prompt" — la responsabilidad quedó siempre del lado
  correcto.
