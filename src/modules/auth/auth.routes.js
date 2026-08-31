const { Router } = require('express');
const { validate } = require('../../common/middlewares/validate');
const { registerSchema, loginSchema } = require('../../common/dto/auth.dto');
const { registerController, loginController } = require('./auth.controller');

const router = Router();

router.post('/register', validate(registerSchema), registerController);
router.post('/login', validate(loginSchema), loginController);

module.exports = router;
