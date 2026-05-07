// routes/pagos.js
const express = require('express')
const router = express.Router()
const pagoController = require('../controllers/Pagocontroller')
const { isLoggedIn } = require('../middlewares/authMiddleware')
const { validateId } = require('../middlewares/Validationmiddleware')

router.use(isLoggedIn)
router.get('/', pagoController.getPagos)
router.post('/:id/pagado',    validateId('id'), pagoController.marcarPagado)
router.post('/:id/faltante',  validateId('id'), pagoController.marcarFaltante)
router.post('/:id/pendiente', validateId('id'), pagoController.marcarPendiente)

module.exports = router

