/**
 * CSS del maquetado, derivado ENTERAMENTE de los tokens (ver tokens.js).
 * Se embute en cada maqueta: sin hojas externas, sin fuentes remotas, sin
 * CDN - una maqueta tiene que abrirse sola desde el zip, sin red.
 *
 * `viewport` cambia la DISTRIBUCION, no la escala: en escritorio el menu es
 * una columna lateral fija y las tablas van completas; en movil el menu pasa
 * a una barra inferior, el contenido es de una sola columna y las tablas se
 * reorganizan como fichas (cada celda con su encabezado), que es lo que hace
 * un producto real en vez de achicar la tabla.
 */

function buildStyles(tokens, viewport) {
  const { accent, neutral, semantic, spacing, radius, shadow, typography } = tokens;
  const isMobile = viewport === 'mobile';

  return `
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  font-family: ${typography.fontFamily};
  font-size: ${typography.bodySize};
  line-height: ${typography.lineHeight};
  color: ${neutral.text};
  background: ${neutral.surfaceSunken};
  -webkit-font-smoothing: antialiased;
}
.app { display: ${isMobile ? 'block' : 'grid'}; ${isMobile ? '' : 'grid-template-columns: 236px 1fr;'} min-height: 100vh; }

/* Encabezado */
.topbar {
  grid-column: 1 / -1;
  display: flex; align-items: center; justify-content: space-between; gap: ${spacing.md};
  padding: ${spacing.sm} ${isMobile ? spacing.md : spacing.lg};
  background: ${neutral.surface};
  border-bottom: 1px solid ${neutral.border};
  position: sticky; top: 0; z-index: 5;
}
.brand { display: flex; align-items: center; gap: ${spacing.sm}; font-weight: ${typography.titleWeight}; }
.brand-mark { width: 28px; height: 28px; border-radius: ${radius.md}; background: ${accent.base}; color: ${accent.onBase};
  display: inline-flex; align-items: center; justify-content: center; flex: none; }
.brand-name { font-size: ${typography.bodySize}; letter-spacing: -0.01em; }
.user-menu { display: flex; align-items: center; gap: ${spacing.sm}; }
.user-role { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; background: ${neutral.surfaceSubtle};
  border: 1px solid ${neutral.border}; border-radius: ${radius.pill}; padding: 2px ${spacing.sm}; white-space: nowrap; }
.avatar { width: 32px; height: 32px; border-radius: ${radius.pill}; background: ${accent.surface}; color: ${accent.strong};
  display: inline-flex; align-items: center; justify-content: center; font-size: ${typography.captionSize};
  font-weight: ${typography.labelWeight}; flex: none; }

/* Navegacion */
.sidenav {
  background: ${neutral.surface};
  ${isMobile
    ? `position: fixed; left: 0; right: 0; bottom: 0; display: flex; justify-content: space-around;
       border-top: 1px solid ${neutral.border}; padding: ${spacing.xs} ${spacing.xs}; z-index: 6;`
    : `border-right: 1px solid ${neutral.border}; padding: ${spacing.md} ${spacing.sm}; display: flex;
       flex-direction: column; gap: 2px;`}
}
.nav-item {
  display: flex; align-items: center; gap: ${spacing.sm};
  ${isMobile
    ? `flex-direction: column; gap: 2px; font-size: ${typography.captionSize}; padding: ${spacing.sm} ${spacing.xs};
       min-width: 56px; min-height: 48px; justify-content: center; text-align: center;`
    : `padding: ${spacing.sm} ${spacing.sm}; font-size: ${typography.labelSize}; border-radius: ${radius.md};`}
  color: ${neutral.textMuted}; text-decoration: none; font-weight: ${typography.labelWeight};
}
.nav-item.is-active { color: ${accent.strong}; background: ${isMobile ? 'transparent' : accent.surface}; }
.nav-item.is-active .nav-icon { color: ${accent.base}; }
.nav-icon { display: inline-flex; flex: none; }
.nav-group-label { font-size: ${typography.captionSize}; text-transform: uppercase; letter-spacing: 0.04em;
  color: ${neutral.textFaint}; padding: ${spacing.sm} ${spacing.sm} ${spacing.xs}; }

/* Contenido */
.main { padding: ${isMobile ? spacing.md : spacing.lg}; padding-bottom: ${isMobile ? '80px' : spacing.xl};
  max-width: 100%; overflow-x: hidden; }
.breadcrumbs { display: flex; flex-wrap: wrap; align-items: center; gap: ${spacing.xs};
  font-size: ${typography.captionSize}; color: ${neutral.textMuted}; margin-bottom: ${spacing.sm}; }
.breadcrumbs .sep { color: ${neutral.textFaint}; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: ${spacing.md};
  flex-wrap: wrap; margin-bottom: ${spacing.lg}; }
.page-title { font-size: ${typography.displaySize}; font-weight: ${typography.displayWeight};
  letter-spacing: -0.02em; margin: 0; }
.page-subtitle { margin: ${spacing.xs} 0 0; color: ${neutral.textMuted}; font-size: ${typography.bodySize}; max-width: 62ch; }
.page-actions { display: flex; align-items: center; gap: ${spacing.sm}; flex-wrap: wrap; }
.stack { display: flex; flex-direction: column; gap: ${spacing.lg}; }

/* Botones */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: ${spacing.xs};
  font-family: inherit; font-size: ${typography.labelSize}; font-weight: ${typography.labelWeight};
  border-radius: ${radius.md}; padding: ${isMobile ? '12px 16px' : '9px 14px'};
  ${isMobile ? 'min-height: 44px;' : ''} border: 1px solid transparent; cursor: default; text-decoration: none;
  white-space: nowrap; }
.btn-primary { background: ${accent.base}; color: ${accent.onBase}; box-shadow: ${shadow.sm}; }
.btn-secondary { background: ${neutral.surface}; color: ${neutral.text}; border-color: ${neutral.borderStrong};
  box-shadow: ${shadow.sm}; }
.btn-ghost { background: transparent; color: ${accent.strong}; }
.btn-danger { background: ${semantic.dangerSurface}; color: ${semantic.dangerText}; border-color: ${semantic.dangerText}33; }

/* Tarjeta / panel */
.card { background: ${neutral.surface}; border: 1px solid ${neutral.border}; border-radius: ${radius.lg};
  box-shadow: ${shadow.sm}; overflow: hidden; }
.card-head { display: flex; align-items: center; justify-content: space-between; gap: ${spacing.sm};
  padding: ${spacing.md}; border-bottom: 1px solid ${neutral.border}; }
.card-title { font-size: ${typography.titleSize}; font-weight: ${typography.titleWeight}; margin: 0; }
.card-body { padding: ${spacing.md}; }
.card-grid { display: grid; gap: ${spacing.md}; grid-template-columns: ${isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))'}; }

/* Resumenes numericos */
.stats { display: grid; gap: ${spacing.md}; grid-template-columns: ${isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(180px, 1fr))'}; }
.stat { background: ${neutral.surface}; border: 1px solid ${neutral.border}; border-radius: ${radius.lg};
  padding: ${spacing.md}; box-shadow: ${shadow.sm}; }
.stat-label { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; margin: 0 0 ${spacing.xs}; }
.stat-value { font-size: ${typography.displaySize}; font-weight: ${typography.displayWeight}; letter-spacing: -0.02em; }
.stat-delta { font-size: ${typography.captionSize}; margin-top: 2px; }

/* Barra de herramientas de tabla */
.toolbar { display: flex; align-items: center; gap: ${spacing.sm}; flex-wrap: wrap; padding: ${spacing.md};
  border-bottom: 1px solid ${neutral.border}; }
.search { display: flex; align-items: center; gap: ${spacing.xs}; flex: 1 1 200px; min-width: 0;
  border: 1px solid ${neutral.borderStrong}; border-radius: ${radius.md}; padding: ${isMobile ? '10px' : '8px'} ${spacing.sm};
  color: ${neutral.textFaint}; background: ${neutral.surface}; ${isMobile ? 'min-height: 44px;' : ''} }
.search-text { font-size: ${typography.labelSize}; }
.chip { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; background: ${neutral.surfaceSubtle};
  border: 1px solid ${neutral.border}; border-radius: ${radius.pill}; padding: ${isMobile ? '8px 12px' : '4px 10px'};
  ${isMobile ? 'min-height: 36px; display: inline-flex; align-items: center;' : ''} }

/* Tabla (escritorio) / fichas (movil) */
.table-wrap { width: 100%; overflow-x: auto; }
table.data { width: 100%; border-collapse: collapse; font-size: ${typography.bodySize}; }
table.data th { text-align: left; font-size: ${typography.captionSize}; text-transform: uppercase;
  letter-spacing: 0.04em; color: ${neutral.textMuted}; font-weight: ${typography.labelWeight};
  padding: ${spacing.sm} ${spacing.md}; background: ${neutral.surfaceSubtle}; border-bottom: 1px solid ${neutral.border};
  white-space: nowrap; }
table.data td { padding: ${spacing.sm} ${spacing.md}; border-bottom: 1px solid ${neutral.border}; vertical-align: middle; }
table.data tr:last-child td { border-bottom: 0; }
table.data .num { text-align: right; font-variant-numeric: tabular-nums; }
${isMobile
    ? `table.data thead { display: none; }
table.data, table.data tbody, table.data tr, table.data td { display: block; width: 100%; }
table.data tr { border: 1px solid ${neutral.border}; border-radius: ${radius.md}; padding: ${spacing.sm};
  margin-bottom: ${spacing.sm}; background: ${neutral.surface}; }
table.data td { border: 0; display: flex; justify-content: space-between; gap: ${spacing.md};
  padding: ${spacing.xs} ${spacing.xs}; text-align: right; }
table.data td::before { content: attr(data-label); font-size: ${typography.captionSize};
  color: ${neutral.textMuted}; text-align: left; font-weight: ${typography.labelWeight}; }
table.data .num { text-align: right; }`
    : ''}
.pagination { display: flex; align-items: center; justify-content: space-between; gap: ${spacing.sm};
  padding: ${spacing.sm} ${spacing.md}; border-top: 1px solid ${neutral.border};
  font-size: ${typography.captionSize}; color: ${neutral.textMuted}; }
.pager { display: flex; gap: ${spacing.xs}; }
.pager span { border: 1px solid ${neutral.border}; border-radius: ${radius.sm}; padding: 2px ${spacing.sm};
  background: ${neutral.surface}; }
.pager span.is-active { background: ${accent.surface}; color: ${accent.strong}; border-color: ${accent.base}33; }

/* Badges */
.badge { display: inline-flex; align-items: center; gap: ${spacing.xs}; font-size: ${typography.captionSize};
  font-weight: ${typography.labelWeight}; border-radius: ${radius.pill}; padding: 2px ${spacing.sm}; white-space: nowrap; }
.badge-neutral { background: ${neutral.surfaceSubtle}; color: ${neutral.textMuted}; border: 1px solid ${neutral.border}; }
.badge-success { background: ${semantic.successSurface}; color: ${semantic.successText}; }
.badge-warning { background: ${semantic.warningSurface}; color: ${semantic.warningText}; }
.badge-danger { background: ${semantic.dangerSurface}; color: ${semantic.dangerText}; }
.badge-info { background: ${semantic.infoSurface}; color: ${semantic.infoText}; }

/* Formularios */
.form-grid { display: grid; gap: ${spacing.md}; grid-template-columns: ${isMobile ? '1fr' : 'repeat(auto-fit, minmax(240px, 1fr))'}; }
.field { display: flex; flex-direction: column; gap: ${spacing.xs}; min-width: 0; }
.field-label { font-size: ${typography.labelSize}; font-weight: ${typography.labelWeight}; color: ${neutral.text}; }
.field-required { color: ${semantic.dangerText}; }
.input { border: 1px solid ${neutral.borderStrong}; border-radius: ${radius.md}; background: ${neutral.surface};
  padding: ${isMobile ? '12px' : '9px'} ${spacing.sm}; font-size: ${typography.bodySize}; color: ${neutral.text};
  ${isMobile ? 'min-height: 44px;' : ''} display: flex; align-items: center; justify-content: space-between; gap: ${spacing.sm}; }
.input.is-placeholder { color: ${neutral.textFaint}; }
.input.is-error { border-color: ${semantic.dangerText}; }
.input-area { min-height: 76px; align-items: flex-start; }
.field-help { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; }
.field-error { font-size: ${typography.captionSize}; color: ${semantic.dangerText}; }
.checkbox-row { display: flex; align-items: center; gap: ${spacing.sm}; }
.checkbox { width: 18px; height: 18px; border: 1px solid ${neutral.borderStrong}; border-radius: ${radius.sm};
  background: ${neutral.surface}; flex: none; display: inline-flex; align-items: center; justify-content: center;
  color: ${accent.base}; }
.form-foot { display: flex; justify-content: flex-end; gap: ${spacing.sm}; padding-top: ${spacing.md};
  border-top: 1px solid ${neutral.border}; margin-top: ${spacing.md}; }

/* Listas y detalle */
.rows { display: flex; flex-direction: column; }
.row-item { display: flex; align-items: center; gap: ${spacing.md}; padding: ${spacing.md};
  border-bottom: 1px solid ${neutral.border}; }
.row-item:last-child { border-bottom: 0; }
.row-main { min-width: 0; flex: 1; }
.row-primary { font-weight: ${typography.labelWeight}; }
.row-secondary { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; }
.row-meta { font-size: ${typography.captionSize}; color: ${neutral.textFaint}; font-variant-numeric: tabular-nums;
  white-space: nowrap; }
dl.detail { display: grid; grid-template-columns: ${isMobile ? '1fr' : 'minmax(140px, 220px) 1fr'};
  gap: ${spacing.sm} ${spacing.md}; margin: 0; }
dl.detail dt { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; }
dl.detail dd { margin: 0; }

/* Pestanas */
.tabs { display: flex; gap: ${spacing.xs}; border-bottom: 1px solid ${neutral.border}; overflow-x: auto; }
.tab { font-size: ${typography.labelSize}; font-weight: ${typography.labelWeight}; color: ${neutral.textMuted};
  padding: ${spacing.sm} ${spacing.md}; border-bottom: 2px solid transparent; white-space: nowrap;
  ${isMobile ? 'min-height: 44px; display: inline-flex; align-items: center;' : ''} }
.tab.is-active { color: ${accent.strong}; border-bottom-color: ${accent.base}; }

/* Estados */
.state-banner { display: flex; align-items: flex-start; gap: ${spacing.sm}; border-radius: ${radius.lg};
  padding: ${spacing.md}; font-size: ${typography.bodySize}; }
.state-banner.is-error { background: ${semantic.dangerSurface}; color: ${semantic.dangerText}; }
.state-banner.is-success { background: ${semantic.successSurface}; color: ${semantic.successText}; }
.state-title { font-weight: ${typography.labelWeight}; }
.empty { text-align: center; padding: ${spacing.xxl} ${spacing.md}; color: ${neutral.textMuted}; }
.empty-mark { width: 44px; height: 44px; border-radius: ${radius.pill}; background: ${neutral.surfaceSubtle};
  color: ${neutral.textFaint}; display: inline-flex; align-items: center; justify-content: center;
  margin-bottom: ${spacing.sm}; }
.empty-title { font-size: ${typography.titleSize}; font-weight: ${typography.titleWeight}; color: ${neutral.text};
  margin: 0 0 ${spacing.xs}; }
.skeleton { background: ${neutral.surfaceSunken}; border-radius: ${radius.sm}; height: 12px; }
.skeleton.is-wide { width: 100%; }
.skeleton.is-half { width: 50%; }
.skeleton.is-short { width: 28%; }
.skeleton-rows { display: flex; flex-direction: column; gap: ${spacing.md}; }
.skeleton-row { display: flex; gap: ${spacing.md}; align-items: center; }
.skeleton-chip { width: 32px; height: 32px; border-radius: ${radius.pill}; background: ${neutral.surfaceSunken}; flex: none; }

/* Anotaciones */
.ann { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px;
  border-radius: ${radius.pill}; background: ${accent.base}; color: ${accent.onBase};
  font-size: 11px; font-weight: 600; margin-left: ${spacing.xs}; padding: 0 5px; vertical-align: middle; }
.ann-list { margin-top: ${spacing.lg}; }
.ann-list ol { margin: 0; padding-left: ${spacing.lg}; display: flex; flex-direction: column; gap: ${spacing.sm}; }
.ann-list li { font-size: ${typography.captionSize}; color: ${neutral.textMuted}; }
.ann-ref { font-family: ${typography.fontMono}; font-size: 11px; color: ${accent.strong};
  background: ${accent.surface}; border-radius: ${radius.sm}; padding: 1px 5px; margin-left: ${spacing.xs}; }
`.trim();
}

module.exports = { buildStyles };
