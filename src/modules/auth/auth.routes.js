const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { requireAuth } = require('../../common/middlewares/auth.middleware');
const { registerSchema, loginSchema } = require('../../common/dto/auth.dto');
const { registerController, loginController, logoutController } = require('./auth.controller');

const router = Router();

router.post('/register', validate(registerSchema), registerController);
router.post('/login', validate(loginSchema), loginController);
// T-042.3: invalida solo la sesion actual (ver revocation.service).
router.post('/logout', requireAuth, logoutController);

module.exports = router;
