const authService = require('./auth.service');

async function registerController(req, res) {
  try {
    const user = await authService.register(req.body);
    return res.status(201).json(user);
  } catch (err) {
    if (err instanceof authService.EmailAlreadyExistsError) {
      return res.status(409).json({ error: err.message });
    }
    throw err;
  }
}

async function loginController(req, res) {
  try {
    const result = await authService.login(req.body);
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof authService.InvalidCredentialsError) {
      return res.status(401).json({ error: err.message });
    }
    throw err;
  }
}

module.exports = { registerController, loginController };
