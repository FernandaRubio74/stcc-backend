# GENIAL (Ideator) — Documentación técnica

Guía completa de cómo funciona la aplicación por detrás, por qué se tomó
cada decisión, y respuestas a las preguntas que suelen surgir en una
defensa o revisión técnica.

---

## 1. Qué hace la aplicación

GENIAL acompaña a una persona desde una idea vaga hasta una especificación
técnica completa, lista para que **otra IA (o un equipo) la implemente sin
tener que tomar decisiones adicionales**. El resultado final son documentos
Markdown descargables.

El producto es un **flujo de 8 etapas secuenciales**, cada una alimentada
por lo aprobado en las anteriores:

| # | Etapa | Entrada | Salida |
|---|-------|---------|--------|
| 1 | Definición del producto | Conversación con la persona | Problema, usuarios objetivo, alcance del MVP, recorrido |
| 2 | Modelo de datos | Definición | Entidades, atributos, relaciones, diagrama ER, datos de ejemplo |
| 3 | Especificación de API | Modelo de datos aprobado | Endpoints con parámetros, respuestas y permisos |
| 4 | Mapa de pantallas | Modelo + API aprobados | Pantallas, navegación, wireframes |
| 5 | Arquitectura | Modelo + API + alcance | Arquitectura recomendada con justificación |
| 6 | Pruebas | Todo lo anterior | Plan de pruebas con trazabilidad |
| 7 | Revisión final | Todas las etapas | Chequeo de consistencia cruzada |
| 8 | Documentos finales | Proyecto completo | `.md` de especificación y de arquitectura + zip |

---

## 2. Arquitectura general

```
┌──────────────────────┐        HTTPS/JSON         ┌───────────────────────┐
│  stcc-frontend       │ ────────────────────────► │  stcc-backend         │
│  React 19 + Vite     │ ◄──────────────────────── │  Node + Express 5     │
│  TypeScript          │                           │                       │
│  TanStack Query      │                           │  ┌─────────────────┐  │
│  Tailwind            │                           │  │ modules/*       │  │
└──────────────────────┘                           │  │ (1 por etapa)   │  │
                                                   │  └────────┬────────┘  │
                                                   │           │           │
                                            ┌──────┴───────┐   │   ┌───────┴──────┐
                                            │ Prisma (ORM) │   │   │ Google ADK   │
                                            └──────┬───────┘   │   └───────┬──────┘
                                                   │           │           │
                                            ┌──────┴───────┐   │   ┌───────┴──────┐
                                            │ PostgreSQL16 │   │   │ Gemini /     │
                                            │  (Docker)    │   │   │ Vertex/Azure │
                                            └──────────────┘   │   └──────────────┘
```

**Decisión: dos repositorios separados.** `stcc-backend` y `stcc-frontend`
se despliegan por separado y tienen ciclos de vida distintos. El contrato
entre ellos es HTTP/JSON; el frontend no comparte código con el backend
(los tipos de TypeScript del frontend son un espejo manual y documentado de
los esquemas de zod del backend).

**Decisión: arquitectura modular por etapa, no por capa técnica.** En vez
de `controllers/`, `services/`, `models/` globales, cada etapa del producto
es un módulo autocontenido:

```
src/modules/data-model/
  data-model.routes.js      rutas + middlewares (auth, rol, validación)
  data-model.controller.js  HTTP: traduce errores de dominio a códigos
  data-model.service.js     lógica de negocio, única capa que toca Prisma
  data-model.errors.js      errores de dominio tipados
  entity.schema.js          esquema zod (valida IA Y edición manual)
  prompts.js                prompt de sistema + armado del contexto
  mermaid.js                diagrama derivado del modelo, sin IA
  seedData.js               datos de ejemplo derivados, sin IA
```

Por qué: el cambio más frecuente es "tocar una etapa", no "tocar todos los
controladores". Cada módulo se lee y se prueba entero sin saltar entre
carpetas. El precio es algo de repetición entre módulos (los cinco tienen
el mismo ciclo borrador/aprobado), asumida a conciencia.

---

## 3. Estructura de archivos

### Backend (`stcc-backend`)

```
src/
  app.js                    arma Express, monta rutas, CORS, logger
  server.js                 arranque (separado de app.js para poder testear sin escuchar)
  config/env.js             TODA la lectura de process.env, en un solo lugar
  common/
    middlewares/
      auth.middleware.js            valida el token de sesión
      project-member.middleware.js  verifica membresía (404 si no es miembro)
      require-role.middleware.js    verifica rol (403 si no alcanza)
      validate.js                   valida el body con zod
      request-logger.middleware.js  log estructurado por request
    dto/                    esquemas zod de los bodies de entrada
  database/
    client.js               instancia única de Prisma + extensión de cifrado
    fieldEncryption.js      cifra/descifra campos sensibles de forma transparente
    schema.prisma           modelo de datos (12 tablas, 8 enums)
    migrations/             11 migraciones versionadas
  modules/
    auth/        registro, login, JWT cifrado, SSO con Google, revocación
    projects/    CRUD de proyectos y miembros
    definition/  etapa 1 (wizard conversacional)
    data-model/  etapa 2
    api-spec/    etapa 3
    screens/     etapa 4 (+ mockup/: maquetado de alta fidelidad)
    architecture/etapa 5
    testing/     etapa 6
    consistency/ etapa 7 (motor de reglas cruzadas)
    review/      vista consolidada del proyecto
    documents/   etapa 8 (plantillas Markdown + zip)
    ai/          única puerta de salida hacia el proveedor de IA
    crypto/      cifrado híbrido RSA+AES
    health/      healthcheck
tests/
  unit/        42 archivos
  functional/  17 archivos (HTTP real con supertest)
  e2e/         6 archivos (flujo completo)
docs/          documentación y ADRs
```

### Frontend (`stcc-frontend`)

```
src/
  App.tsx              tabla de rutas
  main.tsx             providers: QueryClient, Auth, Toast, Router
  components/          sistema de diseño propio (Button, Alert, Modal, Stepper…)
  pages/
    auth/              login, registro, callback de SSO
    dashboard/         listado de proyectos
    project/
      ProjectDetailPage.tsx  entrada al proyecto + próximo paso
      projectStages.ts       modelo de las 8 etapas y su desbloqueo
      wizard/ data-model/ api-spec/ screens/ architecture/ testing/ review/ documents/
  services/            una función por endpoint (capa de red)
  hooks/               useAuth, usePageTitle, usePrefillInstruction…
  types/               espejo de los contratos del backend
  lib/apiClient.ts     fetch centralizado + ApiError
tests/unit/            32 archivos
```

---

## 4. Modelo de datos

12 tablas. El eje es `Project`; todo lo demás cuelga de ahí.

```
User ──< ProjectMember >── Project
                              │
      ┌───────────────────────┼────────────────────────┐
      │                       │                        │
ProjectDefinition      DataModelVersion         GeneratedDocument
      │                ApiSpecVersion
DefinitionMessage      ScreenMapVersion
BlockingQuestion       TestPlanVersion
                       ProjectArchitecture

RevokedToken (independiente: logout)
```

**Decisión: acceso siempre vía `ProjectMember`, nunca por `createdBy`.** Un
proyecto es privado por defecto. Ningún endpoint asume que el frontend ya
filtró: el middleware de membresía corre antes del controlador y devuelve
**404, no 403**, si no sos miembro — así no se filtra la existencia de
proyectos ajenos.

**Decisión: versionado DRAFT/APPROVED en las etapas generadas.** Modelo de
datos, API, pantallas y pruebas no se sobrescriben: tienen
`versionNumber` + `status`. Hay como mucho un `DRAFT` a la vez (generar de
nuevo lo actualiza en el lugar) y las etapas siguientes **solo leen
`APPROVED`**. Eso hace que aprobar sea una decisión explícita y que una
etapa posterior nunca se construya sobre algo a medio hacer.

**Decisión: auditoría en toda tabla** (`created_at`, `created_by`,
`updated_at`, y `approved_at`/`approved_by` donde aplica).

**Decisión: políticas de cascada explícitas.** Borrar un proyecto borra su
contenido (`onDelete: Cascade`); borrar un usuario **no** borra el contenido
que creó (`SetNull` en `created_by`), para no perder el trabajo del equipo.

**Decisión: cifrado de campos en reposo.** `database/fieldEncryption.js` es
una extensión de Prisma que cifra al escribir y descifra al leer, de forma
transparente para los servicios. Se cifra el **contenido** del proyecto (la
idea, el modelo, la API, las pantallas, el plan, los documentos) y nunca
ids, enums, timestamps ni campos de estado — porque esos sí se usan en
`where` y `orderBy`. Si mirás la fila cruda en psql ves un sobre cifrado.

---

## 5. Los agentes de IA y el consumo de créditos

### Dónde se consume

**Toda** llamada al modelo pasa por un único punto: `modules/ai/ai.service.js`,
que delega en `ai/adk/runAgentTurn.js` (Google ADK). No hay ninguna otra
salida hacia el proveedor. Hay exactamente **dos funciones** de entrada:

- `requestStructuredTurn` — conversación con historial (solo el wizard).
- `requestStructuredJson` — tarea de un solo turno (el resto de las etapas).

### Cuándo se consume (inventario completo de llamadas)

| Acción del usuario | Llamadas | Tokens de salida | Notas |
|---|---|---|---|
| Mandar un mensaje en el wizard | **2** | 16k + 400 | 1 agente principal + 1 agente de sugerencias |
| Avanzar de sub-etapa en el wizard | **1** | 400 | solo el agente de sugerencias |
| Generar / Ajustar modelo de datos | **1** c/u | 16384 | |
| Generar / Ajustar API | **1** c/u | 16384 | |
| Generar / Ajustar pantallas | **1** c/u | 16384 | |
| Recomendar arquitectura | **1** | 16384 | |
| Generar / Ajustar plan de pruebas | **1** c/u | 16384 | |
| **Generar documentos finales** | **0** | — | plantillas deterministas |
| Diagramas ER y de navegación | **0** | — | derivados del modelo |
| Wireframes y datos de ejemplo | **0** | — | derivados del modelo |
| Chequeo de consistencia / revisión | **0** | — | reglas en código |

**Un proyecto completo sin reintentos ni ajustes cuesta aproximadamente
6 llamadas grandes + 2 por cada mensaje del wizard.** Un wizard típico de
8 mensajes ≈ 16 llamadas chicas + 6 grandes ≈ **22 llamadas**.

**Multiplicador por reintentos:** `AI_MAX_RETRIES` (default **1**) permite
hasta 2 intentos por llamada, pero **solo** ante errores transitorios
(429, 5xx, timeout). Un error de contrato o de facturación no reintenta.

**Decisión clave de costo: todo lo que puede derivarse del dato ya
aprobado se calcula en código, no se le pide al modelo.** Diagramas,
wireframes, datos de ejemplo, documentos finales y validaciones de
consistencia son deterministas. Eso baja el costo, elimina una fuente de
error y hace el resultado reproducible.

### Qué proveedor y cómo se elige

`selectModel()` en `runAgentTurn.js` decide por **presencia de credenciales**,
sin bandera aparte: **Vertex AI** (si hay `GOOGLE_CLOUD_PROJECT`) → **Gemini
API key** (si hay `GEMINI_API_KEY`) → **Azure AI Foundry** (respaldo).
Modelo por defecto: `gemini-3.5-flash-lite` (se eligió tras agotar en
pruebas reales la cuota gratuita de 20 req/día de `gemini-3.8-flash`).

### Controles de gasto y de cuelgues

1. **Timeout por intento**: 90 s (`AI_TIMEOUT_MS`).
2. **Reloj global** (`hardDeadlineMs`): cubre la suma de intentos + margen.
   Existe porque en pruebas reales el ADK no siempre cancela la llamada de
   red al abortar, y una generación quedó colgada más de 20 minutos.
3. **`maxOutputTokens` por llamada**: techo explícito en cada call site.
4. **Permisos**: desde la revisión transversal, generar exige rol
   `owner`/`editor` — un `viewer` ya no puede disparar gasto de IA.

---

## 6. Seguridad

- **Sesión**: JWT **cifrado** (JWE con RSA 2048 + AES), no solo firmado, así
  el contenido del token no es legible. Logout real vía tabla
  `RevokedToken`.
- **SSO**: Google OAuth2 (`auth/sso.service.js`).
- **Autorización en dos capas**: membresía (404) y rol (403).
- **Entrada**: todo body se valida con zod antes del controlador.
- **Salida de la IA: se trata como no confiable.** Se valida contra zod, se
  verifica coherencia estructural (que cada campo/endpoint referenciado
  exista de verdad) y, en el maquetado, se escapa todo el texto y se emite
  HTML sin scripts bajo una CSP restrictiva.
- **Datos en reposo**: cifrado de campos sensibles (sección 4).
- **Auditoría**: `tests/functional/security-audit.routes.test.js` recorre
  los 29 endpoints de proyecto y verifica que ninguno quede sin guard.

---

## 7. Las pruebas: qué cubren, dónde están y qué hacen

**Totales: 59 suites / 505 pruebas en backend, 32 archivos / 208 en frontend.**

### Backend — tres niveles

**`tests/unit/` (42 archivos).** Lógica pura y servicios. Los servicios se
prueban **contra Postgres real, no contra un mock de Prisma** (decisión
explícita del proyecto: un mock de ORM prueba el mock, no el esquema ni las
restricciones de la base). Ejemplos:
- `consistency-rules.test.js` — las 3 reglas cruzadas aisladas: que una
  etapa sin generar quede *pendiente* y no *error*, que un rol no exija una
  entidad, que la fuga de alcance se mida por artefacto.
- `mermaid.test.js`, `flowchart.test.js` — que el diagrama generado sea
  sintácticamente válido (incluye la regresión del `enum: ...` que rompía
  el parser).
- `adk.*.test.js` — selección de proveedor, reintentos, timeout global y el
  escape de llaves que rompía los prompts.
- `fieldEncryption`, `seedData`, `coverage`, `coherence`, plantillas…

**`tests/functional/` (17 archivos).** HTTP real con `supertest` contra la
app Express completa: códigos de estado, forma de la respuesta, guards.
Ejemplos: `viewer-permissions.routes.test.js` (un viewer no puede generar
ni modificar en ninguna etapa), `ai-failure.routes.test.js` (una respuesta
inválida de la IA no rompe el proyecto y el reintento siguiente funciona),
`security-audit.routes.test.js`.

**`tests/e2e/` (6 archivos).** El flujo completo de punta a punta con un
proveedor de IA falso (`fakeAiProvider.js`): registro → proyecto → las 8
etapas → documentos.

### Frontend (32 archivos, Vitest + Testing Library)

Componentes y páginas desde el punto de vista de quien usa la app
(`getByRole`, `getByText`), más los servicios de red. Ejemplos:
`ReviewPage.test.tsx` (el botón de generación final genera los documentos y
navega), `ReviewChecklist.test.tsx` (pendiente ≠ conflicto), `ScrollToTop`,
`conflictInstructions`.

### Qué NO cubren

No hay pruebas de carga ni de performance, ni pruebas visuales
automatizadas (las capturas de `docs/maquetado/` se generan a mano con
Playwright), ni pruebas contra el proveedor de IA real en CI (sería lento,
caro y no determinista).

---

## 8. Preguntas frecuentes de defensa

### ¿Qué es un ORM y dónde está implementado?

Un **ORM** (Object-Relational Mapper) traduce entre las tablas de una base
relacional y los objetos del lenguaje: en vez de escribir SQL a mano,
escribís `prisma.project.findUnique({ where: { id } })` y la librería genera
el SQL, lo ejecuta y te devuelve un objeto tipado.

En GENIAL el ORM es **Prisma**:
- El esquema vive en `src/database/schema.prisma` (no en `./prisma/`, que es
  la ubicación por defecto — por eso todo comando necesita
  `--schema=src/database/schema.prisma`, ya incluido en los scripts de npm).
- La instancia única está en `src/database/client.js`.
- Las migraciones versionadas en `src/database/migrations/` (11 a la fecha).

**Por qué Prisma y no SQL a mano:** el esquema es la única fuente de verdad,
genera tipos automáticamente, y las migraciones quedan versionadas en el
repo. **Por qué no se mockea en las pruebas:** mockear el ORM prueba el
mock; las restricciones reales (claves foráneas, unicidad, cascadas) solo
se verifican contra Postgres de verdad.

**Dato no obvio:** el cliente está *extendido* (`withFieldEncryption`), así
que el cifrado ocurre dentro del ORM y ningún servicio sabe que existe.

### ¿Por qué PostgreSQL en el puerto 5433 y no 5432?

Porque 5432 suele estar ocupado por un Postgres nativo instalado en la
máquina, y eso producía un `P1000: Authentication failed` difícil de
diagnosticar. El `docker-compose.yml` expone 5433 a propósito.

### ¿Cómo se garantiza que la IA no invente datos?

Tres capas, en orden:
1. **Esquema zod** — la respuesta tiene que tener exactamente la forma
   esperada; si no, se rechaza y se reintenta.
2. **Coherencia estructural** — `coherence.js` verifica contra lo ya
   aprobado: un endpoint debe apuntar a una entidad que exista, una pantalla
   a un campo y a un endpoint que existan. Comparación exacta, no textual.
3. **Consistencia cruzada** — el motor de reglas (`modules/consistency/`)
   compara etapas entre sí antes de permitir la generación final.

Y lo que puede derivarse sin modelo (diagramas, datos de ejemplo,
documentos) directamente no se le pide a la IA.

### ¿Por qué el chequeo de consistencia solo mira lo aprobado?

Porque un borrador es trabajo en curso. Si mirara borradores, el estado del
proyecto cambiaría mientras la persona está editando. La contra es que
ajustar con IA no mueve la aguja hasta aprobar: por eso la respuesta
incluye `pendingApproval` y la interfaz lo dice explícitamente.

### ¿Qué pasa si el modelo devuelve algo inválido o se cuelga?

Se valida y se rechaza antes de persistir nada (no queda estado a medias),
se reintenta una vez si el error es transitorio, y el usuario ve un mensaje
accionable en español. Cubierto por `tests/functional/ai-failure.routes.test.js`.

### ¿Por qué 404 y no 403 cuando no sos miembro de un proyecto?

Para no filtrar la existencia de proyectos ajenos: un 403 confirmaría que
ese id existe. El 403 se reserva para cuando **sí** sos miembro pero tu rol
no alcanza.

### ¿Cómo se evita que dos usuarios pisen el mismo borrador?

Hay como mucho un `DRAFT` por etapa y se actualiza en el lugar, con
`createdById` registrando quién lo tocó último. No hay bloqueo optimista:
es una limitación conocida, aceptable para el tamaño de equipo previsto.

### ¿Por qué los diagramas se re-derivan al leer en vez de servir lo guardado?

Porque son 100% derivables del contenido estructurado. Cuando se corrigió un
bug del generador, las versiones ya guardadas seguían devolviendo el texto
roto para siempre; derivando al leer, esas filas se sanan solas sin
migración.

### ¿Qué pasa si se cae el proveedor de IA?

El proyecto no se pierde: todo lo aprobado está en la base. Las etapas de
generación fallan con un mensaje claro y se pueden reintentar. Las etapas
deterministas (documentos, diagramas, consistencia) siguen funcionando.

---

## 9. Propuesta de despliegue

Nada de esto está aplicado todavía: es la recomendación.

| Componente | Recomendación | Por qué |
|---|---|---|
| Base de datos | **Neon** o **Supabase** (Postgres administrado) | Plan gratuito suficiente, backups y SSL incluidos; evita administrar Docker en producción |
| Backend | **Railway** o **Render** | Despliegan desde el repo, corren migraciones en el build, variables de entorno por panel |
| Frontend | **Vercel** o **Netlify** | Build estático de Vite, CDN y HTTPS automáticos |
| IA | **Gemini API key** para empezar; **Vertex AI** si se necesita cuota mayor | El código ya elige solo según las credenciales presentes |

**Pasos de despliegue:**
1. Crear la base administrada y tomar su `DATABASE_URL`.
2. Backend: `npm run migrate:deploy` en el build, `npm start` como arranque.
3. Variables obligatorias: `DATABASE_URL`, `JWT_RSA_PRIVATE_KEY`,
   `JWT_RSA_PUBLIC_KEY`, `FRONTEND_URL`, y una credencial de IA
   (`GEMINI_API_KEY` o `GOOGLE_CLOUD_PROJECT`). Opcionales: `SSO_CLIENT_ID`,
   `SSO_CLIENT_SECRET`, `SSO_CALLBACK_URL`.
4. Frontend: `VITE_API_BASE_URL` apuntando al backend desplegado.
5. En el backend, `FRONTEND_URL` debe ser el dominio real del frontend
   (lo usa CORS y el callback de SSO).

**Pendientes antes de producción** (no resueltos hoy):
- Rotación de las claves RSA de sesión.
- Límite de tasa por usuario sobre los endpoints que gastan IA.
- Monitoreo de costo de IA por proyecto.
- Backups verificados de la base.
