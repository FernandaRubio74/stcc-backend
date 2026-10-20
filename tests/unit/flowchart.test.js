const { generateNavigationFlowchart } = require('../../src/modules/screens/flowchart');

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

    expect(diagram).toContain('Login -->|login exitoso| Dashboard');
  });

  test('sanitiza nombres con espacios o caracteres especiales para usarlos como ids', () => {
    const screens = [{ name: 'Mis Tickets (nuevo)', purpose: 'p', mainElements: ['lista'], visibleToRoles: ['owner'] }];
    const diagram = generateNavigationFlowchart(screens, []);

    expect(diagram).toContain('Mis_Tickets__nuevo_["Mis Tickets (nuevo)"]');
  });
});
