/**
 * T-028.1 - Catalogo fijo de escenarios de arquitectura. A diferencia de
 * entities/endpoints/screens, esto NO lo genera la IA: es documentacion
 * tecnica de Ideator (ver docs del proyecto), y la IA solo elige entre
 * estas opciones (ver prompts.js). El 5to escenario se agrega en US-029.
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
    infrastructure:
      'Un unico proceso de aplicacion desplegado en una VM o contenedor, mas una base de datos administrada; escalado vertical o por replicas identicas detras de un balanceador.',
    operation:
      'Logs centralizados y health checks simples; un solo deploy pipeline. Apropiado cuando un equipo chico necesita iterar rapido sin la complejidad de servicios distribuidos.',
  },
  {
    id: 'serverless-managed',
    name: 'Serverless (funciones + servicios administrados)',
    summary:
      'Sin servidores propios: funciones por caso de uso y una base de datos administrada con autoscaling. Costos variables segun uso real.',
    persistence: 'Base de datos administrada con autoscaling (ej. Aurora Serverless o equivalente).',
    backend: 'Funciones (ej. AWS Lambda + API Gateway) desacopladas por caso de uso, sin servidor propio que mantener.',
    frontend: 'SPA o sitio pre-renderizado servido desde una CDN, independiente del backend.',
    infrastructure:
      'Infraestructura como codigo, sin servidores a administrar; escalado automatico por invocacion, sin capacidad reservada.',
    operation:
      'Observabilidad delegada al proveedor cloud (logs y metricas administradas); costo proporcional al uso, apropiado para cargas variables o impredecibles.',
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
    infrastructure:
      'Orquestador de contenedores (ej. Kubernetes); cada servicio escala de forma independiente segun su propia carga.',
    operation:
      'Requiere observabilidad distribuida (tracing entre servicios) y mayor esfuerzo operativo; apropiado cuando varios equipos trabajan en paralelo sobre dominios distintos.',
  },
  {
    id: 'jamstack-baas',
    name: 'JAMstack + Backend-as-a-Service',
    summary:
      'Frontend estatico servido desde una CDN, con un proveedor de Backend-as-a-Service cubriendo autenticacion, base de datos y storage. Operacion minima, ideal para MVPs rapidos.',
    persistence: 'Base de datos gestionada por el proveedor de BaaS (incluye autenticacion y storage administrados).',
    backend: 'Logica de negocio minima en funciones edge o triggers; el BaaS cubre auth, storage y CRUD basico.',
    frontend: 'Sitio estatico o SPA pre-renderizado, servido desde una CDN.',
    infrastructure: 'Sin servidores propios: el proveedor del BaaS administra el runtime completo.',
    operation:
      'Operacion minima, ya que el BaaS absorbe gran parte del mantenimiento; apropiado para productos chicos o validaciones rapidas de MVP.',
  },
];

module.exports = { ARCHITECTURE_CATALOG };
