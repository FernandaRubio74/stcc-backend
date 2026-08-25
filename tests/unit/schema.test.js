/**
 * T-004.5 - Tests que validan las restricciones del esquema
 * (unicidad de email, integridad referencial, politicas de cascada).
 *
 * Requiere una base de Postgres real (no se mockea Prisma), ya que las
 * restricciones que probamos viven en el motor de BD, no en la aplicacion.
 *
 * Antes de correr:
 *   1) docker compose up -d
 *   2) crear una BD de pruebas separada, ej:
 *        docker exec -it stcc_backend_db psql -U ideator -c "CREATE DATABASE ideator_test_db;"
 *   3) export TEST_DATABASE_URL="postgresql://ideator:ideator@localhost:5432/ideator_test_db?schema=public"
 *   4) npx prisma migrate deploy --schema=src/database/schema.prisma   (con DATABASE_URL apuntando a la BD de test)
 *   5) npm run test
 */

const { PrismaClient, Prisma } = require("@prisma/client");

const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

const prisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

// Limpia las tablas en orden seguro respecto de las FKs
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

describe("Restricciones de unicidad", () => {
  test("no permite dos usuarios con el mismo email", async () => {
    await prisma.user.create({
      data: { email: "ana@ideator.com", fullName: "Ana Pérez" },
    });

    await expect(
      prisma.user.create({
        data: { email: "ana@ideator.com", fullName: "Ana Otra" },
      })
    ).rejects.toMatchObject({ code: "P2002" }); // Unique constraint violation
  });

  test("no permite dos membresias del mismo usuario en el mismo proyecto", async () => {
    const user = await prisma.user.create({
      data: { email: "user@ideator.com", fullName: "Usuario" },
    });
    const project = await prisma.project.create({
      data: { name: "Proyecto A", createdById: user.id },
    });

    await prisma.projectMember.create({
      data: { userId: user.id, projectId: project.id, role: "editor" },
    });

    await expect(
      prisma.projectMember.create({
        data: { userId: user.id, projectId: project.id, role: "viewer" },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("Integridad referencial (FK)", () => {
  test("no permite crear un ProjectMember con user_id inexistente", async () => {
    const user = await prisma.user.create({
      data: { email: "owner@ideator.com", fullName: "Owner" },
    });
    const project = await prisma.project.create({
      data: { name: "Proyecto B", createdById: user.id },
    });

    await expect(
      prisma.projectMember.create({
        data: {
          userId: "00000000-0000-0000-0000-000000000000",
          projectId: project.id,
          role: "viewer",
        },
      })
    ).rejects.toMatchObject({ code: "P2003" }); // Foreign key violation
  });

  test("no permite crear un Project con created_by inexistente", async () => {
    await expect(
      prisma.project.create({
        data: {
          name: "Proyecto huérfano",
          createdById: "00000000-0000-0000-0000-000000000000",
        },
      })
    ).rejects.toMatchObject({ code: "P2003" });
  });
});

describe("Politicas de cascada en DELETE", () => {
  test("ON DELETE CASCADE: borrar un Project borra sus ProjectMember", async () => {
    const user = await prisma.user.create({
      data: { email: "cascade1@ideator.com", fullName: "User Cascade" },
    });
    const project = await prisma.project.create({
      data: { name: "Proyecto a borrar", createdById: user.id },
    });
    await prisma.projectMember.create({
      data: { userId: user.id, projectId: project.id, role: "owner" },
    });

    // Se borra directo con SQL para no depender de un onDelete a nivel de
    // Prisma Client, y así probar la restricción real del motor de BD.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "projects" WHERE id = '${project.id}'`
    );

    const remaining = await prisma.projectMember.findMany({
      where: { projectId: project.id },
    });
    expect(remaining).toHaveLength(0);
  });

  test("ON DELETE SET NULL: borrar el usuario que agregó a un miembro deja created_by en null", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner2@ideator.com", fullName: "Owner 2" },
    });
    const inviter = await prisma.user.create({
      data: { email: "inviter@ideator.com", fullName: "Inviter" },
    });
    const member = await prisma.user.create({
      data: { email: "member@ideator.com", fullName: "Member" },
    });
    const project = await prisma.project.create({
      data: { name: "Proyecto C", createdById: owner.id },
    });
    const membership = await prisma.projectMember.create({
      data: {
        userId: member.id,
        projectId: project.id,
        role: "viewer",
        createdById: inviter.id,
      },
    });

    await prisma.$executeRawUnsafe(
      `DELETE FROM "users" WHERE id = '${inviter.id}'`
    );

    const updated = await prisma.projectMember.findUnique({
      where: { id: membership.id },
    });
    expect(updated.createdById).toBeNull();
  });

  test("ON DELETE RESTRICT: no se puede borrar un usuario dueño de un proyecto", async () => {
    const owner = await prisma.user.create({
      data: { email: "owner3@ideator.com", fullName: "Owner 3" },
    });
    await prisma.project.create({
      data: { name: "Proyecto D", createdById: owner.id },
    });

    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "users" WHERE id = '${owner.id}'`)
    ).rejects.toThrow();
  });
});
