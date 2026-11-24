/**
 * Prueba obligatoria 9 de la revision transversal (regla F.7): un miembro
 * con rol `viewer` no puede MODIFICAR ni GENERAR en ninguna etapa.
 *
 * Hallazgo H-01: las rutas de `refine`, `patch` y `approve` ya exigian rol,
 * pero las de `generate` (modelo de datos, API, pantallas, pruebas), la
 * recomendacion de arquitectura, el chat del wizard, el avance de etapa y
 * la generacion de documentos solo exigian membresia. Un viewer podia
 * sobrescribir el borrador de cualquier etapa con una generacion nueva.
 *
 * La IA se mockea: estas pruebas verifican el guard, no la generacion. Si
 * el guard falla, la request llega al servicio y se nota igual (el status
 * deja de ser 403).
 */
jest.mock('../../src/modules/ai/ai.service');

const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');

function tokenDe(userId, email = 'x@ideator.com') {
  return generateSessionToken({ id: userId, email });
}

async function cleanDatabase() {
  await prisma.generatedDocument.deleteMany({});
  await prisma.projectArchitecture.deleteMany({});
  await prisma.testPlanVersion.deleteMany({});
  await prisma.screenMapVersion.deleteMany({});
  await prisma.apiSpecVersion.deleteMany({});
  await prisma.dataModelVersion.deleteMany({});
  await prisma.blockingQuestion.deleteMany({});
  await prisma.definitionMessage.deleteMany({});
  await prisma.projectDefinition.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function crearProyecto(token, name = 'Proyecto') {
  const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body;
}

let viewerToken;
let projectId;

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();

  const owner = await crearUsuario('owner-viewerperms@ideator.com');
  const viewer = await crearUsuario('viewer-viewerperms@ideator.com');
  const project = await crearProyecto(tokenDe(owner.id));
  await prisma.projectMember.create({ data: { projectId: project.id, userId: viewer.id, role: 'viewer' } });

  viewerToken = tokenDe(viewer.id);
  projectId = project.id;
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

const RUTAS_QUE_GENERAN_O_MODIFICAN = [
  ['POST', '/data-model/generate'],
  ['POST', '/api-spec/generate'],
  ['POST', '/screens/generate'],
  ['POST', '/testing/generate'],
  ['POST', '/architecture/recommend'],
  ['POST', '/definition/messages', { content: 'quiero cambiar el alcance del MVP' }],
  ['POST', '/definition/advance'],
  ['POST', '/documents/spec'],
  ['POST', '/documents/architecture'],
];

describe('un viewer no puede generar ni modificar en ninguna etapa', () => {
  RUTAS_QUE_GENERAN_O_MODIFICAN.forEach(([method, path, body]) => {
    test(`${method} ${path} responde 403 para un viewer`, async () => {
      const res = await request(app)
        [method.toLowerCase()](`/projects/${projectId}${path}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(body || {});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('No tiene permisos para esta accion');
    });
  });
});

describe('un viewer si puede leer todas las etapas', () => {
  ['/data-model', '/api-spec', '/screens', '/testing', '/architecture', '/definition', '/consistency-check', '/review-summary'].forEach((path) => {
    test(`GET ${path} responde 200 para un viewer`, async () => {
      const res = await request(app).get(`/projects/${projectId}${path}`).set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
    });
  });
});
