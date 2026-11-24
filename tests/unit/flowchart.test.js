const { generateNavigationFlowchart, sanitizeEdgeLabel } = require('../../src/modules/screens/flowchart');

describe('generateNavigationFlowchart', () => {
  test('genera un flowchart Mermaid con un nodo por pantalla', () => {
    const screens = [
      { name: 'Login', purpose: 'p', mainElements: ['form'], visibleToRoles: ['owner'] },
      { name: 'Dashboard', purpose: 'p', mainElements: ['lista'], visibleToRoles: ['owner'] },
    ];
    const diagram = generateNavigationFlowchart(screens, []);

    expect(diagram).toContain('flowchart TD');
    expect(diagram).toContain('Login["Login"]');
    expect(diagram).toContain('Dashboard["Dashboard"]');
  });

  test('genera una linea de conexion por cada entrada de navigation, con label si tiene', () => {
    const screens = [
      { name: 'Login', purpose: 'p', mainElements: ['form'], visibleToRoles: ['owner'] },
      { name: 'Dashboard', purpose: 'p', mainElements: ['lista'], visibleToRoles: ['owner'] },
    ];
    const navigation = [{ from: 'Login', to: 'Dashboard', label: 'login exitoso' }];

    const diagram = generateNavigationFlowchart(screens, navigation);

    expect(diagram).toContain('Login -->|"login exitoso"| Dashboard');
  });

  test('sanitiza nombres con espacios o caracteres especiales para usarlos como ids', () => {
    const screens = [{ name: 'Mis Tickets (nuevo)', purpose: 'p', mainElements: ['lista'], visibleToRoles: ['owner'] }];
    const diagram = generateNavigationFlowchart(screens, []);

    expect(diagram).toContain('Mis_Tickets__nuevo_["Mis Tickets (nuevo)"]');
  });

  test('cita el label de navegacion porque, a diferencia del nombre de pantalla, va sin comillas dentro de |...| y Mermaid rompe con parentesis ahi (bug real visto en pruebas manuales)', () => {
    const screens = [
      { name: 'Envios', purpose: 'p', mainElements: [], visibleToRoles: ['owner'] },
      { name: 'Etiquetas', purpose: 'p', mainElements: [], visibleToRoles: ['owner'] },
    ];
    const navigation = [{ from: 'Envios', to: 'Etiquetas', label: 'Ver etiquetas (envío cerrado)' }];

    const diagram = generateNavigationFlowchart(screens, navigation);

    expect(diagram).toContain('Envios -->|"Ver etiquetas (envío cerrado)"| Etiquetas');
  });

  test('sanitizeEdgeLabel escapa comillas internas (cerrarian el label antes de tiempo) y colapsa saltos de linea', () => {
    expect(sanitizeEdgeLabel('dice "hola"')).toBe("dice 'hola'");
    expect(sanitizeEdgeLabel('linea 1\nlinea 2')).toBe('linea 1 linea 2');
  });
});

/**
 * Mismo problema que el diagrama ER: el nombre de pantalla va dentro de
 * `["..."]`, asi que una comilla doble en el nombre cierra la etiqueta
 * antes de tiempo y rompe el diagrama entero. Las etiquetas de navegacion
 * ya escapaban las comillas; los nodos no.
 */
describe('nombres de pantalla con caracteres que rompen Mermaid', () => {
  test('escapa las comillas dobles del nombre de la pantalla', () => {
    const diagram = generateNavigationFlowchart([{ name: 'Pantalla "especial"' }], []);

    const nodo = diagram.split('\n').find((line) => line.includes('Pantalla'));
    expect((nodo.match(/"/g) || []).length).toBe(2);
    expect(nodo).toContain("Pantalla 'especial'");
  });

  test('un nombre con espacios o parentesis sigue funcionando igual', () => {
    const diagram = generateNavigationFlowchart([{ name: 'Registro de Ventas (diario)' }], []);

    expect(diagram).toContain('Registro_de_Ventas__diario_["Registro de Ventas (diario)"]');
  });
});
