const bcrypt = require('bcryptjs');
const authService = require('../../src/modules/auth/auth.service');

const prisma = authService.prisma;

async function cleanUsers() {
  await prisma.user.deleteMany({ where: { email: { contains: '@testauth.com' } } });
}

beforeEach(async () => {
  await cleanUsers();
});

afterAll(async () => {
  await cleanUsers();
  await prisma.$disconnect();
});

describe('authService.register', () => {
  test('crea un usuario con la contrasena hasheada (nunca en texto plano)', async () => {
    const user = await authService.register({
      email: 'nueva@testauth.com',
      password: 'clave12345',
      fullName: 'Nueva Usuaria',
    });

    expect(user.email).toBe('nueva@testauth.com');
    expect(user.passwordHash).toBeUndefined(); // nunca se devuelve

    const stored = await prisma.user.findUnique({ where: { email: 'nueva@testauth.com' } });
    expect(stored.passwordHash).not.toBe('clave12345');

    const matches = await bcrypt.compare('clave12345', stored.passwordHash);
    expect(matches).toBe(true);
  });

  test('rechaza el registro si el email ya existe', async () => {
    await authService.register({
      email: 'duplicado@testauth.com',
      password: 'clave12345',
      fullName: 'Original',
    });

    await expect(
      authService.register({
        email: 'duplicado@testauth.com',
        password: 'otraclave',
        fullName: 'Duplicado',
      })
    ).rejects.toBeInstanceOf(authService.EmailAlreadyExistsError);
  });
});

describe('authService.login', () => {
  test('retorna un JWT valido con credenciales correctas', async () => {
    await authService.register({
      email: 'login@testauth.com',
      password: 'clave12345',
      fullName: 'Usuario Login',
    });

    const result = await authService.login({
      email: 'login@testauth.com',
      password: 'clave12345',
    });

    expect(result.token).toBeDefined();
    expect(result.user.email).toBe('login@testauth.com');
    expect(result.user.passwordHash).toBeUndefined();
  });

  test('rechaza login con contrasena incorrecta', async () => {
    await authService.register({
      email: 'malaclave@testauth.com',
      password: 'clave12345',
      fullName: 'Usuario',
    });

    await expect(
      authService.login({ email: 'malaclave@testauth.com', password: 'incorrecta' })
    ).rejects.toBeInstanceOf(authService.InvalidCredentialsError);
  });

  test('rechaza login con email inexistente', async () => {
    await expect(
      authService.login({ email: 'noexiste@testauth.com', password: 'cualquiera' })
    ).rejects.toBeInstanceOf(authService.InvalidCredentialsError);
  });
});


