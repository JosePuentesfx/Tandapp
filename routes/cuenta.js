// routes/cuenta.js
const express = require('express')
const router  = express.Router()
const cuentaController = require('../controllers/cuentacontroller')
const { isLoggedIn } = require('../middlewares/authMiddleware')
const { validatePerfil, validatePassword } = require('../middlewares/Validationmiddleware')

router.use(isLoggedIn)

router.get('/',                       cuentaController.getCuenta)
router.post('/perfil',                validatePerfil, cuentaController.actualizarPerfil)

router.get('/password',               cuentaController.getPasswordSolicitar)
router.post('/password/solicitar',    (req, res, next) => req.app.locals.emailLimiter(req, res, next), cuentaController.postPasswordSolicitar)
router.get('/password/verificar',     cuentaController.getPasswordVerificar)
router.post('/password/verificar',    (req, res, next) => req.app.locals.codeLimiter(req, res, next), cuentaController.postPasswordVerificar)
router.get('/password/nueva',         cuentaController.getPasswordNueva)
router.post('/password/nueva',        validatePassword, cuentaController.postPasswordNueva)

module.exports = router