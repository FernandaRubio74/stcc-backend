/**
 * T-015.4/T-016.4/T-017.4 - Tests del servicio del wizard conversacional.
 *
 * Corre contra Postgres real (patron de members.service.test.js); lo unico
 * que se mockea es la IA (deps.ai), igual que sso.service.test.js mockea el
 * cliente de Google.
 */
const { PrismaClient } = require('@prisma/client');
const { withFieldEncryption } = require('../../src/database/fieldEncryption');
const projectsService = require('../../src/modules/projects/projects.service');
const definitionService = require('../../src/modules/definition/definition.service');
const { StageBlockedError, NoNextStageError } = require('../../src/modules/definition/definition.errors');
const { AiTimeoutError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = withFieldEncryption(new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } }));

async function cleanDatabase() {
  await prisma.blockingQuestion.deleteMany({});
  await prisma.definitionMessage.deleteMany({});
  await prisma.projectDefinition.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

async function crearProyectoConOwner() {
  const owner = await prisma.user.create({ data: { email: 'owner@ideator.com', fullName: 'Owner' } });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  return { owner, project };
}

function fakeAi(result) {
  return { requestStructuredTurn: jest.fn().mockResolvedValue(result) };
}

describe('postMessage', () => {
  test('crea la definicion de forma perezosa, persiste ambos mensajes y actualiza problemSummary', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'Contame mas',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'Resumen parcial' },
    });

    const result = await definitionService.postMessage(
      { projectId: project.id, userId: owner.id, content: 'Tengo un problema de X' },
      { ai }
    );

    expect(result.stage).toBe('PROBLEM_CONTEXT');
    expect(result.reply).toBe('Contame mas');
    expect(result.definition.problemSummary).toBe('Resumen parcial');

    const messages = await prisma.definitionMessage.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'Tengo un problema de X', createdById: owner.id });
    expect(messages[1]).toMatchObject({ role: 'assistant', content: 'Contame mas', createdById: null });
  });

  test('crea una blocking question cuando la IA la reporta', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'Necesito saber mas',
      stageComplete: false,
      blockingQuestions: ['¿Quien sufre este problema?'],
      extracted: {},
    });

    const result = await definitionService.postMessage(
      { projectId: project.id, userId: owner.id, content: 'hola' },
      { ai }
    );

    expect(result.blockingQuestions).toEqual(['¿Quien sufre este problema?']);
    const open = await prisma.blockingQuestion.findMany({ where: { projectId: project.id, resolvedAt: null } });
    expect(open).toHaveLength(1);
  });

  test('resuelve una blocking question previa cuando la IA deja de reportarla', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const aiPrimero = fakeAi({
      reply: 'r1',
      stageComplete: false,
      blockingQuestions: ['¿Quien sufre este problema?'],
      extracted: {},
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai: aiPrimero });

    const aiSegundo = fakeAi({
      reply: 'r2',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'Ya quedo claro' },
    });
    const result = await definitionService.postMessage(
      { projectId: project.id, userId: owner.id, content: 'Lo sufren los clientes' },
      { ai: aiSegundo }
    );

    expect(result.blockingQuestions).toEqual([]);
    const open = await prisma.blockingQuestion.findMany({ where: { projectId: project.id, resolvedAt: null } });
    expect(open).toHaveLength(0);
    const resolved = await prisma.blockingQuestion.findMany({ where: { projectId: project.id } });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].resolvedAt).not.toBeNull();
  });

  test('no pierde el mensaje del usuario si la IA falla', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = { requestStructuredTurn: jest.fn().mockRejectedValue(new AiTimeoutError()) };

    await expect(
      definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'mensaje importante' }, { ai })
    ).rejects.toThrow(AiTimeoutError);

    const messages = await prisma.definitionMessage.findMany({ where: { projectId: project.id } });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ role: 'user', content: 'mensaje importante' });
  });
});

describe('postMessage - agente de sugerencias (separado del agente principal)', () => {
  test('devuelve las sugerencias que propone el segundo agente, basadas en la respuesta del primero', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = {
      requestStructuredTurn: jest.fn().mockResolvedValue({
        reply: '¿Para quién es este problema?',
        stageComplete: false,
        blockingQuestions: [],
        extracted: { problemSummary: 'Parcial' },
      }),
      requestSuggestions: jest.fn().mockResolvedValue([
        'Es para los clientes de mi local',
        'Es para mi equipo interno',
      ]),
    };

    const result = await definitionService.postMessage(
      { projectId: project.id, userId: owner.id, content: 'Tengo un problema de demoras' },
      { ai }
    );

    expect(result.suggestions).toEqual(['Es para los clientes de mi local', 'Es para mi equipo interno']);
    // El agente de sugerencias recibe la respuesta del agente principal, no
    // el mensaje del usuario - prueba real de que estan coordinados en
    // secuencia (uno alimenta al otro).
    const [callArgs] = ai.requestSuggestions.mock.calls[0];
    expect(callArgs.userContent).toContain('¿Para quién es este problema?');
  });

  test('degrada a sugerencias vacias si el agente de sugerencias falla, sin afectar la respuesta principal', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = {
      requestStructuredTurn: jest.fn().mockResolvedValue({
        reply: 'Contame mas',
        stageComplete: false,
        blockingQuestions: [],
        extracted: { problemSummary: 'Parcial' },
      }),
      requestSuggestions: jest.fn().mockRejectedValue(new Error('el agente de sugerencias no respondio')),
    };

    const result = await definitionService.postMessage(
      { projectId: project.id, userId: owner.id, content: 'hola' },
      { ai }
    );

    expect(result.reply).toBe('Contame mas');
    expect(result.suggestions).toEqual([]);
  });

  test('degrada a sugerencias vacias si deps.ai no implementa requestSuggestions (compatibilidad con mocks viejos)', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'Contame mas',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'Parcial' },
    });

    const result = await definitionService.postMessage(
      { projectId: project.id, userId: owner.id, content: 'hola' },
      { ai }
    );

    expect(result.suggestions).toEqual([]);
  });
});

describe('getDefinitionState', () => {
  test('devuelve el historial completo y permite retomar donde se dejo', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'ok',
      stageComplete: false,
      blockingQuestions: ['pendiente'],
      extracted: { problemSummary: 'resumen' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });

    const state = await definitionService.getDefinitionState(project.id);

    expect(state.currentStage).toBe('PROBLEM_CONTEXT');
    expect(state.problemSummary).toBe('resumen');
    expect(state.messages).toHaveLength(2);
    expect(state.blockingQuestions).toHaveLength(1);
    expect(state.blockingQuestions[0]).toMatchObject({ stage: 'PROBLEM_CONTEXT', question: 'pendiente' });
  });

  test('crea la definicion con la etapa inicial si todavia no existe ningun mensaje', async () => {
    const { project } = await crearProyectoConOwner();

    const state = await definitionService.getDefinitionState(project.id);

    expect(state.currentStage).toBe('PROBLEM_CONTEXT');
    expect(state.messages).toEqual([]);
    expect(state.blockingQuestions).toEqual([]);
  });

  test('ofrece sugerencias de ejemplo fijas (sin costo de IA) cuando el proyecto todavia no tiene mensajes', async () => {
    const { project } = await crearProyectoConOwner();

    const state = await definitionService.getDefinitionState(project.id);

    expect(state.suggestions.length).toBeGreaterThan(0);
  });

  test('no ofrece sugerencias de ejemplo una vez que ya hay conversacion (esas vienen de postMessage)', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'ok',
      stageComplete: false,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });

    const state = await definitionService.getDefinitionState(project.id);

    expect(state.suggestions).toEqual([]);
  });

  test('vuelve a ofrecer sugerencias de ejemplo (propias de la etapa 2) al avanzar a una etapa sin mensajes', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'r',
      stageComplete: true,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen completo' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });
    await definitionService.advanceStage(project.id, { ai });

    const state = await definitionService.getDefinitionState(project.id);

    expect(state.currentStage).toBe('TARGET_USERS_SCOPE');
    expect(state.suggestions.length).toBeGreaterThan(0);
  });

  test('stageComplete es false si a la etapa actual todavia le falta informacion', async () => {
    const { project } = await crearProyectoConOwner();

    const state = await definitionService.getDefinitionState(project.id);

    expect(state.stageComplete).toBe(false);
  });

  test('stageComplete es true en cuanto la etapa actual queda completa, sin depender de volver a llamar a postMessage', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'r',
      stageComplete: true,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen completo' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });

    // Mismo GET que dispara un refresco de pantalla (ej. recargar la pagina):
    // tiene que reflejar la etapa completa sin pasar de nuevo por postMessage.
    const state = await definitionService.getDefinitionState(project.id);

    expect(state.currentStage).toBe('PROBLEM_CONTEXT');
    expect(state.stageComplete).toBe(true);
  });
});

describe('advanceStage', () => {
  test('lanza StageBlockedError si hay preguntas bloqueantes abiertas', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'r',
      stageComplete: false,
      blockingQuestions: ['falta algo'],
      extracted: { problemSummary: 'resumen' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });

    await expect(definitionService.advanceStage(project.id)).rejects.toThrow(StageBlockedError);
  });

  test('lanza StageBlockedError por regla de completitud aunque no haya blocking questions de la IA', async () => {
    const { project } = await crearProyectoConOwner();

    await expect(definitionService.advanceStage(project.id)).rejects.toThrow(StageBlockedError);
  });

  test('avanza de PROBLEM_CONTEXT a TARGET_USERS_SCOPE cuando los datos estan completos y no hay bloqueos', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = fakeAi({
      reply: 'r',
      stageComplete: true,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen completo' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });

    const updated = await definitionService.advanceStage(project.id, { ai });

    expect(updated.currentStage).toBe('TARGET_USERS_SCOPE');
  });

  test('lanza NoNextStageError si ya se completo la ultima etapa', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai1 = fakeAi({
      reply: 'r',
      stageComplete: true,
      blockingQuestions: [],
      extracted: { problemSummary: 'resumen completo' },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai: ai1 });
    await definitionService.advanceStage(project.id, { ai: ai1 });

    const ai2 = fakeAi({
      reply: 'r',
      stageComplete: true,
      blockingQuestions: [],
      extracted: {
        targetUsers: [{ label: 'Admin', description: 'Gestiona el sistema' }],
        mvpScope: { in: ['login'], out: ['reportes'] },
        userJourney: ['Se registra', 'Inicia sesion'],
      },
    });
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola 2' }, { ai: ai2 });

    await expect(definitionService.advanceStage(project.id)).rejects.toThrow(NoNextStageError);
  });

  test('anuncia explicitamente el cambio de etapa como mensaje del asistente, con sugerencias para responderlo', async () => {
    const { owner, project } = await crearProyectoConOwner();
    const ai = {
      requestStructuredTurn: jest.fn().mockResolvedValue({
        reply: 'r',
        stageComplete: true,
        blockingQuestions: [],
        extracted: { problemSummary: 'Demoras en la atención por WhatsApp' },
      }),
      requestSuggestions: jest.fn().mockResolvedValue(['Es para los clientes finales', 'Es para mi equipo']),
    };
    await definitionService.postMessage({ projectId: project.id, userId: owner.id, content: 'hola' }, { ai });

    const result = await definitionService.advanceStage(project.id, { ai });

    expect(result.currentStage).toBe('TARGET_USERS_SCOPE');
    expect(result.suggestions).toEqual(['Es para los clientes finales', 'Es para mi equipo']);

    const messages = await prisma.definitionMessage.findMany({
      where: { projectId: project.id, stage: 'TARGET_USERS_SCOPE' },
      orderBy: { createdAt: 'asc' },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('assistant');
    // El anuncio tiene que mencionar explicitamente que se avanzo de etapa,
    // no ser indistinguible de una pregunta mas de la conversacion.
    expect(messages[0].content).toMatch(/avanzamos de etapa/i);
  });
});
