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
  // Cifrado hibrido del token de sesion (ver auth/jwe.service.js): ya no es
  // un JWT firmado (HS256, payload legible por cualquiera), es un JWE -
  // RSA-OAEP cifra una clave AES-256 por token, que a su vez cifra el
  // payload real. Las claves vienen en PEM con los saltos de linea
  // escapados como "\n" (asi se puede guardar en una sola linea de .env);
  // se desescapan aca, una sola vez al cargar el modulo.
  jwt: {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    rsaPrivateKey: required('JWT_RSA_PRIVATE_KEY').replace(/\\n/g, '\n'),
    rsaPublicKey: required('JWT_RSA_PUBLIC_KEY').replace(/\\n/g, '\n'),
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
    // de conversacion) tardo ~22s en pruebas manuales contra Azure, pero las
    // tareas de un solo turno que generan un artefacto completo (modelo de
    // datos, spec de API con CRUD + 401/403/404 para cada entidad, etc.)
    // tardaron hasta ~50s en pruebas manuales reales — 45s se quedaba corto
    // y disparaba timeouts espurios en esas tareas.
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 90000,
    maxRetries: Number(process.env.AI_MAX_RETRIES) || 1,
    // Migracion de proveedor (cuota de Azure del profesor agotada): Gemini
    // vive como modelo nativo del Google ADK (no necesita un adaptador de
    // BaseLlm como Azure). runAgentTurn.js elige automaticamente segun que
    // credenciales esten presentes (Vertex > API key de Gemini > Azure), sin
    // bandera separada.
    gemini: {
      // gemini-3.8-flash (el default anterior) tiene una cuota gratuita de
      // Google AI Studio de solo 20 requests/dia - se agoto en pruebas
      // manuales reales con un 429 "Quota exceeded... Please retry in
      // 5h40m". gemini-3.5-flash-lite SI acepta varias llamadas seguidas
      // sin problema (verificado en vivo, 4 llamadas consecutivas OK) y es
      // el sucesor recomendado por la propia API para el modelo anterior
      // equivalente (gemini-2.5-flash-lite).
      model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
      // Via Google AI Studio (API key simple).
      apiKey: process.env.GEMINI_API_KEY,
      // Via Vertex AI (GCP): la autenticacion NO es esta API key, es
      // Application Default Credentials - normalmente un service account
      // apuntado por GOOGLE_APPLICATION_CREDENTIALS, que ni siquiera lo lee
      // este archivo: lo levanta solo la libreria de auth de Google en
      // cuanto esta esa variable de entorno seteada.
      vertexProject: process.env.GOOGLE_CLOUD_PROJECT,
      vertexLocation: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
    },
  },
};
