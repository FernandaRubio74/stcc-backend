/**
 * T-027.4 - Tests del diagnostico de cobertura MVP-pantallas.
 *
 * findUncoveredMvpFeatures es DIAGNOSTICO, no un gate: devuelve las
 * funcionalidades del MVP que no se ven reflejadas, pero no bloquea la
 * generacion (hallazgo H-04 de la revision transversal). La fuga de
 * alcance ya no se evalua aca: la cubre el motor de consistencia por
 * artefacto individual.
 */
const { findUncoveredMvpFeatures, validateRoleCoverage } = require('../../src/modules/screens/coverage');
const { RoleCoverageError } = require('../../src/modules/screens/screens.errors');

const MVP_SCOPE = { in: ['Priorizacion de tickets'], out: ['Reportes avanzados'] };

function screen(name, purpose, mainElements = []) {
  return { name, purpose, mainElements, visibleToRoles: ['owner'] };
}

describe('findUncoveredMvpFeatures', () => {
  test('no reporta nada si toda funcionalidad in-scope tiene una pantalla asociada', () => {
    const screens = [screen('Cola de tickets', 'Permite la priorizacion de tickets entrantes')];

    expect(findUncoveredMvpFeatures(screens, MVP_SCOPE)).toEqual([]);
  });

  test('reporta la funcionalidad in-scope que no tiene ninguna pantalla asociada', () => {
    const screens = [screen('Login', 'Autenticacion de usuarios')];

    expect(findUncoveredMvpFeatures(screens, MVP_SCOPE).length).toBeGreaterThan(0);
  });

  test('ya NO evalua fuga de alcance: eso lo detecta el motor de consistencia por artefacto', () => {
    const screens = [
      screen('Cola de tickets', 'Permite la priorizacion de tickets entrantes'),
      screen('Reportes', 'Pantalla de reportes avanzados'),
    ];

    expect(findUncoveredMvpFeatures(screens, MVP_SCOPE)).toEqual([]);
  });

  test('cubre una funcionalidad del MVP descrita con una oracion larga (wizard real), sin repetirla textualmente', () => {
    const longScope = {
      in: ['Panel simple para dueños: alta de sede y canchas, edición básica de datos'],
      out: [],
    };
    const screens = [screen('Panel del dueño', 'Permite gestionar sedes y canchas, editando sus datos basicos')];

    expect(findUncoveredMvpFeatures(screens, longScope)).toEqual([]);
  });

  test('sigue detectando una funcionalidad del MVP sin ninguna pantalla relacionada, incluso con oraciones largas', () => {
    const longScope = {
      in: ['Panel simple para dueños: alta de sede y canchas, edición básica de datos'],
      out: [],
    };
    const screens = [screen('Login', 'Autenticacion de usuarios')];

    expect(findUncoveredMvpFeatures(screens, longScope).length).toBeGreaterThan(0);
  });

  test('ignora entradas de mvpScope.in redactadas como negacion (el wizard a veces repite ahi una exclusion)', () => {
    const scopeWithNegations = {
      in: ['Reserva como invitado', 'Sin pagos online', 'Sin reseñas/comentarios'],
      out: ['Pagos online e integraciones de cobro', 'Sistema de reseñas/comentarios'],
    };
    const screens = [screen('Reserva', 'Permite reservar como invitado con nombre y telefono')];

    expect(findUncoveredMvpFeatures(screens, scopeWithNegations)).toEqual([]);
  });

  test('no marca una pantalla legitima como fuga solo por compartir alguna palabra con una frase aclaratoria de out-of-scope', () => {
    const scope = {
      in: ['Reserva como invitado'],
      out: ['Cuentas/registro del jugador (el jugador reserva como invitado)'],
    };
    const screens = [screen('Reserva', 'Permite al jugador reservar como invitado con nombre y telefono')];

    expect(findUncoveredMvpFeatures(screens, scope)).toEqual([]);
  });

  test('no reporta nada si la funcionalidad esta documentada en el modelo de datos/API en vez de en una pantalla', () => {
    const scope = {
      in: ['Actualizacion automatica de stock', 'Restriccion de accesos mediante roles de empleado'],
      out: [],
    };
    const screens = [screen('Ventas', 'Registrar una venta')];
    const dataModel = { entities: [{ name: 'Producto', attributes: [{ name: 'stock' }] }] };
    const apiSpec = {
      endpoints: [
        {
          method: 'POST',
          path: '/ventas',
          description: 'Registra la venta y actualiza automaticamente el stock del producto',
          resourceEntity: 'Venta',
        },
        {
          method: 'GET',
          path: '/empleados',
          description: 'Lista empleados; restringido por rol de empleado',
          resourceEntity: 'Empleado',
        },
      ],
    };

    expect(findUncoveredMvpFeatures(screens, scope, { dataModel, apiSpec })).toEqual([]);
  });

  test('una funcionalidad de roles sin reflejo textual se reporta como diagnostico (ya sin lista fija de palabras) pero no bloquea', () => {
    const scope = { in: ['Diferenciacion de roles (admin/dueño vs trabajador)'], out: [] };
    const screens = [
      { ...screen('Panel de administracion', 'Gestion general'), visibleToRoles: ['owner'] },
      { ...screen('Tareas del dia', 'Vista operativa diaria'), visibleToRoles: ['owner', 'editor', 'viewer'] },
    ];

    expect(findUncoveredMvpFeatures(screens, scope)).toEqual(scope.in);
  });

  test('reporta igual la funcionalidad de roles cuando no hay diferenciacion real por rol', () => {
    const scope = { in: ['Diferenciacion de roles (admin/dueño vs trabajador)'], out: [] };
    const screens = [
      { ...screen('Panel', 'x'), visibleToRoles: ['owner', 'editor', 'viewer'] },
      { ...screen('Tareas', 'y'), visibleToRoles: ['owner', 'editor', 'viewer'] },
    ];

    expect(findUncoveredMvpFeatures(screens, scope).length).toBeGreaterThan(0);
  });

  test('reporta la funcionalidad que no aparece en ningun lado (ni pantallas ni backend)', () => {
    const scope = { in: ['Actualizacion automatica de stock'], out: [] };
    const screens = [screen('Login', 'Autenticacion de usuarios')];

    expect(findUncoveredMvpFeatures(screens, scope, { dataModel: { entities: [] }, apiSpec: { endpoints: [] } })).toEqual(
      scope.in
    );
  });
});

function screenWithRoles(roles) {
  return { name: 'X', purpose: 'y', mainElements: [], visibleToRoles: roles };
}

describe('validateRoleCoverage', () => {
  test('no lanza nada si entre todas las pantallas se cubren los 3 roles', () => {
    const screens = [screenWithRoles(['owner']), screenWithRoles(['editor', 'viewer'])];

    expect(() => validateRoleCoverage(screens)).not.toThrow();
  });

  test('lanza RoleCoverageError si algun rol no tiene ninguna pantalla visible', () => {
    const screens = [screenWithRoles(['owner']), screenWithRoles(['editor'])];

    expect(() => validateRoleCoverage(screens)).toThrow(RoleCoverageError);
  });
});

/**
 * Hallazgo H-04 de la revision transversal (clase A, mismo patron que el
 * sintoma 3): la cobertura in-scope se decidia por coincidencia de palabras
 * sobre texto libre y BLOQUEABA la generacion. Reproduccion con el caso del
 * courier: una funcionalidad del MVP que SI esta implementada (campos
 * `peso` y `tipo` del paquete + una pantalla de pesaje) quedaba marcada
 * como "sin pantalla asociada" solo porque ninguna palabra clave de la
 * frase llegaba al umbral en un mismo artefacto.
 */
describe('H-04: la cobertura in-scope no puede bloquear por coincidencia de palabras', () => {
  const COURIER_SCOPE = { in: ['Pesaje diferenciado por tipo de contenido'], out: [] };
  const COURIER_SCREENS = [screen('PesajeScreen', 'Pesar el paquete y registrar el resultado')];
  const COURIER_CONTEXT = {
    dataModel: {
      entities: [
        {
          name: 'Paquete',
          attributes: [
            { name: 'id', type: 'uuid' },
            { name: 'peso', type: 'decimal' },
            { name: 'tipo', type: 'enum: seco | humedo' },
          ],
        },
      ],
    },
    apiSpec: { endpoints: [{ method: 'POST', path: '/paquetes/pesar', description: 'Registra el peso', resourceEntity: 'Paquete' }] },
  };

  // El heuristico sigue sin "ver" esta funcionalidad (sus palabras no
  // llegan al umbral en ningun artefacto) - la diferencia es que eso ahora
  // es un diagnostico y NO frena la generacion. El test de que no frena
  // esta a nivel de servicio (screens.service.test.js), que es donde el
  // bloqueo era observable.
  test('el heuristico puede no ver una funcionalidad que si esta implementada: queda como diagnostico', () => {
    expect(findUncoveredMvpFeatures(COURIER_SCREENS, COURIER_SCOPE, COURIER_CONTEXT)).toEqual(COURIER_SCOPE.in);
  });

  test('una funcionalidad de permisos ya no se exime por lista fija de palabras, pero tampoco bloquea', () => {
    const scope = { in: ['Que cada tipo de usuario vea solo lo suyo'], out: [] };
    const screens = [
      { name: 'ClasificacionScreen', purpose: 'Clasificar paquetes', mainElements: [], visibleToRoles: ['owner', 'editor'] },
      { name: 'HistorialScreen', purpose: 'Historial por destinatario', mainElements: [], visibleToRoles: ['owner'] },
    ];

    expect(findUncoveredMvpFeatures(screens, scope, COURIER_CONTEXT)).toEqual(scope.in);
  });

  test('la fuga de alcance la detecta el motor de consistencia por artefacto, no este chequeo: aca no bloquea', () => {
    const scope = { in: [], out: ['Rastreo de paquetes'] };
    const screens = [screen('RastreoScreen', 'Rastreo de paquetes en tiempo real')];

    expect(findUncoveredMvpFeatures(screens, scope, COURIER_CONTEXT)).toEqual([]);
  });
});
