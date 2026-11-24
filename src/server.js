const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.warn(`Servidor corriendo en http://localhost:${env.port}`);
});

