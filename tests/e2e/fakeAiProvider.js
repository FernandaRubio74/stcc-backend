/**
 * T-026.1 - Doble determinista del proveedor de IA para la suite E2E.
 *
 * El servidor real de la app corre en su propio proceso de Node en CI
 * (ver ci.yml), asi que mockear nuestro modulo ai.service (como hacen los
 * tests funcionales con jest.mock) no cruza ese limite de proceso. En vez
 * de eso, este script levanta un servidor HTTP que imita la superficie del
 * proveedor real (POST {AI_ENDPOINT}/chat/completions) y responde siempre
 * lo mismo segun el prompt de sistema recibido, para no depender de un
 * proveedor de IA real (ni de su variabilidad) en CI.
 */
const http = require('http');

const PORT = Number(process.env.AI_FAKE_PROVIDER_PORT) || 4010;

function detectTask(systemPrompt) {
  if (systemPrompt.includes('guia a una persona a definir')) return 'PROBLEM_CONTEXT';
  if (systemPrompt.includes('usuarios objetivo, los resultados esperados')) return 'TARGET_USERS_SCOPE';
  if (systemPrompt.includes('proponer un modelo de base de datos relacional')) return 'DATA_MODEL';
  if (systemPrompt.includes('especificacion de la API REST')) return 'API_SPEC';
  // T-040.1: se agregan SCREENS y ARCHITECTURE para que la suite E2E de
  // cierre (US-040) pueda recorrer el flujo completo hasta los documentos.
  if (systemPrompt.includes('proponer el mapa de pantallas')) return 'SCREENS';
  if (systemPrompt.includes('catalogo FIJO de escenarios de arquitectura')) return 'ARCHITECTURE';
  throw new Error('fakeAiProvider: no se pudo identificar la tarea a partir del system prompt');
}

const RESPONSES = {
  PROBLEM_CONTEXT: () => ({
    reply: 'Entendido, ya tengo claro el problema y el contexto.',
    stageComplete: true,
    blockingQuestions: [],
    extracted: {
      problemSummary: 'Los agentes de soporte no logran priorizar los tickets que llegan.',
    },
  }),
  TARGET_USERS_SCOPE: () => ({
    reply: 'Perfecto, ya tengo los usuarios objetivo y el alcance del MVP.',
    stageComplete: true,
    blockingQuestions: [],
    extracted: {
      targetUsers: [{ label: 'Agente de soporte', description: 'Atiende y prioriza tickets entrantes' }],
      mvpScope: { in: ['Priorizacion automatica de tickets'], out: ['Reportes avanzados'] },
      userJourney: ['El agente inicia sesion', 'Revisa la cola priorizada', 'Resuelve el ticket'],
    },
  }),
  DATA_MODEL: () => ({
    entities: [
      {
        name: 'Ticket',
        attributes: [
          { name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null },
          { name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null },
          {
            name: 'agentId',
            type: 'uuid',
            primaryKey: false,
            unique: false,
            nullable: true,
            foreignKey: { entity: 'Agent', attribute: 'id' },
          },
        ],
        indexes: [],
      },
      {
        name: 'Agent',
        attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: false, nullable: false, foreignKey: null }],
        indexes: [],
      },
    ],
  }),
  API_SPEC: () => ({
    endpoints: [
      {
        method: 'GET',
        path: '/tickets',
        description: 'Lista tickets',
        resourceEntity: 'Ticket',
        parameters: [],
        responses: [
          { status: 200, description: 'ok' },
          { status: 401, description: 'no autenticado' },
        ],
      },
      {
        method: 'POST',
        path: '/tickets',
        description: 'Crea un ticket',
        resourceEntity: 'Ticket',
        parameters: [],
        responses: [
          { status: 201, description: 'creado' },
          { status: 401, description: 'no autenticado' },
          { status: 403, description: 'no autorizado' },
        ],
      },
      {
        method: 'GET',
        path: '/agents',
        description: 'Lista agentes',
        resourceEntity: 'Agent',
        parameters: [],
        responses: [
          { status: 200, description: 'ok' },
          { status: 401, description: 'no autenticado' },
        ],
      },
    ],
  }),
  // Las palabras clave de las pantallas tienen que cubrir "Priorizacion
  // automatica de tickets" (mvpScope.in) y ninguna puede mencionar "Reportes
  // avanzados" (mvpScope.out), o la revision final (US-032) nunca llegaria a
  // readyToGenerate: true.
  SCREENS: () => ({
    screens: [
      {
        name: 'Cola de tickets',
        purpose: 'Permite priorizar automaticamente los tickets entrantes',
        mainElements: ['Lista de tickets', 'Boton priorizar'],
        visibleToRoles: ['owner', 'editor'],
      },
      {
        name: 'Detalle de ticket',
        purpose: 'Muestra el detalle de un ticket y el agente asignado',
        mainElements: ['Datos del ticket', 'Agente asignado'],
        visibleToRoles: ['owner', 'editor', 'viewer'],
      },
      {
        name: 'Listado de agentes',
        purpose: 'Lista los agentes disponibles para asignacion',
        mainElements: ['Lista de agentes'],
        visibleToRoles: ['owner'],
      },
    ],
    navigation: [
      { from: 'Cola de tickets', to: 'Detalle de ticket', label: 'Ver detalle del ticket' },
      { from: 'Detalle de ticket', to: 'Listado de agentes', label: 'Ver agentes disponibles' },
    ],
  }),
  ARCHITECTURE: () => ({
    recommendedId: 'monolito-modular',
    justification:
      'El dominio es chico (Ticket, Agent) y la API tiene pocos endpoints: un monolito modular alcanza sin la complejidad operativa de microservicios o serverless.',
  }),
};

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404).end();
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      const systemMessage = parsed.messages.find((m) => m.role === 'system');
      const task = detectTask(systemMessage?.content || '');
      const content = JSON.stringify(RESPONSES[task]());

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(err.message || err) }));
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`fakeAiProvider escuchando en :${PORT}`);
});
