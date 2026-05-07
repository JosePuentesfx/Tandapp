// routes/reportes.js
const express = require('express')
const router = express.Router()
const reporteController = require('../controllers/Reportecontroller')
const { isLoggedIn } = require('../middlewares/authMiddleware')
const { validateId } = require('../middlewares/Validationmiddleware')
 
router.use(isLoggedIn)
 
router.get('/',                     reporteController.getReportes)
router.get('/:id/excel', validateId('id'), reporteController.descargarExcel)   // ?tipo=completo|calendario
router.get('/:id/pdf',   validateId('id'), reporteController.descargarPDF)     // ?tipo=completo|calendario
 
module.exports = router