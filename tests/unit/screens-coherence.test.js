/**
 * Tests de la validacion deterministica de que cada pantalla usa datos y
 * endpoints que de verdad existen en el modelo/API aprobados.
 */
const { validateScreenReferences } = require('../../src/modules/screens/coherence');
const { ScreenReferenceError } = require('../../src/modules/screens/screens.errors');

const ENTITIES = [{ name: 'Ticket', attributes: [{ name: 'title' }] }];
const ENDPOINTS = [{ method: 'GET', path: '/tickets' }];

function screenWithElement(element) {
  return { name: 'Cola', purpose: 'y', mainElements: [element], visibleToRoles: ['owner'] };
}

describe('validateScreenReferences', () => {
  test('no lanza nada si dataField/endpointRef existen o son null', () => {
    const screens = [
      screenWithElement({ type: 'list', label: 'Lista', dataField: 'Ticket.title', endpointRef: 'GET /tickets' }),
      screenWithElement({ type: 'text', label: 'Titulo', dataField: null, endpointRef: null }),
    ];

    expect(() => validateScreenReferences(screens, { entities: ENTITIES, endpoints: ENDPOINTS })).not.toThrow();
  });

  test('lanza ScreenReferenceError si dataField no existe en el modelo de datos', () => {
    const screens = [screenWithElement({ type: 'list', label: 'Lista', dataField: 'Ticket.inexistente', endpointRef: null })];

    expect(() => validateScreenReferences(screens, { entities: ENTITIES, endpoints: ENDPOINTS })).toThrow(
      ScreenReferenceError
    );
  });

  test('lanza ScreenReferenceError si endpointRef no existe en la especificacion de API', () => {
    const screens = [screenWithElement({ type: 'button', label: 'Borrar', dataField: null, endpointRef: 'DELETE /tickets/1' })];

    expect(() => validateScreenReferences(screens, { entities: ENTITIES, endpoints: ENDPOINTS })).toThrow(
      ScreenReferenceError
    );
  });
});
