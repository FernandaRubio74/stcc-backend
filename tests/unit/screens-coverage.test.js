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
});
