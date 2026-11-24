/**
 * T-042.2 - Matriz de auditoria ejecutable: cada endpoint de proyecto
 * documentado en docs/security/audit-endpoints.md se ejercita contra el
 * servidor real, tanto por un usuario ajeno (ID adivinado: 404, nunca
 * filtra que el proyecto existe) como, donde corresponde, por un miembro
 * sin el rol requerido (403).
 */
const request = require('supertest');
const { generateSessionToken } = require('../../src/modules/auth/token.service');
const app = require('../../src/app');
const prisma = require('../../src/database/client');

function tokenDe(userId, email = 'x@ideator.com') {
  return generateSessionToken({ id: userId, email });
}

function crearUsuario(email) {
  return prisma.user.create({ data: { email, fullName: 'Usuario' } });
}

async function cleanDatabase() {
  await prisma.generatedDocument.deleteMany({});
  await prisma.projectArchitecture.deleteMany({});
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

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

// Rutas de proyecto que CUALQUIER miembro puede llamar (no exigen rol
// especifico). Se ejercitan solo con el usuario ajeno (404): un miembro
// cualquiera, con cualquier rol, tiene que poder pasar el guard de
// membresia.
const RUTAS_DE_MIEMBRO = [
  ['get', (id) => `/projects/${id}`],
  ['get', (id) => `/projects/${id}/members`],
  ['get', (id) => `/projects/${id}/definition`],
  ['post', (id) => `/projects/${id}/definition/messages`, { content: 'x' }],
  ['get', (id) => `/projects/${id}/definition/blocking-questions`],
  ['post', (id) => `/projects/${id}/definition/advance`],
  ['get', (id) => `/projects/${id}/data-model`],
  ['post', (id) => `/projects/${id}/data-model/generate`],
  ['get', (id) => `/projects/${id}/api-spec`],
  ['post', (id) => `/projects/${id}/api-spec/generate`],
  ['get', (id) => `/projects/${id}/screens`],
  ['post', (id) => `/projects/${id}/screens/generate`],
  ['get', (id) => `/projects/${id}/architecture/catalog`],
  ['get', (id) => `/projects/${id}/architecture`],
  ['post', (id) => `/projects/${id}/architecture/recommend`],
  ['get', (id) => `/projects/${id}/consistency-check`],
  ['post', (id) => `/projects/${id}/consistency-check/final-generation`],
  ['get', (id) => `/projects/${id}/review-summary`],
  ['post', (id) => `/projects/${id}/documents/spec`],
  ['post', (id) => `/projects/${id}/documents/architecture`],
  ['get', (id) => `/projects/${id}/documents`],
  ['get', (id) => `/projects/${id}/documents/bundle`],
  ['get', (id) => `/projects/${id}/documents/00000000-0000-0000-0000-000000000000`],
];

// Rutas que exigen rol owner: ademas del ajeno (404), se chequea que un
// miembro con rol viewer las tenga vedadas (403).
const RUTAS_DE_OWNER = [
  ['patch', (id) => `/projects/${id}`, { name: 'Otro nombre' }],
  ['delete', (id) => `/projects/${id}`],
  ['post', (id) => `/projects/${id}/members`, { email: 'nuevo@ideator.com', role: 'viewer' }],
  ['post', (id) => `/projects/${id}/data-model/approve`],
  ['post', (id) => `/projects/${id}/api-spec/approve`],
  ['post', (id) => `/projects/${id}/screens/approve`],
  ['post', (id) => `/projects/${id}/architecture/select`, { architectureId: 'monolito-modular' }],
];

async function crearProyecto(token, name = 'Proyecto Auditoria') {
  const res = await request(app).post('/projects').set('Authorization', `Bearer ${token}`).send({ name });
  return res.body;
}

function enviar(req, [method, buildPath, body], projectId, token) {
  let r = request(app)[method](buildPath(projectId)).set('Authorization', `Bearer ${token}`);
  if (body) r = r.send(body);
  return r;
}

describe('Auditoria de endpoints de proyecto (T-042.2)', () => {
  test('un usuario ajeno recibe 404 en TODAS las rutas de miembro (ID adivinado, no filtra existencia)', async () => {
    const owner = await crearUsuario(`owner-aud1-${Date.now()}@ideator.com`);
    const ajeno = await crearUsuario(`ajeno-aud1-${Date.now()}@ideator.com`);
    const project = await crearProyecto(tokenDe(owner.id));
    const ajenoToken = tokenDe(ajeno.id);

    for (const ruta of RUTAS_DE_MIEMBRO) {
      const res = await enviar(request, ruta, project.id, ajenoToken);
      expect([ruta[0], ruta[1](project.id), res.status]).toEqual([ruta[0], ruta[1](project.id), 404]);
    }
  });

  test('un usuario ajeno recibe 404 en TODAS las rutas que exigen owner', async () => {
    const owner = await crearUsuario(`owner-aud2-${Date.now()}@ideator.com`);
    const ajeno = await crearUsuario(`ajeno-aud2-${Date.now()}@ideator.com`);
    const project = await crearProyecto(tokenDe(owner.id));
    const ajenoToken = tokenDe(ajeno.id);

    for (const ruta of RUTAS_DE_OWNER) {
      const res = await enviar(request, ruta, project.id, ajenoToken);
      expect([ruta[0], ruta[1](project.id), res.status]).toEqual([ruta[0], ruta[1](project.id), 404]);
    }
  });

  test('un miembro con rol viewer recibe 403 en TODAS las rutas que exigen owner', async () => {
    const owner = await crearUsuario(`owner-aud3-${Date.now()}@ideator.com`);
    const viewer = await crearUsuario(`viewer-aud3-${Date.now()}@ideator.com`);
    const project = await crearProyecto(tokenDe(owner.id));

    await prisma.projectMember.create({
      data: { projectId: project.id, userId: viewer.id, role: 'viewer', createdById: owner.id },
    });
    const viewerToken = tokenDe(viewer.id);

    for (const ruta of RUTAS_DE_OWNER) {
      const res = await enviar(request, ruta, project.id, viewerToken);
      expect([ruta[0], ruta[1](project.id), res.status]).toEqual([ruta[0], ruta[1](project.id), 403]);
    }
  });

  test('el propio owner puede pasar el guard de membresia en todas las rutas de miembro (sanity check: no es 404 universal)', async () => {
    const owner = await crearUsuario(`owner-aud4-${Date.now()}@ideator.com`);
    const project = await crearProyecto(tokenDe(owner.id));
    const ownerToken = tokenDe(owner.id);

    // GET .../documents/:documentId con un id inexistente responde 404 por
    // "documento no encontrado" (DocumentNotFoundError), un 404 legitimo de
    // la app, no del guard de membresia: se excluye de este sanity check
    // puntual (en el test de ajeno de arriba ambos 404 son, a proposito,
    // indistinguibles).
    const rutas = RUTAS_DE_MIEMBRO.filter((ruta) => !ruta[1]('x').includes('/documents/0000'));

    for (const ruta of rutas) {
      const res = await enviar(request, ruta, project.id, ownerToken);
      // No necesariamente 200/201 (p. ej. data-model/generate sin definicion
      // responde 409): lo que importa es que el guard de membresia lo deje
      // pasar, nunca 404 ni 401.
      expect(res.status).not.toBe(404);
      expect(res.status).not.toBe(401);
    }
  });
});
