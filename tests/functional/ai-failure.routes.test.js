/**
 * Prueba obligatoria 10 de la revision transversal (regla F.6): una
 * respuesta invalida o vacia de la IA no deja el proyecto en estado roto y
 * devuelve un error accionable en espanol.
 *
 * Se ejercita de punta a punta (ruta HTTP real) porque el manejo de estos
 * errores vive en los controladores: los tests de servicio ya cubrian que
 * ai.service lance AiResponseValidationError, pero nada verificaba que la
 * ruta lo traduzca a un error accionable ni que el proyecto siga usable y
 * se pueda reintentar.
 */
jest.mock('../../src/modules/ai/ai.service');

const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');
const aiService = require('../../src/modules/ai/ai.service');
const { AiResponseValidationError } = require('../../src/modules/ai/ai.errors');

function tokenDe(userId, email = 'x@ideator.com') {
  return generateSessionToken({ id: userId, email });
}

async function cleanDatabase() {
  await prisma.dataModelVersion.deleteMany({});
  await prisma.blockingQuestion.deleteMany({});
  await prisma.definitionMessage.deleteMany({});
  await prisma.projectDefinition.deleteMany({});
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

const VALID_ENTITIES = [
  { name: 'Paquete', attributes: [{ name: 'id', type: 'uuid', primaryKey: true, unique: true, nullable: false, foreignKey: null }], indexes: [] },
];

let ownerToken;
let projectId;

beforeEach(async () => {
  await cleanDatabase();
  jest.clearAllMocks();

  const owner = await prisma.user.create({ data: { email: 'owner-aifail@ideator.com', fullName: 'Owner' } });
  ownerToken = tokenDe(owner.id);
  const created = await request(app).post('/projects').set('Authorization', `Bearer ${ownerToken}`).send({ name: 'Courier' });
  projectId = created.body.id;

  await prisma.projectDefinition.create({
    data: {
      projectId,
      problemSummary: 'Servicio de courier: clasificar, pesar y etiquetar paquetes',
      targetUsers: [
        { label: 'Revisador', description: 'Clasifica y pesa paquetes' },
        { label: 'Supervisor', description: 'Revisa y consulta historial' },
      ],
      mvpScope: { in: ['Clasificar paquetes'], out: ['Pagos en linea'] },
      userJourney: ['Clasifica el paquete'],
    },
  });
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe('POST /projects/:projectId/data-model/generate con la IA fallando', () => {
  test('una respuesta invalida de la IA devuelve un error accionable y no persiste ninguna version', async () => {
    aiService.requestStructuredJson.mockRejectedValueOnce(
      new AiResponseValidationError('La respuesta de la IA no cumple el contrato esperado para esta tarea')
    );

    const res = await request(app)
      .post(`/projects/${projectId}/data-model/generate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/asistente de IA no esta disponible/i);
    expect(res.body.error).toMatch(/intenta de nuevo/i);

    const versiones = await prisma.dataModelVersion.findMany({ where: { projectId } });
    expect(versiones).toEqual([]);
  });

  test('el proyecto no queda roto: el reintento siguiente funciona', async () => {
    aiService.requestStructuredJson.mockRejectedValueOnce(new AiResponseValidationError('vacio'));

    const fallo = await request(app)
      .post(`/projects/${projectId}/data-model/generate`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(fallo.status).toBe(500);

    aiService.requestStructuredJson.mockResolvedValueOnce({ entities: VALID_ENTITIES });

    const reintento = await request(app)
      .post(`/projects/${projectId}/data-model/generate`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(reintento.status).toBe(201);
    expect(reintento.body.entities).toHaveLength(1);
    expect(reintento.body.status).toBe('DRAFT');
  });

  test('el chequeo de consistencia sigue respondiendo despues de un fallo de IA', async () => {
    aiService.requestStructuredJson.mockRejectedValueOnce(new AiResponseValidationError('vacio'));
    await request(app).post(`/projects/${projectId}/data-model/generate`).set('Authorization', `Bearer ${ownerToken}`);

    const res = await request(app)
      .get(`/projects/${projectId}/consistency-check`)
      .set('Authorization', `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.issues).toEqual([]);
    expect(res.body.status).toBe('pendiente');
  });
});
