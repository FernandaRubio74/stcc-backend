/**
 * T-015.4/T-016.4/T-017.4 - Tests del servicio del wizard conversacional.
 *
 * Corre contra Postgres real (patron de members.service.test.js); lo unico
 * que se mockea es la IA (deps.ai), igual que sso.service.test.js mockea el
 * cliente de Google.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const definitionService = require('../../src/modules/definition/definition.service');
const { StageBlockedError, NoNextStageError } = require('../../src/modules/definition/definition.errors');
const { AiTimeoutError } = require('../../src/modules/ai/ai.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

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

    const updated = await definitionService.advanceStage(project.id);

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
    await definitionService.advanceStage(project.id);

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
});
