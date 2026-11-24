/**
 * Libreria de componentes del maquetado. Cada funcion devuelve HTML ya
 * escapado y usa unicamente clases definidas en styles.js (los valores
 * salen de los tokens, nunca hay color ni espaciado suelto aca).
 *
 * Todas las funciones son puras: misma entrada, misma salida. Es lo que
 * hace que el renderizado sea deterministico.
 */
const { esc, cls, join } = require('./html');
const { icon, iconFor } = require('./icons');

const TONES = new Set(['neutral', 'success', 'warning', 'danger', 'info']);

function toneClass(tone) {
  return TONES.has(tone) ? tone : 'neutral';
}

/** Marcador numerado de anotacion, solo si el modo esta activo. */
function annotationMark(index, enabled) {
  if (!enabled || !index) return '';
  return `<span class="ann">${esc(index)}</span>`;
}

function badge(text, tone = 'neutral') {
  if (!text) return '';
  return `<span class="badge badge-${esc(toneClass(tone))}">${esc(text)}</span>`;
}

function button(action, { fallbackVariant = 'secondary' } = {}) {
  if (!action || !action.label) return '';
  const variant = action.variant || fallbackVariant;
  const iconName = variant === 'primary' ? 'plus' : null;
  return (
    `<span class="btn btn-${esc(variant)}">` +
    (iconName ? icon(iconName, 16) : '') +
    esc(action.label) +
    '</span>'
  );
}

function brandMark(projectName) {
  const initial = String(projectName || 'G').trim().charAt(0).toUpperCase() || 'G';
  return `<span class="brand-mark">${esc(initial)}</span>`;
}

function topbar({ projectName, roleLabel, userName }) {
  const initials = String(userName || roleLabel || 'U')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return (
    '<header class="topbar">' +
    `<div class="brand">${brandMark(projectName)}<span class="brand-name">${esc(projectName)}</span></div>` +
    '<div class="user-menu">' +
    (roleLabel ? `<span class="user-role">${esc(roleLabel)}</span>` : '') +
    `<span class="avatar">${esc(initials || 'U')}</span>` +
    `<span class="nav-icon">${icon('chevron', 16)}</span>` +
    '</div>' +
    '</header>'
  );
}

function sidenav({ sections, activeSection, viewport }) {
  const items = sections
    .map((section) => {
      const active = section === activeSection;
      return (
        `<span class="${cls('nav-item', active && 'is-active')}"${active ? ' aria-current="page"' : ''}>` +
        `<span class="nav-icon">${icon(iconFor(section), viewport === 'mobile' ? 20 : 18)}</span>` +
        `<span>${esc(section)}</span>` +
        '</span>'
      );
    })
    .join('');

  const label = viewport === 'mobile' ? '' : '<span class="nav-group-label">Secciones</span>';
  return `<nav class="sidenav" aria-label="Navegación principal">${label}${items}</nav>`;
}

function breadcrumbs(items) {
  if (!items || items.length === 0) return '';
  const parts = items
    .map((item, i) => (i === 0 ? `<span>${esc(item)}</span>` : `<span class="sep">${icon('chevron', 12)}</span><span>${esc(item)}</span>`))
    .join('');
  return `<nav class="breadcrumbs" aria-label="Ruta">${parts}</nav>`;
}

function pageHead({ title, subtitle, primaryAction, secondaryActions, annIndex, annotationsOn }) {
  const actions = join([
    ...(secondaryActions || []).map((action) => button(action, { fallbackVariant: 'secondary' })),
    primaryAction ? button({ ...primaryAction, variant: 'primary' }) : '',
  ]);
  return (
    '<div class="page-head">' +
    '<div>' +
    `<h1 class="page-title">${esc(title)}${annotationMark(annIndex, annotationsOn)}</h1>` +
    (subtitle ? `<p class="page-subtitle">${esc(subtitle)}</p>` : '') +
    '</div>' +
    (actions ? `<div class="page-actions">${actions}</div>` : '') +
    '</div>'
  );
}

function stats(block, { annotationsOn, nextAnn }) {
  const items = block.items
    .map((item) => {
      const mark = annotationMark(nextAnn(item), annotationsOn);
      return (
        '<div class="stat">' +
        `<p class="stat-label">${esc(item.label)}${mark}</p>` +
        `<div class="stat-value">${esc(item.value)}</div>` +
        (item.delta ? `<div class="stat-delta badge badge-${esc(toneClass(item.tone))}">${esc(item.delta)}</div>` : '') +
        '</div>'
      );
    })
    .join('');
  return `<section class="stats">${items}</section>`;
}

function toolbar(block) {
  if (!block.searchable && (!block.filters || block.filters.length === 0)) return '';
  const search = block.searchable
    ? `<span class="search">${icon('search', 16)}<span class="search-text">Buscar…</span></span>`
    : '';
  const chips = (block.filters || []).map((filter) => `<span class="chip">${esc(filter)}</span>`).join('');
  return `<div class="toolbar">${search}${chips}</div>`;
}

function table(block, { annotationsOn, nextAnn }) {
  const mark = annotationMark(nextAnn(block), annotationsOn);
  const head = block.columns
    .map((column) => `<th${column.kind === 'number' ? ' class="num"' : ''}>${esc(column.header)}</th>`)
    .join('');

  const body = (block.rows || [])
    .map((row) => {
      const cells = block.columns
        .map((column, i) => {
          const cell = row[i] || { value: '', tone: 'neutral' };
          const content = column.kind === 'badge' ? badge(cell.value, cell.tone) : esc(cell.value);
          const numeric = column.kind === 'number' ? ' class="num"' : '';
          return `<td data-label="${esc(column.header)}"${numeric}>${content}</td>`;
        })
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  const pagination = block.pagination
    ? '<div class="pagination">' +
      `<span>${esc(block.pagination)}</span>` +
      '<span class="pager"><span>Anterior</span><span class="is-active">1</span><span>2</span><span>Siguiente</span></span>' +
      '</div>'
    : '';

  return (
    '<section class="card">' +
    (block.title
      ? `<div class="card-head"><h2 class="card-title">${esc(block.title)}${mark}</h2>${button(block.rowAction)}</div>`
      : '') +
    toolbar(block) +
    `<div class="table-wrap"><table class="data"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>` +
    pagination +
    '</section>'
  );
}

function field(spec) {
  const required = spec.required ? '<span class="field-required" aria-hidden="true"> *</span>' : '';
  const labelHtml = `<span class="field-label">${esc(spec.label)}${required}</span>`;

  if (spec.control === 'checkbox') {
    return (
      '<div class="field">' +
      `<span class="checkbox-row"><span class="checkbox">${spec.value ? icon('check', 14) : ''}</span>${labelHtml}</span>` +
      (spec.help ? `<span class="field-help">${esc(spec.help)}</span>` : '') +
      '</div>'
    );
  }

  const shown = spec.value || spec.placeholder || '';
  const control =
    `<span class="${cls('input', !spec.value && 'is-placeholder', spec.error && 'is-error', spec.control === 'textarea' && 'input-area')}">` +
    `<span>${esc(shown)}</span>` +
    (spec.control === 'select' ? icon('chevron', 16) : '') +
    (spec.control === 'date' ? icon('clock', 16) : '') +
    '</span>';

  return (
    '<div class="field">' +
    labelHtml +
    control +
    (spec.help && !spec.error ? `<span class="field-help">${esc(spec.help)}</span>` : '') +
    (spec.error ? `<span class="field-error">${esc(spec.error)}</span>` : '') +
    '</div>'
  );
}

function form(block, { annotationsOn, nextAnn }) {
  const mark = annotationMark(nextAnn(block), annotationsOn);
  const fields = block.fields.map(field).join('');
  return (
    '<section class="card">' +
    (block.title ? `<div class="card-head"><h2 class="card-title">${esc(block.title)}${mark}</h2></div>` : '') +
    '<div class="card-body">' +
    (block.description ? `<p class="page-subtitle" style="margin-top:0">${esc(block.description)}</p>` : '') +
    `<div class="form-grid">${fields}</div>` +
    (block.submit ? `<div class="form-foot">${button({ ...block.submit, variant: block.submit.variant || 'primary' })}</div>` : '') +
    '</div>' +
    '</section>'
  );
}

function cards(block, { annotationsOn, nextAnn }) {
  const items = block.items
    .map(
      (item) =>
        '<article class="card"><div class="card-body">' +
        `<div class="card-head" style="border:0;padding:0 0 8px">` +
        `<h3 class="card-title">${esc(item.title)}</h3>` +
        (item.badge ? badge(item.badge.text, item.badge.tone) : '') +
        '</div>' +
        (item.subtitle ? `<p class="row-secondary" style="margin:0 0 8px">${esc(item.subtitle)}</p>` : '') +
        (item.body ? `<p style="margin:0">${esc(item.body)}</p>` : '') +
        (item.action ? `<div class="form-foot" style="justify-content:flex-start">${button(item.action)}</div>` : '') +
        '</div></article>'
    )
    .join('');
  const mark = annotationMark(nextAnn(block), annotationsOn);
  return (
    '<section>' +
    (block.title ? `<h2 class="card-title" style="margin:0 0 12px">${esc(block.title)}${mark}</h2>` : '') +
    `<div class="card-grid">${items}</div>` +
    '</section>'
  );
}

function list(block, { annotationsOn, nextAnn }) {
  const mark = annotationMark(nextAnn(block), annotationsOn);
  const items = block.items
    .map(
      (item) =>
        '<div class="row-item">' +
        '<div class="row-main">' +
        `<div class="row-primary">${esc(item.primary)}</div>` +
        (item.secondary ? `<div class="row-secondary">${esc(item.secondary)}</div>` : '') +
        '</div>' +
        (item.badge ? badge(item.badge.text, item.badge.tone) : '') +
        (item.meta ? `<div class="row-meta">${esc(item.meta)}</div>` : '') +
        '</div>'
    )
    .join('');
  return (
    '<section class="card">' +
    (block.title ? `<div class="card-head"><h2 class="card-title">${esc(block.title)}${mark}</h2></div>` : '') +
    `<div class="rows">${items}</div>` +
    '</section>'
  );
}

function detail(block, { annotationsOn, nextAnn }) {
  const mark = annotationMark(nextAnn(block), annotationsOn);
  const rows = block.items
    .map((item) => `<dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd>`)
    .join('');
  return (
    '<section class="card">' +
    (block.title ? `<div class="card-head"><h2 class="card-title">${esc(block.title)}${mark}</h2></div>` : '') +
    `<div class="card-body"><dl class="detail">${rows}</dl></div>` +
    '</section>'
  );
}

function textBlock(block) {
  return (
    '<section class="card"><div class="card-body">' +
    (block.title ? `<h2 class="card-title" style="margin:0 0 8px">${esc(block.title)}</h2>` : '') +
    `<p style="margin:0">${esc(block.body)}</p>` +
    '</div></section>'
  );
}

function tabs(block) {
  const active = block.active || block.items[0];
  const items = block.items
    .map((item) => `<span class="${cls('tab', item === active && 'is-active')}">${esc(item)}</span>`)
    .join('');
  return `<nav class="tabs" aria-label="Pestañas">${items}</nav>`;
}

/* ----------------------------- estados ----------------------------- */

function skeletonBlock() {
  const row =
    '<div class="skeleton-row"><span class="skeleton-chip"></span>' +
    '<div style="flex:1;display:flex;flex-direction:column;gap:6px">' +
    '<span class="skeleton is-half"></span><span class="skeleton is-short"></span></div></div>';
  return (
    '<section class="card"><div class="card-body"><div class="skeleton-rows">' +
    row.repeat(4) +
    '</div></div></section>'
  );
}

function loadingState(states) {
  return (
    `<div class="state-banner" role="status"><span class="nav-icon">${icon('clock', 18)}</span>` +
    `<span class="state-title">${esc(states.loadingLabel)}</span></div>` +
    skeletonBlock()
  );
}

function emptyState(states, primaryAction) {
  return (
    '<section class="card"><div class="empty">' +
    `<span class="empty-mark">${icon('inbox', 22)}</span>` +
    `<p class="empty-title">${esc(states.emptyTitle)}</p>` +
    (states.emptyBody ? `<p style="margin:0 0 16px">${esc(states.emptyBody)}</p>` : '') +
    (primaryAction ? button({ ...primaryAction, variant: 'primary' }) : '') +
    '</div></section>'
  );
}

function errorState(states) {
  return (
    '<div class="state-banner is-error" role="alert">' +
    `<span class="nav-icon">${icon('alert', 18)}</span>` +
    '<div>' +
    `<div class="state-title">${esc(states.errorTitle)}</div>` +
    (states.errorBody ? `<div>${esc(states.errorBody)}</div>` : '') +
    '</div></div>'
  );
}

function successBanner(states) {
  if (!states.successMessage) return '';
  return (
    '<div class="state-banner is-success" role="status">' +
    `<span class="nav-icon">${icon('check', 18)}</span>` +
    `<span class="state-title">${esc(states.successMessage)}</span></div>`
  );
}

function annotationList(entries) {
  if (!entries || entries.length === 0) return '';
  const items = entries
    .map((entry) => {
      const refs = join([
        entry.ruleRef ? `<span class="ann-ref">${esc(entry.ruleRef)}</span>` : '',
        entry.endpointRef ? `<span class="ann-ref">${esc(entry.endpointRef)}</span>` : '',
        entry.dataField ? `<span class="ann-ref">${esc(entry.dataField)}</span>` : '',
      ]);
      return `<li>${esc(entry.note)}${refs}</li>`;
    })
    .join('');
  return `<section class="ann-list"><h2 class="card-title" style="margin:0 0 8px">Anotaciones</h2><ol>${items}</ol></section>`;
}

module.exports = {
  annotationMark,
  annotationList,
  badge,
  button,
  topbar,
  sidenav,
  breadcrumbs,
  pageHead,
  stats,
  table,
  form,
  field,
  cards,
  list,
  detail,
  textBlock,
  tabs,
  loadingState,
  emptyState,
  errorState,
  successBanner,
  skeletonBlock,
};
