/**
 * Renderizador deterministico: especificacion de pantalla -> documento HTML
 * autocontenido. Misma especificacion + mismas opciones => exactamente el
 * mismo HTML (no hay fechas, ni aleatoriedad, ni orden de objeto variable).
 *
 * Seguridad: todo el texto pasa por `esc()` (ver html.js), no se inserta
 * HTML crudo del modelo, no se emite ningun <script>, y el documento
 * declara una CSP que bloquea scripts y cualquier recurso externo. Asi la
 * maqueta es segura tanto dentro del iframe de la app como abierta a mano
 * desde el zip.
 */
const { esc, join } = require('./html');
const { buildTokens } = require('./tokens');
const { buildStyles } = require('./styles');
const c = require('./components');

const VIEWPORTS = { desktop: 1280, mobile: 390 };

/**
 * CSP: solo se permite el CSS en linea del propio documento. `script-src
 * 'none'` y `default-src 'none'` dejan fuera scripts, imagenes remotas,
 * fuentes y cualquier fetch.
 */
const CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

/**
 * Deriva una especificacion minima para una pantalla que todavia no tiene
 * `layout` (versiones guardadas antes de esta funcionalidad): se respeta lo
 * que haya en `mainElements` para no inventar nada que la pantalla no
 * declare.
 */
function deriveLayout(screen) {
  const elements = screen.mainElements || [];
  const blocks = [];

  const listed = elements.filter((element) => element.type === 'list');
  const fields = elements.filter((element) => element.type === 'field' || element.type === 'form');
  const texts = elements.filter((element) => element.type === 'text');

  listed.forEach((element) => {
    blocks.push({
      kind: 'list',
      title: element.label,
      items: [{ primary: element.label, secondary: element.dataField || '', meta: '', badge: null }],
      refs: { dataField: element.dataField || null, endpointRef: element.endpointRef || null },
    });
  });

  if (fields.length > 0) {
    blocks.push({
      kind: 'form',
      title: 'Datos',
      description: '',
      fields: fields.map((element) => ({
        label: element.label,
        control: 'text',
        value: '',
        placeholder: '',
        help: element.dataField || '',
        error: '',
        required: false,
        options: [],
        dataField: element.dataField || null,
      })),
      submit: null,
      refs: {},
    });
  }

  texts.forEach((element) => blocks.push({ kind: 'text', title: '', body: element.label }));

  if (blocks.length === 0) {
    blocks.push({ kind: 'text', title: '', body: screen.purpose || screen.name });
  }

  const primary = elements.find((element) => element.type === 'button');

  return {
    pageTitle: screen.name,
    subtitle: screen.purpose || '',
    navSection: screen.name,
    breadcrumbs: [],
    primaryAction: primary ? { label: primary.label, variant: 'primary', endpointRef: primary.endpointRef || null, navigatesTo: null, roles: [] } : null,
    secondaryActions: [],
    blocks,
    states: {
      loadingLabel: 'Cargando…',
      emptyTitle: 'Todavía no hay datos',
      emptyBody: '',
      errorTitle: 'No se pudo cargar la información',
      errorBody: '',
      successMessage: '',
    },
    annotations: [],
    roles: [],
  };
}

function layoutOf(screen) {
  return screen.layout || deriveLayout(screen);
}

/** Indices de anotacion: se asignan en orden de aparicion, de forma estable. */
function createAnnotationIndexer(annotations) {
  const pending = [...(annotations || [])];
  const used = [];
  return {
    nextAnn(source) {
      const key = source && (source.title || source.label || source.pageTitle);
      const hit = pending.findIndex((entry) => entry.target === key);
      if (hit === -1) return 0;
      const [entry] = pending.splice(hit, 1);
      used.push(entry);
      return used.length;
    },
    used: () => used,
  };
}

function renderBlock(block, context) {
  switch (block.kind) {
    case 'stats':
      return c.stats(block, context);
    case 'table':
      return c.table(block, context);
    case 'form':
      return c.form(block, context);
    case 'cards':
      return c.cards(block, context);
    case 'list':
      return c.list(block, context);
    case 'detail':
      return c.detail(block, context);
    case 'tabs':
      return c.tabs(block, context);
    case 'text':
    default:
      return c.textBlock(block, context);
  }
}

/**
 * Filtra acciones que no corresponden al rol activo. Una accion sin `roles`
 * la ve cualquiera; con `roles`, solo esos. Es lo que impide que la pantalla
 * de un rol ofrezca una accion reservada a otro.
 */
function allowedForRole(action, role) {
  if (!action) return null;
  const roles = action.roles || [];
  if (!role || roles.length === 0) return action;
  return roles.includes(role) ? action : null;
}

function filterBlockByRole(block, role) {
  if (!role) return block;
  if (block.kind === 'table') return { ...block, rowAction: allowedForRole(block.rowAction, role) };
  if (block.kind === 'form') return { ...block, submit: allowedForRole(block.submit, role) };
  if (block.kind === 'cards') {
    return { ...block, items: block.items.map((item) => ({ ...item, action: allowedForRole(item.action, role) })) };
  }
  return block;
}

/** Cuerpo de la pantalla segun el estado pedido. */
function renderBody(layout, { state, annotationsOn, indexer, role }) {
  const states = layout.states || {};
  if (state === 'loading') return c.loadingState(states);
  if (state === 'error') return c.errorState(states);
  if (state === 'empty') return c.emptyState(states, allowedForRole(layout.primaryAction, role));

  const blocks = layout.blocks
    .map((block) => renderBlock(filterBlockByRole(block, role), { annotationsOn, nextAnn: indexer.nextAnn }))
    .join('');

  return (state === 'success' ? c.successBanner(states) : '') + blocks;
}

/**
 * @param {object} screen pantalla (con o sin `layout`)
 * @param {object} options
 * @param {string} options.projectName nombre del proyecto (marca y semilla del acento)
 * @param {string[]} options.sections secciones del menu (todas las pantallas del mapa)
 * @param {'desktop'|'mobile'} options.viewport
 * @param {'normal'|'loading'|'empty'|'error'|'success'} options.state
 * @param {boolean} options.annotations modo anotaciones
 * @param {string|null} options.role rol de dominio activo
 */
function renderScreenMockup(screen, options = {}) {
  const {
    projectName = 'Proyecto',
    sections = [],
    viewport = 'desktop',
    state = 'normal',
    annotations = false,
    role = null,
  } = options;

  const layout = layoutOf(screen);
  const tokens = buildTokens(projectName);
  const indexer = createAnnotationIndexer(layout.annotations);
  const navSections = sections.length > 0 ? sections : [layout.navSection];

  const headMark = indexer.nextAnn(layout);
  const body = renderBody(layout, { state, annotationsOn: annotations, indexer, role });

  const main =
    '<main class="main">' +
    c.breadcrumbs(layout.breadcrumbs) +
    c.pageHead({
      title: layout.pageTitle,
      subtitle: layout.subtitle,
      primaryAction: allowedForRole(layout.primaryAction, role),
      secondaryActions: (layout.secondaryActions || []).map((action) => allowedForRole(action, role)).filter(Boolean),
      annIndex: headMark,
      annotationsOn: annotations,
    }) +
    `<div class="stack">${body}</div>` +
    (annotations ? c.annotationList(indexer.used()) : '') +
    '</main>';

  const app =
    '<div class="app">' +
    c.topbar({ projectName, roleLabel: role || (layout.roles || [])[0] || '', userName: role || 'Usuario' }) +
    c.sidenav({ sections: navSections, activeSection: layout.navSection, viewport }) +
    main +
    '</div>';

  return (
    '<!doctype html>\n' +
    '<html lang="es">\n<head>\n' +
    '<meta charset="utf-8">\n' +
    `<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">\n` +
    `<meta name="viewport" content="width=${VIEWPORTS[viewport] || VIEWPORTS.desktop}, initial-scale=1">\n` +
    `<title>${esc(layout.pageTitle)} · ${esc(projectName)}</title>\n` +
    `<style>\n${buildStyles(tokens, viewport)}\n</style>\n` +
    '</head>\n<body>\n' +
    app +
    '\n</body>\n</html>'
  );
}

/** Todas las variantes de una pantalla, para la galeria y el zip. */
function renderScreenVariants(screen, options = {}) {
  const states = ['normal', 'loading', 'empty', 'error'];
  const result = { desktop: {}, mobile: {} };
  ['desktop', 'mobile'].forEach((viewport) => {
    states.forEach((state) => {
      result[viewport][state] = renderScreenMockup(screen, { ...options, viewport, state });
    });
  });
  return result;
}

module.exports = { renderScreenMockup, renderScreenVariants, deriveLayout, layoutOf, CSP, VIEWPORTS, join };
