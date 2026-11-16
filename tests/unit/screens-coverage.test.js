/**
 * T-027.4 - Tests de la validacion de cobertura MVP-pantallas.
 */
const { validateMvpCoverage } = require('../../src/modules/screens/coverage');
const { MvpCoverageError } = require('../../src/modules/screens/screens.errors');

const MVP_SCOPE = { in: ['Priorizacion de tickets'], out: ['Reportes avanzados'] };

function screen(name, purpose, mainElements = []) {
  return { name, purpose, mainElements, visibleToRoles: ['owner'] };
}

describe('validateMvpCoverage', () => {
  test('no lanza nada si toda funcionalidad in-scope tiene una pantalla asociada y ninguna pantalla menciona out-of-scope', () => {
    const screens = [screen('Cola de tickets', 'Permite la priorizacion de tickets entrantes')];

    expect(() => validateMvpCoverage(screens, MVP_SCOPE)).not.toThrow();
  });

  test('lanza MvpCoverageError si una funcionalidad in-scope no tiene ninguna pantalla asociada', () => {
    const screens = [screen('Login', 'Autenticacion de usuarios')];

    expect(() => validateMvpCoverage(screens, MVP_SCOPE)).toThrow(MvpCoverageError);
  });

  test('lanza MvpCoverageError si una pantalla menciona una funcionalidad explicitamente fuera del MVP', () => {
    const screens = [
      screen('Cola de tickets', 'Permite la priorizacion de tickets entrantes'),
      screen('Reportes', 'Pantalla de reportes avanzados'),
    ];

    expect(() => validateMvpCoverage(screens, MVP_SCOPE)).toThrow(MvpCoverageError);
  });

  test('cubre una funcionalidad del MVP descrita con una oracion larga (wizard real), sin repetirla textualmente', () => {
    const longScope = {
      in: ['Panel simple para dueños: alta de sede y canchas, edición básica de datos'],
      out: [],
    };
    const screens = [screen('Panel del dueño', 'Permite gestionar sedes y canchas, editando sus datos basicos')];

    expect(() => validateMvpCoverage(screens, longScope)).not.toThrow();
  });

  test('sigue detectando una funcionalidad del MVP sin ninguna pantalla relacionada, incluso con oraciones largas', () => {
    const longScope = {
      in: ['Panel simple para dueños: alta de sede y canchas, edición básica de datos'],
      out: [],
    };
    const screens = [screen('Login', 'Autenticacion de usuarios')];

    expect(() => validateMvpCoverage(screens, longScope)).toThrow(MvpCoverageError);
  });

  test('ignora entradas de mvpScope.in redactadas como negacion (el wizard a veces repite ahi una exclusion)', () => {
    const scopeWithNegations = {
      in: ['Reserva como invitado', 'Sin pagos online', 'Sin reseñas/comentarios'],
      out: ['Pagos online e integraciones de cobro', 'Sistema de reseñas/comentarios'],
    };
    const screens = [screen('Reserva', 'Permite reservar como invitado con nombre y telefono')];

    expect(() => validateMvpCoverage(screens, scopeWithNegations)).not.toThrow();
  });

  test('no marca una pantalla legitima como fuga solo por compartir alguna palabra con una frase aclaratoria de out-of-scope', () => {
    const scope = {
      in: ['Reserva como invitado'],
      out: ['Cuentas/registro del jugador (el jugador reserva como invitado)'],
    };
    const screens = [screen('Reserva', 'Permite al jugador reservar como invitado con nombre y telefono')];

    expect(() => validateMvpCoverage(screens, scope)).not.toThrow();
  });
});
