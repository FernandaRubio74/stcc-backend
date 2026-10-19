const request = require("supertest");
const { PrismaClient } = require("@prisma/client");

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const prisma = new PrismaClient();

async function cleanDatabase() {
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

describe("E2E - Registro", () => {
  test("un usuario nuevo puede registrarse", async () => {
    const res = await request(BASE_URL).post("/auth/register").send({
      email: "e2e-registro@ideator.com",
      password: "clave12345",
      fullName: "Usuario E2E",
    });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe("e2e-registro@ideator.com");
    expect(res.body.passwordHash).toBeUndefined();
  });

  test("no permite registrar el mismo email dos veces", async () => {
    await request(BASE_URL).post("/auth/register").send({
      email: "e2e-duplicado@ideator.com",
      password: "clave12345",
      fullName: "Original",
    });

    const res = await request(BASE_URL).post("/auth/register").send({
      email: "e2e-duplicado@ideator.com",
      password: "otraclave",
      fullName: "Duplicado",
    });

    expect(res.status).toBe(409);
  });
});

describe("E2E - Login", () => {
  test("login exitoso retorna un token utilizable", async () => {
    await request(BASE_URL).post("/auth/register").send({
      email: "e2e-login@ideator.com",
      password: "clave12345",
      fullName: "Usuario Login",
    });

    const res = await request(BASE_URL).post("/auth/login").send({
      email: "e2e-login@ideator.com",
      password: "clave12345",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  test("login fallido con contrasena incorrecta responde 401", async () => {
    await request(BASE_URL).post("/auth/register").send({
      email: "e2e-login2@ideator.com",
      password: "clave12345",
      fullName: "Usuario",
    });

    const res = await request(BASE_URL).post("/auth/login").send({
      email: "e2e-login2@ideator.com",
      password: "incorrecta",
    });

    expect(res.status).toBe(401);
  });
});

describe("E2E - Acceso protegido a proyectos", () => {
  test("flujo completo: registro -> login -> crear proyecto -> leerlo", async () => {
    await request(BASE_URL).post("/auth/register").send({
      email: "e2e-flujo@ideator.com",
      password: "clave12345",
      fullName: "Usuario Flujo",
    });

    const login = await request(BASE_URL).post("/auth/login").send({
      email: "e2e-flujo@ideator.com",
      password: "clave12345",
    });
    const token = `Bearer ${login.body.token}`;

    const creado = await request(BASE_URL)
      .post("/projects")
      .set("Authorization", token)
      .send({ name: "Proyecto E2E" });

    expect(creado.status).toBe(201);

    const leido = await request(BASE_URL)
      .get(`/projects/${creado.body.id}`)
      .set("Authorization", token);

    expect(leido.status).toBe(200);
    expect(leido.body.role).toBe("owner");
  });

  test("acceso sin token responde 401", async () => {
    const res = await request(BASE_URL).get("/projects");
    expect(res.status).toBe(401);
  });

  test("acceso a un proyecto sin ser miembro responde 404 (no filtra existencia)", async () => {
    await request(BASE_URL).post("/auth/register").send({
      email: "e2e-dueno@ideator.com",
      password: "clave12345",
      fullName: "Dueno",
    });
    const loginDueno = await request(BASE_URL).post("/auth/login").send({
      email: "e2e-dueno@ideator.com",
      password: "clave12345",
    });
    const proyecto = await request(BASE_URL)
      .post("/projects")
      .set("Authorization", `Bearer ${loginDueno.body.token}`)
      .send({ name: "Privado E2E" });

    await request(BASE_URL).post("/auth/register").send({
      email: "e2e-ajeno@ideator.com",
      password: "clave12345",
      fullName: "Ajeno",
    });
    const loginAjeno = await request(BASE_URL).post("/auth/login").send({
      email: "e2e-ajeno@ideator.com",
      password: "clave12345",
    });

    const res = await request(BASE_URL)
      .get(`/projects/${proyecto.body.id}`)
      .set("Authorization", `Bearer ${loginAjeno.body.token}`);

    expect(res.status).toBe(404);
  });
});
