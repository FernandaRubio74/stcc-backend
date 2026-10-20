# Catálogo de arquitecturas tecnológicas (US-028/US-029)

Documentación de las 5 arquitecturas base entre las que Ideator recomienda
(y el usuario puede elegir explícitamente) una para el producto definido.
El catálogo vive en código, no en base de datos ni generado por IA:
[`../../src/modules/architecture/catalog.js`](../../src/modules/architecture/catalog.js),
validado contra
[`catalog.schema.js`](../../src/modules/architecture/catalog.schema.js).

## Las 5 arquitecturas

1. **`monolito-modular`** — Monolito modular (Node.js + Express + PostgreSQL).
   Bajo costo operativo, buena velocidad de desarrollo inicial. Apropiado
   para un equipo chico que necesita iterar rápido.
2. **`serverless-managed`** — Serverless (funciones + servicios administrados).
   Sin servidores propios, costos variables según uso real. Apropiado para
   cargas variables o impredecibles.
3. **`microservicios-contenedores`** — Microservicios containerizados.
   Servicios independientes por dominio, cada uno con su propia base de
   datos. Apropiado cuando varios equipos trabajan en paralelo sobre
   dominios distintos, a cambio de mayor complejidad operativa.
4. **`jamstack-baas`** — JAMstack + Backend-as-a-Service. Frontend estático
   en una CDN, con un proveedor de BaaS cubriendo auth/BD/storage. Operación
   mínima, ideal para MVPs rápidos.
5. **`monolito-colas-eventos`** — Monolito modular con cola de eventos
   (ver sección siguiente).

## 5to escenario: monolito modular con cola de eventos (T-029.1/T-029.2)

**Problema que resuelve:** el monolito modular (escenario 1) atiende bien
cargas sincrónicas, pero tareas lentas o pesadas (notificaciones, reportes,
integraciones con proveedores externos como el de IA) bloquean el ciclo de
request/response si se ejecutan inline. Este escenario desacopla esas
tareas sin pagar el costo operativo completo de microservicios.

- **Base de datos:** PostgreSQL relacional (igual que el monolito modular),
  más una cola de mensajes (ej. Redis o RabbitMQ) para trabajos asíncronos.
- **Backend:** el mismo monolito Node.js/Express modular, más *workers*
  separados (procesos independientes) que consumen la cola para ejecutar
  tareas de larga duración.
- **Frontend:** SPA que consume la API síncrona del monolito; el resultado
  de una tarea encolada se refleja vía *polling* o notificaciones push
  cuando termina.
- **Comunicación:** síncrona (HTTP/REST) entre frontend y monolito;
  asíncrona (cola de mensajes, entrega al menos una vez) entre el monolito
  y los workers.
- **Infraestructura:** el monolito y los workers se despliegan como
  procesos separados — pueden escalar de forma independiente — más la
  infraestructura de la cola (administrada o autogestionada).
- **Operación:** requiere monitorear la profundidad de la cola y los
  workers por separado del monolito, con reintentos y una cola de mensajes
  fallidos (*dead-letter*) para tareas que fallan repetidamente.
- **Observabilidad:** métricas de profundidad de cola, latencia de
  procesamiento y tasa de reintentos/fallos de los workers, además de los
  logs y health checks ya existentes del monolito.
- **Autenticación / SSO / autorización:** autenticación JWT en el monolito
  (igual que el resto de escenarios); los workers no exponen API pública y
  se autentican contra la cola con credenciales de servicio, no de usuario
  final. El SSO, si aplica, se resuelve siempre en el monolito antes de
  encolar cualquier tarea — los workers nunca ven credenciales de usuario.

## Cómo se usa (US-028)

La IA recomienda uno de estos 5 ids a partir del problema, el alcance del
MVP, el modelo de datos y la API ya aprobados del proyecto
(`src/modules/architecture/prompts.js`), y el usuario puede aceptar esa
recomendación o elegir explícitamente cualquier otra opción del catálogo
(`POST /projects/:id/architecture/select`). Agregar un escenario nuevo en
el futuro requiere únicamente extender `catalog.js`: `catalog.schema.js` lo
valida automáticamente contra el mismo contrato que estos 5.
