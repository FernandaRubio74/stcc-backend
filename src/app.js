const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const authRoutes = require('./modules/auth/auth.routes');
const ssoRoutes = require('./modules/auth/sso.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const membersRoutes = require('./modules/projects/members.routes');
const definitionRoutes = require('./modules/definition/definition.routes');
const dataModelRoutes = require('./modules/data-model/data-model.routes');
const apiSpecRoutes = require('./modules/api-spec/api-spec.routes');
const screensRoutes = require('./modules/screens/screens.routes');
const architectureRoutes = require('./modules/architecture/architecture.routes');
const consistencyRoutes = require('./modules/consistency/consistency.routes');
const reviewRoutes = require('./modules/review/review.routes');
const documentsRoutes = require('./modules/documents/documents.routes');
const healthRoutes = require('./modules/health/health.routes');
const { requestLogger } = require('./common/middlewares/request-logger.middleware');
const { logger } = require('./common/utils/logger');

const app = express();

app.use(cors({ origin: env.frontendUrl }));
app.use(express.json());

// US-039: va antes de las rutas para medir y loguear todo, /health incluido.
app.use(requestLogger);

app.use(healthRoutes);

app.use('/auth', authRoutes);
app.use('/auth', ssoRoutes);
app.use('/projects', projectsRoutes);
app.use('/projects', membersRoutes);
app.use('/projects', definitionRoutes);
app.use('/projects', dataModelRoutes);
app.use('/projects', apiSpecRoutes);
app.use('/projects', screensRoutes);
app.use('/projects', architectureRoutes);
app.use('/projects', consistencyRoutes);
app.use('/projects', reviewRoutes);
app.use('/projects', documentsRoutes);

// Manejador de errores centralizado
app.use((err, req, res, _next) => {
  logger.error('unhandled_error', {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl || req.url,
    name: err?.name,
    message: err?.message,
    stack: err?.stack,
  });
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
