/**
 * T-013.2 - E2E de login via SSO (proveedor simulado).
 *
 * La app corre en este mismo proceso con Postgres real. Lo unico que se
 * simula es el cliente de Google (src/config/googleOAuth), el limite externo.
 * Se prueba el flujo completo: callback SSO -> usuario creado en la base ->
 * token usable en rutas protegidas.
 *
 * El callback nunca responde JSON: redirige (302) al frontend con la sesion
 * en la query string (ver T-011.2/T-011.3, fix/T-011-sso-callback-redirect).
 */
jest.mock("../../src/config/googleOAuth", () => ({
  googleOAuthClient: {
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    verifyIdToken: jest.fn(),
  },
}));

const request = require("supertest");
const { googleOAuthClient } = require("../../src/config/googleOAuth");
const prisma = require("../../src/database/client");
const app = require("../../src/app");

function googleResponde({ email, name, sub }) {
  googleOAuthClient.getToken.mockResolvedValue({ tokens: { id_token: "fake-id-token" } });
  googleOAuthClient.verifyIdToken.mockResolvedValue({
    getPayload: () => ({ email, name, sub }),
  });
}

function locationDe(res) {
  return new URL(res.headers.location);
}

async function cleanDatabase() {
  await prisma.projectMember.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.user.deleteMany({});
}

beforeEach(async () => {
  jest.clearAllMocks();
  await cleanDatabase();
});

afterAll(async () => {
  await cleanDatabase();
  await prisma.$disconnect();
});

describe("E2E - Login via SSO", () => {
  test("un usuario nuevo se provisiona y se redirige al frontend con un token", async () => {
    googleResponde({ email: "sso-nuevo@ideator.com", name: "Persona SSO", sub: "google-sub-1" });

    const res = await request(app).get("/auth/sso/callback?code=codigo-valido").redirects(0);

    expect(res.status).toBe(302);
    const location = locationDe(res);
    expect(location.pathname).toBe("/auth/sso/callback");
    expect(location.searchParams.get("token")).toEqual(expect.any(String));
    expect(location.searchParams.get("email")).toBe("sso-nuevo@ideator.com");

    const enBase = await prisma.user.findUnique({ where: { email: "sso-nuevo@ideator.com" } });
    expect(enBase).not.toBeNull();
    expect(enBase.authProvider).toBe("google");
    expect(enBase.passwordHash).toBeNull();
  });

  test("el token de SSO funciona en rutas protegidas", async () => {
    googleResponde({ email: "sso-flujo@ideator.com", name: "Flujo SSO", sub: "google-sub-2" });

    const login = await request(app).get("/auth/sso/callback?code=codigo-valido").redirects(0);
    const token = `Bearer ${locationDe(login).searchParams.get("token")}`;

    const creado = await request(app)
      .post("/projects")
      .set("Authorization", token)
      .send({ name: "Proyecto via SSO" });
    expect(creado.status).toBe(201);

    const leido = await request(app).get(`/projects/${creado.body.id}`).set("Authorization", token);
    expect(leido.status).toBe(200);
    expect(leido.body.role).toBe("owner");
  });

  test("un segundo login SSO no duplica al usuario", async () => {
    googleResponde({ email: "sso-repetido@ideator.com", name: "Repetido", sub: "google-sub-3" });

    const primero = await request(app).get("/auth/sso/callback?code=codigo-valido").redirects(0);
    const segundo = await request(app).get("/auth/sso/callback?code=codigo-valido").redirects(0);

    expect(primero.status).toBe(302);
    expect(segundo.status).toBe(302);
    expect(locationDe(segundo).searchParams.get("id")).toBe(locationDe(primero).searchParams.get("id"));
    expect(await prisma.user.count({ where: { email: "sso-repetido@ideator.com" } })).toBe(1);
  });

  test("sin code redirige al login con ssoError y no crea usuarios", async () => {
    const res = await request(app).get("/auth/sso/callback").redirects(0);

    expect(res.status).toBe(302);
    const location = locationDe(res);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("ssoError")).toBeTruthy();
    expect(await prisma.user.count()).toBe(0);
  });

  test("si Google rechaza el code redirige al login con ssoError y no crea usuarios", async () => {
    googleOAuthClient.getToken.mockRejectedValue(new Error("invalid_grant"));

    const res = await request(app).get("/auth/sso/callback?code=codigo-invalido").redirects(0);

    expect(res.status).toBe(302);
    const location = locationDe(res);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("ssoError")).toBeTruthy();
    expect(await prisma.user.count()).toBe(0);
  });
});
