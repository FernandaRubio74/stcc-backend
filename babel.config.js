// Solo existe para que Jest 29 pueda transformar los paquetes ESM-only que
// trae @google/adk de forma transitiva (ej. lodash-es): Node 24 ya sabe
// hacer require() sincrono de ESM nativamente, pero el runtime de Jest
// todavia no, asi que sin esto falla solo en los tests (node src/server.js
// corre bien sin esto, no se toca ningun comportamiento de produccion).
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
};
