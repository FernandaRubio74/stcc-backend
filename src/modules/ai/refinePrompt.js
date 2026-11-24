/**
 * Chatbot transversal (pedido explicito): antes, la unica forma de pedirle
 * un cambio a la IA era volver a la etapa 1 (Definicion) y esperar que esa
 * conversacion de alto nivel se tradujera, varias etapas despues, en el
 * detalle que se necesitaba - en la practica no funcionaba ("le dije que
 * faltaba una entidad, volvi a generar el modelo y no sirvio de nada").
 *
 * En vez de eso, cada etapa (modelo de datos, API, pantallas, arquitectura,
 * pruebas) tiene su propio "ajustar con IA": una instruccion en lenguaje
 * libre que se aplica DIRECTO sobre el contenido ya generado de esa etapa,
 * sin pasar por la definicion. Esta funcion arma el user content comun a
 * todas: el mismo contexto que ya usa "generar", mas el contenido actual en
 * JSON, mas la instruccion - pidiendole a la IA que devuelva el contenido
 * COMPLETO actualizado (no un diff), en el mismo formato de siempre, para
 * poder validarlo y persistirlo con el mismo codigo que generate/update.
 */
function buildRefineUserContent(baseUserContent, currentContent, instruction) {
  return [
    baseUserContent,
    '',
    'Contenido ACTUAL ya generado (JSON), que hay que ajustar - conserva todo lo que la instruccion de abajo no pide cambiar, no lo reescribas desde cero:',
    JSON.stringify(currentContent),
    '',
    'Instruccion de la persona para modificar el contenido actual:',
    instruction,
    '',
    'Devolve el contenido COMPLETO actualizado (no un diff ni solo lo que cambio), respetando exactamente el mismo formato JSON indicado arriba.',
  ].join('\n');
}

module.exports = { buildRefineUserContent };
