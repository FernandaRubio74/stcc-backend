/**
 * T-038.4 - Smoke test de configuracion: toda variable de entorno que el
 * codigo lee tiene que estar documentada en .env.example, y .env.example no
 * puede traer valores que parezcan secretos reales.
 *
 * Es el test que evita que alguien clone el repo y no pueda arrancar porque
 * falta una variable sin documentar (paso exactamente eso con AI_TIMEOUT_MS y
 * AI_MAX_RETRIES).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ENV_SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'config', 'env.js'), 'utf8');
const ENV_EXAMPLE = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');

function variablesQueUsaElCodigo() {
  const directas = [...ENV_SOURCE.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  // Las obligatorias se leen via required('NOMBRE'), no via process.env.NOMBRE.
  const requeridas = [...ENV_SOURCE.matchAll(/required\('([A-Z0-9_]+)'\)/g)].map((match) => match[1]);
  return [...new Set([...directas, ...requeridas])];
}

function variablesDocumentadas() {
  return ENV_EXAMPLE.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim());
}

describe('.env.example', () => {
  test('documenta todas las variables de entorno que lee src/config/env.js', () => {
    const usadas = variablesQueUsaElCodigo();
    const documentadas = variablesDocumentadas();

    const sinDocumentar = usadas.filter((name) => !documentadas.includes(name));

    expect(usadas.length).toBeGreaterThan(0);
    expect(sinDocumentar).toEqual([]);
  });

  test('no filtra valores que parezcan secretos reales', () => {
    const sensibles = variablesDocumentadas().filter((name) => /KEY|SECRET|PASSWORD|TOKEN/.test(name));

    expect(sensibles.length).toBeGreaterThan(0);

    sensibles.forEach((name) => {
      const match = ENV_EXAMPLE.match(new RegExp(`^${name}=(.*)$`, 'm'));
      const valor = (match?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
      // Los campos sensibles van vacios en el ejemplo.
      expect(valor).toBe('');
    });
  });
});
