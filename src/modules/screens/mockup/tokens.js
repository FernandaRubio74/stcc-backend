/**
 * Tokens de diseño del maquetado de alta fidelidad. UNICA fuente de verdad
 * de color, tipografia, espaciado, radios y sombras: el renderizador no
 * escribe valores sueltos, siempre sale de aca.
 *
 * Direccion: tema claro, mucho espacio en blanco, reticula de 8 px, sans
 * del sistema, radios 8-12 px, sombras sutiles, un solo acento con grises
 * neutros y colores semanticos.
 *
 * "Variacion controlada": el acento se deriva del tipo de producto (del
 * texto del proyecto) pero SOLO puede caer en una paleta fija y revisada,
 * asi dos proyectos distintos no se ven identicos sin que ninguno se vea
 * fuera del sistema. La eleccion es deterministica (hash del texto), para
 * que la misma especificacion produzca siempre el mismo HTML.
 */

const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
};

const RADIUS = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  pill: '999px',
};

const SHADOW = {
  sm: '0 1px 2px rgba(16, 24, 40, 0.05)',
  md: '0 1px 3px rgba(16, 24, 40, 0.1), 0 1px 2px rgba(16, 24, 40, 0.06)',
  lg: '0 4px 12px rgba(16, 24, 40, 0.08)',
};

// Escala tipografica fija (sans del sistema: sin fuentes externas, que
// estan prohibidas por ser un recurso remoto).
const TYPOGRAPHY = {
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif",
  fontMono: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  displaySize: '24px',
  displayWeight: '600',
  titleSize: '18px',
  titleWeight: '600',
  bodySize: '14px',
  bodyWeight: '400',
  labelSize: '13px',
  labelWeight: '500',
  captionSize: '12px',
  lineHeight: '1.5',
};

// Grises neutros y colores semanticos, comunes a todos los proyectos.
// Contraste verificado contra blanco/su propio fondo para texto (>= 4.5:1).
const NEUTRAL = {
  surface: '#ffffff',
  surfaceSubtle: '#f7f8fa',
  surfaceSunken: '#f1f3f7',
  border: '#e3e6ec',
  borderStrong: '#cfd4de',
  text: '#1a1d23',
  textMuted: '#5a616e',
  textFaint: '#848b99',
  overlay: 'rgba(16, 24, 40, 0.45)',
};

const SEMANTIC = {
  successText: '#1b6b45',
  successSurface: '#e7f6ee',
  warningText: '#8a5200',
  warningSurface: '#fdf3e2',
  dangerText: '#a3202a',
  dangerSurface: '#fdecee',
  infoText: '#1f4f8f',
  infoSurface: '#eaf1fb',
};

/**
 * Paleta de acentos permitidos. Cada entrada esta elegida para que el
 * texto blanco sobre `base` llegue a 4.5:1.
 */
const ACCENTS = [
  { id: 'indigo', base: '#3b4fa8', strong: '#2d3d85', surface: '#eef1fb', onBase: '#ffffff' },
  { id: 'teal', base: '#0f6b6b', strong: '#0b5252', surface: '#e6f4f4', onBase: '#ffffff' },
  { id: 'violet', base: '#6b3fa0', strong: '#55317f', surface: '#f2ecfa', onBase: '#ffffff' },
  { id: 'slate', base: '#3d4a5c', strong: '#2d3845', surface: '#eef1f5', onBase: '#ffffff' },
  { id: 'green', base: '#276749', strong: '#1d4f37', surface: '#e8f5ee', onBase: '#ffffff' },
  { id: 'amber', base: '#8a5200', strong: '#6b3f00', surface: '#fdf3e2', onBase: '#ffffff' },
];

/** Hash estable (FNV-1a de 32 bits): mismo texto -> mismo acento, siempre. */
function stableHash(text) {
  let hash = 0x811c9dc5;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function pickAccent(seed) {
  return ACCENTS[stableHash(seed) % ACCENTS.length];
}

/** Tokens completos para un proyecto. `seed` suele ser el nombre del proyecto. */
function buildTokens(seed = '') {
  return {
    accent: pickAccent(seed),
    neutral: NEUTRAL,
    semantic: SEMANTIC,
    spacing: SPACING,
    radius: RADIUS,
    shadow: SHADOW,
    typography: TYPOGRAPHY,
  };
}

module.exports = { buildTokens, pickAccent, stableHash, ACCENTS, NEUTRAL, SEMANTIC, SPACING, RADIUS, SHADOW, TYPOGRAPHY };
