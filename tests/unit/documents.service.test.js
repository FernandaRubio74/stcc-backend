/**
 * T-035.3/T-035.4 - Tests del servicio de documentos contra Postgres real:
 * precondicion de "listo para generar" (US-032), versionado por tipo de
 * documento y aislamiento entre proyectos.
 */
const { PrismaClient } = require('@prisma/client');
const projectsService = require('../../src/modules/projects/projects.service');
const documentsService = require('../../src/modules/documents/documents.service');
const { ProjectNotReadyError, DocumentNotFoundError } = require('../../src/modules/documents/documents.errors');

const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });

async function cleanDatabase() {
  await prisma.generatedDocument.deleteMany({});
  await prisma.projectArchitecture.deleteMany({});
  await prisma.screenMap.deleteMany({});
  await prisma.apiSpecVersion.deleteMany({});
  await prisma.dataModelVersion.deleteMany({});
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

const VALID_ENTITIES = [
  {
    name: 'Ticket',
    attributes: [{ name: 'title', type: 'string', primaryKey: false, unique: false, nullable: false, foreignKey: null }],
    indexes: [],
  },
];
const VALID_ENDPOINTS = [
  {
    method: 'GET',
    path: '/tickets',
    description: 'Lista tickets',
    resourceEntity: 'Ticket',
    parameters: [],
    responses: [{ status: 200, description: 'ok' }],
  },
];

async function crearProyectoBase() {
  const owner = await prisma.user.create({
    data: { email: `owner-${Date.now()}-${Math.random()}@ideator.com`, fullName: 'Owner' },
  });
  const project = await projectsService.createProject({ name: 'Proyecto', userId: owner.id });
  return { owner, project };
}

/** Mismo fixture que el de US-032: deja el proyecto en estado listo para generar. */
async function completarTodasLasEtapas(project, owner) {
  await prisma.projectDefinition.create({
    data: {
      projectId: project.id,
      problemSummary: 'resumen',
      targetUsers: [{ label: 'Cliente', description: 'x' }],
      mvpScope: { in: ['feature'], out: [] },
      userJourney: ['paso 1'],
    },
  });
  await prisma.dataModelVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      status: 'APPROVED',
      entities: VALID_ENTITIES,
      createdById: owner.id,
      approvedById: owner.id,
      approvedAt: new Date(),
    },
  });
  await prisma.apiSpecVersion.create({
    data: {
      projectId: project.id,
      versionNumber: 1,
      status: 'APPROVED',
      endpoints: VALID_ENDPOINTS,
      createdById: owner.id,
      approvedById: owner.id,
      approvedAt: new Date(),
    },
  });
  await prisma.screenMap.create({
    data: {
      projectId: project.id,
      screens: [
        { name: 'Tickets', purpose: 'feature para el cliente', mainElements: ['lista'], visibleToRoles: ['owner'] },
      ],
      navigation: [],
      diagram: 'flowchart TD',
      createdById: owner.id,
    },
  });
  await prisma.projectArchitecture.create({
    data: { projectId: project.id, selectedId: 'monolito-modular', selectedAt: new Date(), selectedById: owner.id },
  });
}

describe('generateSpecDocument', () => {
  test('bloquea la generacion si el proyecto no esta listo y detalla los bloqueos', async () => {
    const { owner, project } = await crearProyectoBase();

    await expect(documentsService.generateSpecDocument(project.id, owner.id)).rejects.toThrow(ProjectNotReadyError);

    try {
      await documentsService.generateSpecDocument(project.id, owner.id);
    } catch (err) {
      expect(err.blockers.stages.definition.complete).toBe(false);
      expect(err.blockers).toHaveProperty('blockingQuestions');
      expect(err.blockers).toHaveProperty('inconsistencies');
    }

    expect(await prisma.generatedDocument.count({ where: { projectId: project.id } })).toBe(0);
  });

  test('bloquea la generacion si queda una pregunta bloqueante abierta', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);
    await prisma.blockingQuestion.create({
      data: { projectId: project.id, stage: 'PROBLEM_CONTEXT', question: 'falta definir algo' },
    });

    await expect(documentsService.generateSpecDocument(project.id, owner.id)).rejects.toThrow(ProjectNotReadyError);
  });

  test('genera y persiste la version 1 cuando el proyecto esta listo', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);

    const document = await documentsService.generateSpecDocument(project.id, owner.id);

    expect(document.kind).toBe('SPEC');
    expect(document.versionNumber).toBe(1);
    expect(document.content).toContain('# Especificacion del producto');
    expect(document.content).toContain('## 5. Modelo de datos');
    expect(document.content).toContain('Ticket');

    const persisted = await prisma.generatedDocument.findMany({ where: { projectId: project.id } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0].createdById).toBe(owner.id);
  });

  test('regenerar crea una version nueva sin pisar la anterior', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);

    const v1 = await documentsService.generateSpecDocument(project.id, owner.id);
    const v2 = await documentsService.generateSpecDocument(project.id, owner.id);

    expect(v1.versionNumber).toBe(1);
    expect(v2.versionNumber).toBe(2);

    const versiones = await prisma.generatedDocument.findMany({
      where: { projectId: project.id, kind: 'SPEC' },
      orderBy: { versionNumber: 'asc' },
    });
    expect(versiones.map((doc) => doc.versionNumber)).toEqual([1, 2]);
    expect(versiones[0].content).toBe(v1.content);
  });
});

describe('listDocuments / getDocument', () => {
  test('el historial trae las versiones generadas sin el contenido', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);
    await documentsService.generateSpecDocument(project.id, owner.id);
    await documentsService.generateSpecDocument(project.id, owner.id);

    const historial = await documentsService.listDocuments(project.id);

    expect(historial).toHaveLength(2);
    expect(historial[0]).not.toHaveProperty('content');
    // Mas reciente primero dentro de cada tipo de documento.
    expect(historial.map((doc) => doc.versionNumber)).toEqual([2, 1]);
  });

  test('getDocument devuelve el contenido de una version puntual', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);
    const generado = await documentsService.generateSpecDocument(project.id, owner.id);

    const leido = await documentsService.getDocument(project.id, generado.id);

    expect(leido.content).toBe(generado.content);
  });

  test('no permite leer un documento de otro proyecto conociendo su id', async () => {
    const { owner, project } = await crearProyectoBase();
    await completarTodasLasEtapas(project, owner);
    const generado = await documentsService.generateSpecDocument(project.id, owner.id);
    const otro = await crearProyectoBase();

    await expect(documentsService.getDocument(otro.project.id, generado.id)).rejects.toThrow(DocumentNotFoundError);
  });
});
