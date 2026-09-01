const express = require('express');
const authRoutes = require('./modules/auth/auth.routes');
const ssoRoutes = require('./modules/auth/sso.routes');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/auth', ssoRoutes);

// Manejador de errores centralizado
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
