const { Router } = require('express');
const { googleCallbackController } = require('./sso.controller');

const router = Router();

router.get('/sso/callback', googleCallbackController);

module.exports = router;
