/**
 * T-028.1/T-029.1-3 - Catalogo fijo de escenarios de arquitectura. A
 * diferencia de entities/endpoints/screens, esto NO lo genera la IA: es
 * documentacion tecnica de Ideator, y la IA solo elige entre estas
 * opciones (ver prompts.js). El 5to escenario (monolito-colas-eventos) se
 * agrego en US-029, que tambien exigio documentar comunicacion,
 * observabilidad y autenticacion/SSO/autorizacion para todo el catalogo.
 */
const ARCHITECTURE_CATALOG = [
  {
    id: 'monolito-modular',
    name: 'Monolito modular (Node.js + Express + PostgreSQL)',
    summary:
      'Aplicacion unica organizada por modulos de dominio, con una base de datos relacional. Bajo costo operativo y buena velocidad de desarrollo inicial.',
    persistence: 'PostgreSQL relacional, un esquema por aplicacion, migraciones versionadas (ej. Prisma).',
    backend:
      'Monolito Node.js/Express organizado por modulos de dominio, con capas de servicio y controlador separadas dentro del mismo proceso.',
    frontend: 'SPA (ej. React) que consume la API REST del monolito via HTTPS.',
    communication:
      'Comunicacion sincrona HTTP/REST entre el frontend y el monolito; dentro del monolito, los modulos se comunican via llamadas de funcion en el mismo proceso.',
    infrastructure:
      'Un unico proceso de aplicacion desplegado en una VM o contenedor, mas una base de datos administrada; escalado vertical o por replicas identicas detras de un balanceador.',
    operation:
      'Logs centralizados y health checks simples; un solo deploy pipeline. Apropiado cuando un equipo chico necesita iterar rapido sin la complejidad de servicios distribuidos.',
    observability: 'Logs centralizados (stdout agregado) y health checks HTTP simples; metricas basicas de latencia y tasa de error por endpoint.',
    authSsoAuthorization:
      'Autenticacion JWT propia o SSO (ej. Google OAuth2) resuelta en el monolito; autorizacion por rol de membresia verificada en cada request.',
  },
  {
    id: 'serverless-managed',
    name: 'Serverless (funciones + servicios administrados)',
    summary:
      'Sin servidores propios: funciones por caso de uso y una base de datos administrada con autoscaling. Costos variables segun uso real.',
    persistence: 'Base de datos administrada con autoscaling (ej. Aurora Serverless o equivalente).',
    backend: 'Funciones (ej. AWS Lambda + API Gateway) desacopladas por caso de uso, sin servidor propio que mantener.',
    frontend: 'SPA o sitio pre-renderizado servido desde una CDN, independiente del backend.',
    communication:
      'HTTP/REST entre el frontend y el API Gateway, que invoca la funcion correspondiente; sin comunicacion directa entre funciones salvo que se orquesten explicitamente.',
    infrastructure:
      'Infraestructura como codigo, sin servidores a administrar; escalado automatico por invocacion, sin capacidad reservada.',
    operation:
      'Observabilidad delegada al proveedor cloud (logs y metricas administradas); costo proporcional al uso, apropiado para cargas variables o impredecibles.',
    observability: 'Logs y metricas administrados por el proveedor cloud (ej. CloudWatch); tracing distribuido limitado a lo que el proveedor expone.',
    authSsoAuthorization:
      'Autenticacion delegada a un servicio administrado (ej. Cognito/Auth0) o JWT validado en el API Gateway antes de invocar la funcion; SSO tipicamente soportado nativamente por el proveedor de identidad.',
  },
  {
    id: 'microservicios-contenedores',
    name: 'Microservicios containerizados',
    summary:
      'Servicios independientes por dominio, cada uno con su propia base de datos, orquestados en contenedores. Mayor complejidad operativa a cambio de escalado y despliegue independientes.',
    persistence: 'Una base de datos por servicio (posiblemente poliglota), cada equipo dueño de su propio esquema.',
    backend:
      'Servicios independientes por dominio de negocio, comunicados por HTTP o mensajeria, cada uno desplegable por separado.',
    frontend: 'SPA que consume un API gateway, el cual enruta las peticiones al servicio correspondiente.',
    communication:
      'HTTP/REST o mensajeria asincrona entre servicios, enrutada a traves de un API gateway desde el frontend; requiere definir contratos explicitos entre servicios.',
    infrastructure:
      'Orquestador de contenedores (ej. Kubernetes); cada servicio escala de forma independiente segun su propia carga.',
    operation:
      'Requiere observabilidad distribuida (tracing entre servicios) y mayor esfuerzo operativo; apropiado cuando varios equipos trabajan en paralelo sobre dominios distintos.',
    observability: 'Tracing distribuido (ej. OpenTelemetry) obligatorio para seguir una request a traves de varios servicios; dashboards y alertas por servicio.',
    authSsoAuthorization:
      'Autenticacion centralizada en el API gateway (JWT/SSO), propagada a los servicios internos via un token de servicio; autorizacion fina puede delegarse a cada servicio segun su dominio.',
  },
  {
    id: 'jamstack-baas',
    name: 'JAMstack + Backend-as-a-Service',
    summary:
      'Frontend estatico servido desde una CDN, con un proveedor de Backend-as-a-Service cubriendo autenticacion, base de datos y storage. Operacion minima, ideal para MVPs rapidos.',
    persistence: 'Base de datos gestionada por el proveedor de BaaS (incluye autenticacion y storage administrados).',
    backend: 'Logica de negocio minima en funciones edge o triggers; el BaaS cubre auth, storage y CRUD basico.',
    frontend: 'Sitio estatico o SPA pre-renderizado, servido desde una CDN.',
    communication:
      'El frontend llama directamente a las APIs del BaaS (auth, base de datos, storage); las funciones edge, si existen, se invocan via HTTP desde el frontend o triggers del propio BaaS.',
    infrastructure: 'Sin servidores propios: el proveedor del BaaS administra el runtime completo.',
    operation:
      'Operacion minima, ya que el BaaS absorbe gran parte del mantenimiento; apropiado para productos chicos o validaciones rapidas de MVP.',
    observability: 'Logs y metricas basicas expuestos por el dashboard del proveedor de BaaS; observabilidad limitada a lo que el proveedor ofrece.',
    authSsoAuthorization:
      'Autenticacion y SSO provistos nativamente por el BaaS (ej. email/password, Google, etc.); autorizacion via reglas declarativas del proveedor (row-level security o policies).',
  },
  {
    id: 'monolito-colas-eventos',
    name: 'Monolito modular con cola de eventos (procesamiento asincrono)',
    summary:
      'Extiende el monolito modular con una cola de mensajes para desacoplar tareas pesadas o lentas del ciclo de request/response, sin la complejidad operativa de microservicios.',
    persistence: 'PostgreSQL relacional (igual que el monolito modular) mas una cola de mensajes (ej. Redis/RabbitMQ) para trabajos asincronos.',
    backend:
      'Mismo monolito Node.js/Express modular, mas workers separados que consumen la cola para tareas de larga duracion (notificaciones, reportes, integraciones externas).',
    frontend:
      'SPA que consume la API sincrona del monolito; las tareas encoladas se reflejan via polling o notificaciones push cuando terminan.',
    communication:
      'Comunicacion sincrona via HTTP/REST entre frontend y monolito; comunicacion asincrona entre el monolito y los workers via la cola de mensajes (entrega al menos una vez).',
    infrastructure:
      'El monolito y los workers se despliegan como procesos separados (pueden escalar independientemente), mas la infraestructura de la cola (administrada o autogestionada).',
    operation:
      'Requiere monitorear la profundidad de la cola y los workers por separado del monolito; reintentos y colas de mensajes fallidos (dead-letter) para tareas que fallan repetidamente.',
    observability:
      'Metricas de profundidad de cola, latencia de procesamiento y tasa de reintentos/fallos de los workers, ademas de los logs y health checks del monolito.',
    authSsoAuthorization:
      'Autenticacion JWT en el monolito (igual que el resto de escenarios); los workers no exponen API publica y se autentican contra la cola con credenciales de servicio, no de usuario final; el SSO (si aplica) se resuelve siempre en el monolito antes de encolar cualquier tarea.',
  },
];

module.exports = { ARCHITECTURE_CATALOG };
