require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${name}`);
  }
  return value;
}

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  jwt: {
    secret: required('JWT_SECRET'),
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  },
  // No se marcan como required(): entornos sin SSO configurado (ej. CI de
  // US-005) deben poder arrancar igual; sso.service falla en tiempo de uso
  // si Google rechaza credenciales vacias.
  sso: {
    clientId: process.env.SSO_CLIENT_ID,
    clientSecret: process.env.SSO_CLIENT_SECRET,
    callbackUrl: process.env.SSO_CALLBACK_URL,
  },
};
