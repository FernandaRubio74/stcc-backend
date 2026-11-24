/**
 * Forma del plan de pruebas de la etapa "Pruebas" (entre Arquitectura y
 * Revision final). Misma idea que entity.schema.js/endpoint.schema.js: una
 * sola definicion valida tanto la salida de la IA (generate) como la
 * edicion manual (PATCH content), para que ambos caminos nunca puedan dejar
 * el contenido en un estado inconsistente.
 */
const { z } = require('zod');

const riskLevelSchema = z.enum(['alto', 'medio', 'bajo']);

const riskPrioritySchema = z.object({
  item: z.string().min(1),
  risk: riskLevelSchema,
  rationale: z.string().min(1),
});

const strategySchema = z.object({
  inScope: z.array(z.string().min(1)).default([]),
  outOfScope: z.array(z.string().min(1)).default([]),
  riskPriorities: z.array(riskPrioritySchema).default([]),
});

// Caso de aceptacion en formato Dado/Cuando/Entonces, derivado de una regla
// de negocio o requisito del MVP (`ruleRef` es el texto exacto de esa regla
// o item de mvpScope.in - lo usa coverage.js para la matriz de trazabilidad).
const acceptanceCaseSchema = z.object({
  id: z.string().min(1),
  ruleRef: z.string().min(1),
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});

// `endpointRef` tiene que ser exactamente "METODO /ruta" tal como aparece en
// la especificacion de API aprobada (ver coverage.js).
const endpointCaseSchema = z.object({
  endpointRef: z.string().min(1),
  happyPath: z.string().min(1),
  invalidData: z.string().min(1),
  unauthorized: z.string().min(1),
});

// `screenRef` tiene que ser exactamente el nombre de la pantalla tal como
// aparece en el mapa de pantallas (ver coverage.js).
const screenCaseSchema = z.object({
  screenRef: z.string().min(1),
  loading: z.string().min(1),
  empty: z.string().min(1),
  error: z.string().min(1),
});

const e2eFlowSchema = z.object({
  name: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  relatedCaseIds: z.array(z.string().min(1)).default([]),
});

const securityCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(['permisos', 'id-adivinado', 'token-vencido']),
});

const negativeCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  expectedRejection: z.string().min(1),
});

const usabilityCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
});

const testDataSchema = z.object({
  entity: z.string().min(1),
  environment: z.string().min(1),
  description: z.string().min(1),
});

// Cada regla/requisito del MVP enlazado a los ids de los casos que lo
// prueban - es lo que coverage.js usa para detectar requisitos sin ninguna
// prueba asociada.
const traceabilityEntrySchema = z.object({
  requirementRef: z.string().min(1),
  caseIds: z.array(z.string().min(1)).min(1),
});

const testPlanContentSchema = z.object({
  strategy: strategySchema,
  acceptanceCases: z.array(acceptanceCaseSchema).default([]),
  endpointCases: z.array(endpointCaseSchema).default([]),
  screenCases: z.array(screenCaseSchema).default([]),
  e2eFlows: z.array(e2eFlowSchema).default([]),
  securityCases: z.array(securityCaseSchema).default([]),
  negativeCases: z.array(negativeCaseSchema).default([]),
  usabilityCases: z.array(usabilityCaseSchema).default([]),
  testData: z.array(testDataSchema).default([]),
  traceabilityMatrix: z.array(traceabilityEntrySchema).default([]),
});

const aiTestPlanResponseSchema = z.object({ testPlan: testPlanContentSchema });

module.exports = { testPlanContentSchema, aiTestPlanResponseSchema };
