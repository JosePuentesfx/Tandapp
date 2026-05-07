const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController')
const { isGuest } = require('../middlewares/authMiddleware')
const { validateLogin, validateRegister } = require('../middlewares/Validationmiddleware')
const { isLoggedIn } = require('../middlewares/authMiddleware')
const usuariosController = require('../controllers/usuariosController')

router.get('/miembros', isLoggedIn,usuariosController.getMiembros)

router.get('/', (req, res) => {
  res.redirect('/homepage')
})

router.get('/homepage', (req, res) => {
  res.render('homepage/index', {
    titulo: 'Inicio',
    pageTitle: 'Inicio'
  })
})

// Register — rate limited to prevent spam
router.get('/register', isGuest, authController.getRegister)
router.post('/register', isGuest, (req, res, next) => req.app.locals.authLimiter(req, res, next), validateRegister, authController.postRegister)

// Register Verificar — rate limited to prevent brute force of 6-digit codes
router.get('/register/verificar', isGuest, authController.getRegisterVerificar)
router.post('/register/verificar', isGuest, (req, res, next) => req.app.locals.codeLimiter(req, res, next), authController.postRegisterVerificar)

// Login — rate limited to prevent brute force
router.get('/login', isGuest, authController.getLogin)
router.post('/login', isGuest, (req, res, next) => req.app.locals.authLimiter(req, res, next), validateLogin, authController.postLogin)

// Logout — POST only to prevent CSRF via GET
router.post('/logout', isLoggedIn, authController.logout)

// Forgot Password Flow — rate limited
router.get('/forgot-password',            isGuest, authController.getForgotPassword)
router.post('/forgot-password',           isGuest, (req, res, next) => req.app.locals.emailLimiter(req, res, next), authController.postForgotPassword)
router.get('/reset-password/verificar',   isGuest, authController.getForgotVerify)
router.post('/reset-password/verificar',  isGuest, (req, res, next) => req.app.locals.codeLimiter(req, res, next), authController.postForgotVerify)
router.get('/reset-password/nueva',       isGuest, authController.getForgotNew)
router.post('/reset-password/nueva',      isGuest, authController.postForgotNew)

module.exports = router;