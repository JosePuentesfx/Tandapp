// routes/admin.js
const express = require('express')
const router = express.Router()
const adminController = require('../controllers/adminController')
const { isLoggedIn, isAdmin } = require('../middlewares/authMiddleware')
const { validateId } = require('../middlewares/Validationmiddleware')

router.use(isLoggedIn)
router.use(isAdmin)

router.get('/',                         adminController.getDashboard)
router.get('/actividad',                adminController.getActividad)
router.get('/usuarios',                 adminController.getUsuarios)
router.post('/usuarios/:id/desactivar', validateId('id'), adminController.desactivarUsuario)
router.post('/usuarios/:id/activar',    validateId('id'), adminController.activarUsuario)
router.post('/usuarios/:id/rol',        validateId('id'), adminController.cambiarRol)
router.post('/usuarios/:id/eliminar',   validateId('id'), adminController.eliminarUsuario)

module.exports = router
