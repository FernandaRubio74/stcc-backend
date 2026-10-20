const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./modules/auth/auth.routes');
const ssoRoutes = require('./modules/auth/sso.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const membersRoutes = require('./modules/projects/members.routes');
const definitionRoutes = require('./modules/definition/definition.routes');
const dataModelRoutes = require('./modules/data-model/data-model.routes');

const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/auth', ssoRoutes);
app.use('/projects', projectsRoutes);
app.use('/projects', membersRoutes);
app.use('/projects', definitionRoutes);
app.use('/projects', dataModelRoutes);

// Manejador de errores centralizado
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
