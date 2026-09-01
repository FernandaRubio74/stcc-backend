const {
  verifyGoogleAuthorizationCode,
  findOrCreateUserFromGoogleProfile,
  handleGoogleSsoCallback,
} = require('../../src/modules/auth/sso.service');
const {
  MissingAuthorizationCodeError,
  GoogleAuthenticationError,
} = require('../../src/modules/auth/auth.errors');

function buildFakeOAuthClient({ tokens = { id_token: 'fake-id-token' }, payload } = {}) {
  return {
    getToken: jest.fn().mockResolvedValue({ tokens }),
    setCredentials: jest.fn(),
    verifyIdToken: jest.fn().mockResolvedValue({
      getPayload: () => payload,
    }),
  };
}

function buildFakePrismaClient({ existingUser = null } = {}) {
  return {
    user: {
      findUnique: jest.fn().mockImplementation(({ where }) => {
        if (where.authProvider_providerId) {
          return Promise.resolve(
            existingUser && existingUser.providerId === where.authProvider_providerId.providerId
              ? existingUser
              : null,
          );
        }
        if (where.email) {
          return Promise.resolve(
            existingUser && existingUser.email === where.email ? existingUser : null,
          );
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockImplementation(({ where, data }) =>
        Promise.resolve({ ...existingUser, ...data, id: where.id }),
      ),
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new-user-id', ...data }),
      ),
    },
  };
}

describe('verifyGoogleAuthorizationCode', () => {
  test('devuelve el perfil (email, fullName, googleId) cuando Google acepta el código', async () => {
    const oAuthClient = buildFakeOAuthClient({
      payload: { email: 'persona@example.com', name: 'Persona Ejemplo', sub: 'google-sub-123' },
    });

    const profile = await verifyGoogleAuthorizationCode('valid-code', oAuthClient);

    expect(oAuthClient.getToken).toHaveBeenCalledWith('valid-code');
    expect(profile).toEqual({
      email: 'persona@example.com',
      fullName: 'Persona Ejemplo',
      googleId: 'google-sub-123',
    });
  });

  test('lanza GoogleAuthenticationError si Google rechaza el código', async () => {
    const oAuthClient = buildFakeOAuthClient();
    oAuthClient.getToken.mockRejectedValue(new Error('invalid_grant'));

    await expect(verifyGoogleAuthorizationCode('bad-code', oAuthClient)).rejects.toThrow(
      GoogleAuthenticationError,
    );
  });
});

describe('findOrCreateUserFromGoogleProfile', () => {
  const profile = {
    email: 'nuevo@example.com',
    fullName: 'Nueva Persona',
    googleId: 'google-sub-999',
  };

  test('crea el usuario si no existe (provisioning automático)', async () => {
    const prismaClient = buildFakePrismaClient();

    const user = await findOrCreateUserFromGoogleProfile(profile, prismaClient);

    expect(prismaClient.user.create).toHaveBeenCalledWith({
      data: {
        email: profile.email,
        fullName: profile.fullName,
        authProvider: 'google',
        providerId: profile.googleId,
      },
    });
    expect(user).toMatchObject({ email: profile.email, providerId: profile.googleId });
  });

  test('reutiliza el usuario si ya está vinculado a ese googleId', async () => {
    const existingUser = {
      id: 'user-1',
      email: profile.email,
      fullName: profile.fullName,
      authProvider: 'google',
      providerId: profile.googleId,
    };
    const prismaClient = buildFakePrismaClient({ existingUser });

    const user = await findOrCreateUserFromGoogleProfile(profile, prismaClient);

    expect(prismaClient.user.create).not.toHaveBeenCalled();
    expect(user).toEqual(existingUser);
  });

  test('vincula un usuario local existente por email en vez de duplicarlo', async () => {
    const existingLocalUser = {
      id: 'user-2',
      email: profile.email,
      fullName: 'Nombre Local',
      authProvider: 'local',
      providerId: null,
    };
    const prismaClient = buildFakePrismaClient({ existingUser: existingLocalUser });

    const user = await findOrCreateUserFromGoogleProfile(profile, prismaClient);

    expect(prismaClient.user.create).not.toHaveBeenCalled();
    expect(prismaClient.user.update).toHaveBeenCalledWith({
      where: { id: existingLocalUser.id },
      data: { authProvider: 'google', providerId: profile.googleId },
    });
    expect(user).toMatchObject({ authProvider: 'google', providerId: profile.googleId });
  });
});

describe('handleGoogleSsoCallback', () => {
  const env = require('../../src/config/env');
  const originalSecret = env.jwt.secret;

  beforeAll(() => {
    env.jwt.secret = 'test-secret';
  });

  afterAll(() => {
    env.jwt.secret = originalSecret;
  });

  test('retorna 401 controlado (MissingAuthorizationCodeError) si no llega el code', async () => {
    await expect(handleGoogleSsoCallback(undefined)).rejects.toThrow(
      MissingAuthorizationCodeError,
    );
  });

  test('provisiona el usuario y emite sesión/token en el flujo exitoso', async () => {
    const oAuthClient = buildFakeOAuthClient({
      payload: { email: 'ok@example.com', name: 'Persona OK', sub: 'google-sub-ok' },
    });
    const prismaClient = buildFakePrismaClient();

    const result = await handleGoogleSsoCallback('good-code', { oAuthClient, prismaClient });

    expect(result.token).toEqual(expect.any(String));
    expect(result.user).toEqual({
      id: 'new-user-id',
      email: 'ok@example.com',
      fullName: 'Persona OK',
    });
  });

  test('propaga GoogleAuthenticationError si el proveedor rechaza la autenticación', async () => {
    const oAuthClient = buildFakeOAuthClient();
    oAuthClient.getToken.mockRejectedValue(new Error('invalid_grant'));
    const prismaClient = buildFakePrismaClient();

    await expect(
      handleGoogleSsoCallback('bad-code', { oAuthClient, prismaClient }),
    ).rejects.toThrow(GoogleAuthenticationError);
  });
});
