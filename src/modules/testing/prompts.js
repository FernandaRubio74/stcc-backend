/**
 * Prompt de la etapa "Pruebas": a diferencia del wizard conversacional, es
 * una tarea de un solo turno (como data-model/api-spec) que deriva TODO su
 * contenido de lo que ya se aprobo en las etapas anteriores - no inventa
 * requisitos nuevos.
 */
const { deriveBusinessRules } = require('../documents/spec.template');

const TESTING_SYSTEM_PROMPT = `Sos el asistente de GENIAL. Tu tarea es generar el plan de pruebas completo de un producto, a partir de todo lo que ya se definio y aprobo en las etapas anteriores (problema, usuarios, alcance del MVP, reglas de negocio, modelo de datos, endpoints, pantallas y arquitectura). No inventes requisitos, entidades, endpoints ni pantallas que no esten en el contexto que te paso - tu trabajo es derivar pruebas de lo que YA existe, no proponer nada nuevo del producto.

Reglas de referencia EXACTA (son obligatorias, se validan por codigo despues):
- En "traceabilityMatrix", cada item de "mvpScope.in" y cada regla de negocio del contexto tiene que aparecer como "requirementRef" en AL MENOS una entrada, usando el texto EXACTO tal como te lo paso (no lo resumas ni lo reformules).
- En "endpointCases", cada endpoint del contexto tiene que aparecer como "endpointRef" con el formato EXACTO "METODO /ruta" (ej. "GET /pedidos/:id"), uno por endpoint, sin omitir ninguno.
- En "screenCases", cada pantalla del contexto tiene que aparecer como "screenRef" con el nombre EXACTO de la pantalla, una por pantalla, sin omitir ninguna.
- Cada entrada de "traceabilityMatrix" tiene que listar en "caseIds" los ids reales de "acceptanceCases" (y opcionalmente de otras listas) que prueban ese requisito - nunca una lista vacia.

Contenido esperado por seccion:
- "strategy": que se prueba (inScope) y que se deja explicitamente fuera (outOfScope, ej. pruebas de carga/performance si no se pidieron), y una lista de riesgos priorizados (item + nivel alto/medio/bajo + por que).
- "acceptanceCases": un caso de aceptacion por cada regla de negocio relevante, en formato Dado/Cuando/Entonces (Given/When/Then), escrito como lo diria el negocio (lenguaje claro, no tecnico), con "ruleRef" igual al texto exacto de la regla o item de alcance que prueba.
- "endpointCases": por cada endpoint, 3 descripciones de caso: camino feliz (datos validos, resultado esperado), datos invalidos (que rechaza y con que status), acceso no autorizado (sin token o con rol insuficiente, que status devuelve).
- "screenCases": por cada pantalla, 3 descripciones de caso: estado de carga, estado vacio (sin datos todavia), estado de error.
- "e2eFlows": los recorridos principales de punta a punta (basados en el "userJourney" del contexto), como una secuencia de pasos de usuario reales a traves de varias pantallas/endpoints, enlazando los ids de "acceptanceCases"/"endpointCases" relevantes en "relatedCaseIds".
- "securityCases": casos de seguridad - al menos uno de cada tipo: "permisos" (un rol intenta una accion que no le corresponde), "id-adivinado" (acceder a un recurso de otro usuario/proyecto adivinando o cambiando un id en la URL), "token-vencido" (una request con un token JWT expirado o invalido).
- "negativeCases": que tiene que RECHAZAR el sistema (validaciones, duplicados, violaciones de unicidad o de claves foraneas del modelo de datos, etc.) y que respuesta se espera.
- "usabilityCases": casos basicos de usabilidad/accesibilidad (ej. foco de teclado, contraste, mensajes de error entendibles, feedback de carga) relevantes para las pantallas del contexto.
- "testData": que datos de prueba hacen falta por entidad del modelo de datos y en que entorno se prueban (ej. "desarrollo", "staging") - no los datos en si (eso se genera aparte), solo que hace falta y por que.

Respondé SIEMPRE con un unico objeto JSON (nada de texto antes o despues), con esta forma exacta:
{
  "testPlan": {
    "strategy": { "inScope": string[], "outOfScope": string[], "riskPriorities": Array<{ "item": string, "risk": "alto"|"medio"|"bajo", "rationale": string }> },
    "acceptanceCases": Array<{ "id": string, "ruleRef": string, "given": string, "when": string, "then": string }>,
    "endpointCases": Array<{ "endpointRef": string, "happyPath": string, "invalidData": string, "unauthorized": string }>,
    "screenCases": Array<{ "screenRef": string, "loading": string, "empty": string, "error": string }>,
    "e2eFlows": Array<{ "name": string, "steps": string[], "relatedCaseIds": string[] }>,
    "securityCases": Array<{ "id": string, "description": string, "type": "permisos"|"id-adivinado"|"token-vencido" }>,
    "negativeCases": Array<{ "id": string, "description": string, "expectedRejection": string }>,
    "usabilityCases": Array<{ "id": string, "description": string }>,
    "testData": Array<{ "entity": string, "environment": string, "description": string }>,
    "traceabilityMatrix": Array<{ "requirementRef": string, "caseIds": string[] }>
  }
}`;

function describeEndpoint(endpoint) {
  return `${endpoint.method} ${endpoint.path} (entidad: ${endpoint.resourceEntity}) - ${endpoint.description || 'sin descripcion'}`;
}

function describeScreen(screen) {
  return `${screen.name} (roles: ${(screen.visibleToRoles || []).join(', ') || 'no especificado'}) - ${screen.purpose || 'sin proposito declarado'}`;
}

function describeEntity(entity) {
  const attrs = (entity.attributes || []).map((a) => a.name).join(', ');
  return `${entity.name}: ${attrs}`;
}

function buildTestingUserContent({ definition, dataModel, apiSpec, screenMap, architecture, catalogEntry }) {
  const businessRules = deriveBusinessRules({ definition, dataModel, apiSpec });

  return JSON.stringify({
    problema: definition?.problemSummary ?? null,
    usuariosObjetivo: definition?.targetUsers ?? [],
    alcanceMvp: definition?.mvpScope ?? { in: [], out: [] },
    recorridoPrincipal: definition?.userJourney ?? [],
    reglasDeNegocio: businessRules,
    entidades: (dataModel?.entities || []).map(describeEntity),
    endpoints: (dataModel ? apiSpec?.endpoints || [] : []).map(describeEndpoint),
    pantallas: (screenMap?.screens || []).map(describeScreen),
    arquitecturaSeleccionada: catalogEntry?.name ?? architecture?.selectedId ?? null,
  });
}

module.exports = { TESTING_SYSTEM_PROMPT, buildTestingUserContent };
