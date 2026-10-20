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
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
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
  // Igual que sso: no required(), CI y entornos sin IA configurada deben
  // poder arrancar; ai.client falla en tiempo de uso si faltan credenciales.
  ai: {
    endpoint: process.env.AI_ENDPOINT,
    apiKey: process.env.AI_PROVIDER_API_KEY,
    deployment: process.env.AI_DEPLOYMENT,
    // gpt-5 es un modelo de razonamiento: una respuesta real (con historial
    // de conversacion) tardo ~22s en pruebas manuales contra Azure. 15s se
    // quedaba corto y disparaba timeouts espurios.
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 45000,
    maxRetries: Number(process.env.AI_MAX_RETRIES) || 1,
  },
};
