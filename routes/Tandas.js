const express = require('express')
const router = express.Router()
const tandaController = require('../controllers/Tandacontroller')
const miembroController = require('../controllers/Miembrocontroller')
const { isLoggedIn } = require('../middlewares/authMiddleware')
const { validateTanda, validateMiembro, validateEstado, validateId } = require('../middlewares/Validationmiddleware')

// All routes require login
router.use(isLoggedIn)

// ── TANDA CRUD ────────────────────────────────────────
router.get('/',                              tandaController.getTandas)
router.get('/nueva',                         tandaController.getNueva)
router.post('/nueva',                        validateTanda, tandaController.postNueva)
router.get('/:id',                           validateId('id'), tandaController.getDetalle)
router.get('/:id/editar',                    validateId('id'), tandaController.getEditar)
router.post('/:id/editar',                   validateId('id'), tandaController.postEditar)
router.post('/:id/estado',                   validateId('id'), validateEstado, tandaController.updateEstado)
router.post('/:id/delete',                   validateId('id'), tandaController.deleteTanda)

// ── WIZARD STEPS ─────────────────────────────────────
router.get('/:id/miembros',                  validateId('id'), tandaController.getMiembros)
router.get('/:id/turnos',                    validateId('id'), tandaController.getTurnos)
router.post('/:id/asignar-turnos',           validateId('id'), tandaController.asignarTurnos)

// ── RONDAS ───────────────────────────────────────────
router.post('/:tandaId/rondas/:id/entregada', validateId('tandaId'), validateId('id'), tandaController.marcarRondaCompletada)

// ── MEMBER ACTIONS ────────────────────────────────────
router.post('/:id/miembros',                 validateId('id'), validateMiembro, miembroController.addMiembro)
router.post('/:tandaId/miembros/:id/editar', validateId('tandaId'), validateId('id'), validateMiembro, miembroController.editMiembro)
router.post('/:tandaId/miembros/:id/delete', validateId('tandaId'), validateId('id'), miembroController.deleteMiembro)

module.exports = router