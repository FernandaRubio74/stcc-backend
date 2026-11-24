# Despliegue de GENIAL (Ideator)

Guía paso a paso para poner la aplicación en la web. Los comandos y nombres
de variables salen del código real del proyecto, no de una receta genérica.

**Arquitectura del despliegue**

```
Vercel (frontend estático)  ──►  Render (backend Node)  ──►  Neon (PostgreSQL)
                                        │
                                        └──►  Google AI Studio (Gemini)
```

Las tres plataformas tienen plan gratuito suficiente para una demo.
Alternativas equivalentes: Railway o Fly.io en vez de Render, Netlify en vez
de Vercel, Supabase en vez de Neon.

---

## Antes de empezar: dos cosas que conviene saber

**1. Dependencia circular de URLs.** El backend necesita la URL del frontend
(para CORS) y el frontend necesita la URL del backend (para las llamadas).
Por eso el orden es: base → backend → frontend → **volver al backend** a
corregir `FRONTEND_URL`.

**2. `VITE_API_BASE_URL` se incrusta en el build.** Vite la reemplaza como
texto al compilar, no se lee en tiempo de ejecución. Si la cambiás después,
hay que **volver a buildear**; no alcanza con editar la variable.

---

## Paso 1 — Base de datos (Neon)

1. Crear cuenta en https://neon.tech y un proyecto nuevo (región cercana).
2. Copiar la cadena de conexión que te da, con formato:
   `postgresql://usuario:password@host.neon.tech/dbname?sslmode=require`
3. Guardarla: es tu `DATABASE_URL`. **Tiene que terminar en
   `?sslmode=require`** — sin eso Prisma falla contra Neon.

---

## Paso 2 — Generar las claves de sesión

El token de sesión va cifrado con un par RSA (ver `auth/jwe.service.js`), no
solo firmado. Generá el par con este comando (sale del `.env.example`):

```bash
node -e "const c=require('crypto');const{publicKey,privateKey}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});console.log(privateKey.trim().replace(/\n/g,'\\n'));console.log(publicKey.trim().replace(/\n/g,'\\n'));"
```

Imprime dos líneas: la primera es `JWT_RSA_PRIVATE_KEY` y la segunda
`JWT_RSA_PUBLIC_KEY`. Copialas **tal cual**, con los `\n` literales — el
código los convierte a saltos de línea reales al leerlas.

Estas claves son secretas: no van al repo ni se comparten.

---

## Paso 3 — Credencial de IA

La opción más rápida es una API key de Google AI Studio:

1. Entrar a https://aistudio.google.com/apikey y crear una key.
2. Guardarla como `GEMINI_API_KEY`.

El código elige proveedor solo por las credenciales presentes
(`selectModel()` en `ai/adk/runAgentTurn.js`): si existe
`GOOGLE_CLOUD_PROJECT` usa Vertex AI, si no existe pero hay
`GEMINI_API_KEY` usa Gemini, y si no hay ninguna cae a Azure. Para la demo
alcanza con la API key.

Si más adelante necesitás más cuota, Vertex AI requiere además habilitar la
API en GCP, crear un service account con rol "Vertex AI User" y montar su
JSON en el servidor apuntado por `GOOGLE_APPLICATION_CREDENTIALS`.

---

## Paso 4 — Backend (Render)

1. En https://render.com crear un **Web Service** y conectar el repo
   `stcc-backend`, rama `develop` (o `main` si ya mergeaste).
2. Configuración:

   | Campo | Valor |
   |---|---|
   | Runtime | Node |
   | Build command | `npm ci && npx prisma generate --schema=src/database/schema.prisma && npm run migrate` |
   | Start command | `npm start` |
   | Health check path | `/health` |

   El `build` incluye la migración a propósito: el `Dockerfile` del proyecto
   no las corre al arrancar (para no cambiar el esquema en cada reinicio),
   así que el despliegue es el momento explícito donde se aplican.

3. Variables de entorno (sección *Environment*):

   | Variable | Valor | Obligatoria |
   |---|---|---|
   | `DATABASE_URL` | la de Neon, con `?sslmode=require` | sí |
   | `JWT_RSA_PRIVATE_KEY` | del paso 2 | sí |
   | `JWT_RSA_PUBLIC_KEY` | del paso 2 | sí |
   | `JWT_EXPIRES_IN` | `1d` | no |
   | `FRONTEND_URL` | provisorio: `http://localhost:5173` (se corrige en el paso 6) | sí |
   | `GEMINI_API_KEY` | del paso 3 | para que funcione la IA |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` | no |
   | `NODE_ENV` | `production` | no |
   | `NODE_VERSION` | `20` | recomendada |
   | `AI_TIMEOUT_MS` | `90000` | no |
   | `AI_MAX_RETRIES` | `1` | no |

   `PORT` lo inyecta Render solo; no hay que definirlo.

   **`NODE_VERSION` conviene fijarla** porque el `package.json` no declara
   `engines`, así que la plataforma elegiría una versión por su cuenta. El
   `Dockerfile` del proyecto usa Node 20.

4. Desplegar y comprobar: `https://TU-BACKEND.onrender.com/health` debe
   responder `200`.

5. Anotar la URL del backend.

> **Nota del plan gratuito de Render:** el servicio se duerme tras unos
> minutos sin tráfico, y la primera llamada después tarda ~30 s en
> despertar. Para una demo en vivo, abrí `/health` unos minutos antes.

---

## Paso 5 — Frontend (Vercel)

1. En https://vercel.com importar el repo `stcc-frontend`.
2. Configuración (Vercel detecta Vite solo, pero conviene verificar):

   | Campo | Valor |
   |---|---|
   | Framework | Vite |
   | Build command | `npm run build` |
   | Output directory | `dist` |

3. Variable de entorno:

   | Variable | Valor |
   |---|---|
   | `VITE_API_BASE_URL` | `https://TU-BACKEND.onrender.com` (sin barra final) |

4. Desplegar y anotar la URL del frontend.

---

## Paso 6 — Cerrar el círculo (CORS)

Volver a Render y cambiar `FRONTEND_URL` por la URL real de Vercel, por
ejemplo `https://genial.vercel.app`. Guardar: el servicio se reinicia solo.

Esto es obligatorio. El backend hace `cors({ origin: env.frontendUrl })`, así
que si `FRONTEND_URL` no coincide **exactamente** con el dominio del
frontend, el navegador bloquea todas las llamadas y la app se ve vacía sin
un error claro.

---

## Paso 7 — SSO con Google (opcional)

Si no lo configurás, el registro y login con email y contraseña funcionan
igual; solo queda sin efecto el botón de Google.

1. En Google Cloud Console → *Credenciales* → crear un **OAuth client ID**
   de tipo *Aplicación web*.
2. En *URIs de redirección autorizados* agregar exactamente:
   `https://TU-BACKEND.onrender.com/auth/sso/callback`
3. En Render agregar:

   | Variable | Valor |
   |---|---|
   | `SSO_CLIENT_ID` | el del cliente OAuth |
   | `SSO_CLIENT_SECRET` | el secreto del cliente |
   | `SSO_CALLBACK_URL` | `https://TU-BACKEND.onrender.com/auth/sso/callback` |

La URI en Google y `SSO_CALLBACK_URL` tienen que ser idénticas carácter por
carácter, o Google rechaza el login.

---

## Paso 8 — Verificación

En este orden:

1. `GET https://TU-BACKEND.onrender.com/health` → `200`.
2. Abrir el frontend, **registrarse** con email y contraseña.
3. Crear un proyecto: tiene que aparecer el panel "Contanos tu idea".
4. Mandar un mensaje en el wizard → confirma que la credencial de IA
   funciona (es la primera llamada real al modelo).
5. Completar la definición y generar el modelo de datos → confirma que las
   llamadas largas no se cortan por timeout.
6. Llegar a Revisión final y generar la documentación → confirma que la
   escritura en base y la descarga funcionan.

Si algo falla, revisar los logs del backend en Render: el proyecto loguea
cada request con su `requestId`, método, ruta, status y duración.

---

## Problemas típicos

| Síntoma | Causa | Solución |
|---|---|---|
| La app carga pero ninguna llamada funciona | `FRONTEND_URL` no coincide con el dominio real | Paso 6 |
| Cambié `VITE_API_BASE_URL` y sigue apuntando al viejo | Vite la incrusta en el build | Volver a desplegar el frontend |
| `Falta la variable de entorno requerida: X` al arrancar | Falta una variable obligatoria | `env.js` valida al inicio; agregarla en Render |
| Prisma no conecta a Neon | Falta `?sslmode=require` | Corregir `DATABASE_URL` |
| La IA responde "no está disponible" | Falta o es inválida `GEMINI_API_KEY` | Paso 3 |
| La IA devuelve 429 | Cuota gratuita agotada | Esperar, cambiar de modelo o pasar a Vertex AI |
| La primera llamada tarda 30 s | El plan gratuito durmió el servicio | Esperar o pasar a plan pago |
| El login con Google falla y vuelve a `/login?ssoError=...` | La URI de redirección no coincide | Paso 7 |
| El login con Google devuelve `500 Error interno del servidor` | Casi siempre las claves RSA quedaron mal copiadas | `node scripts/check-keys.js` (ver abajo) |

### Diagnóstico de las claves RSA

```bash
node scripts/check-keys.js
```

Lee `JWT_RSA_PUBLIC_KEY` y `JWT_RSA_PRIVATE_KEY` del entorno, les aplica la
misma normalización que `src/config/env.js` y comprueba, paso por paso: si
quedaron comillas alrededor, si falta el encabezado o el pie PEM, si los `\n`
escapados sobrevivieron al copiado, si hay espacios donde deberían ir saltos,
si `crypto` las carga (imprime tipo y bits) y si forman un par real —
cifrando y descifrando un objeto de prueba con el mismo cifrador que usa el
token de sesión. Imprime `PASS`/`FAIL` por paso y **nunca** el contenido de
las claves, así que su salida se puede pegar en un ticket.

Corre tanto local (lee el `.env`) como en la Shell de Render, donde las
variables ya están en el entorno del servicio.

Por qué hace falta: `env.js` solo valida que la variable **no esté vacía**, no
que sea un PEM válido. Un valor mal copiado deja arrancar el backend sin
ninguna queja, y recién revienta al emitir el primer token de sesión. En el
callback de SSO eso sale como un 500 genérico, porque
`sso.controller.js` solo convierte en redirección los errores de Google y de
código faltante; cualquier otro sube al manejador global.

---

## Pendientes antes de considerarlo producción real

Esto alcanza para una demo pública, pero **no** para producción con datos de
terceros:

- **Rotación de las claves RSA** de sesión: hoy no hay mecanismo.
- **Límite de tasa** en los endpoints que gastan IA: hoy un usuario con
  sesión válida puede disparar llamadas sin tope más allá del timeout.
- **Monitoreo de costo** de IA por proyecto.
- **Backups verificados** de la base (Neon los hace, pero hay que probar una
  restauración).
- **Dominio propio y HTTPS** en ambos servicios (las plataformas dan HTTPS
  en sus subdominios).
