const Pago = require('../models/Pago')
const Tanda = require('../models/Tanda')
const pool = require('../config/db')
const Notificacion = require('../models/Notificacion')

// Helper: redirect back to the page the user came from (detalle or pagos)
function redirectBack(req, res, tanda_id) {
  const referer = req.get('Referer') || ''
  if (referer.includes('/tandas/')) {
    // Came from detalle page — go back there
    const match = referer.match(/\/tandas\/(\d+)/)
    if (match) return res.redirect(`/tandas/${match[1]}`)
  }
  // Default: go to pagos
  res.redirect(`/pagos?tanda=${tanda_id}`)
}

// Helper: verify pago belongs to the logged-in user's tanda (IDOR protection)
async function verifyPagoOwnership(pagoId, userId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.tanda_id FROM pagos p
     JOIN tandas t ON t.id = p.tanda_id
     WHERE p.id = $1 AND t.organizador_id = $2`,
    [pagoId, userId]
  )
  return rows[0] || null
}

const pagoController = {

  // ── GET /pagos ───────────────────────────────────────
  getPagos: async (req, res) => {
    try {
      const tandas = await Tanda.getByOrganizador(req.session.user.id)

      const tandasConDatos = await Promise.all(
        tandas.map(async (tanda) => {
          const [
            { rows: miembros },
            { rows: rondas },
            { rows: pagos },
            summary
          ] = await Promise.all([
            pool.query(
              `SELECT * FROM miembros WHERE tanda_id = $1 ORDER BY numero_turno ASC NULLS LAST, created_at ASC`,
              [tanda.id]
            ),
            pool.query(
              `SELECT * FROM rondas WHERE tanda_id = $1 ORDER BY numero_ronda ASC`,
              [tanda.id]
            ),
            pool.query(
              `SELECT * FROM pagos WHERE tanda_id = $1`,
              [tanda.id]
            ),
            Pago.getSummaryByTanda(tanda.id)
          ])

          // pagosMap[miembro_id][ronda_id] = pago — acceso O(1) en la vista
          const pagosMap = {}
          pagos.forEach(p => {
            if (!pagosMap[p.miembro_id]) pagosMap[p.miembro_id] = {}
            pagosMap[p.miembro_id][p.ronda_id] = p
          })

          return { ...tanda, miembros, rondas, pagosMap, summary }
        })
      )

      res.render('pagos/index', {
        pageTitle: 'Pagos',
        currentPage: 'pagos',
        user: req.session.user,
        tandas: tandasConDatos,
        tandaActiva: req.query.tanda || null
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar los pagos')
      res.redirect('/dashboard')
    }
  },

  // ── POST /pagos/:id/pagado ───────────────────────────
  marcarPagado: async (req, res) => {
    try {
      // IDOR protection: verify pago belongs to this user's tanda
      const ownership = await verifyPagoOwnership(req.params.id, req.session.user.id)
      if (!ownership) {
        req.flash('error', 'Pago no encontrado')
        return res.redirect('/pagos')
      }

      const pago = await Pago.marcarPagado(req.params.id)
      req.flash('success', 'Pago marcado como pagado')
      redirectBack(req, res, pago.tanda_id)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar el pago')
      res.redirect('/pagos')
    }
  },

  // ── POST /pagos/:id/faltante ─────────────────────────
  marcarFaltante: async (req, res) => {
    try {
      // IDOR protection: verify pago belongs to this user's tanda
      const ownership = await verifyPagoOwnership(req.params.id, req.session.user.id)
      if (!ownership) {
        req.flash('error', 'Pago no encontrado')
        return res.redirect('/pagos')
      }

      const pago = await Pago.marcarFaltante(req.params.id)

      // Only create notification for faltante — it's an actual alert worth seeing
      const { rows } = await pool.query(
        `SELECT m.nombre, t.nombre AS tanda_nombre 
         FROM miembros m 
         JOIN tandas t ON t.id = m.tanda_id 
         WHERE m.id = $1`, [pago.miembro_id]
      )
      const nombreMiembro = rows[0] ? rows[0].nombre : 'Un miembro'
      const tandaNombre = rows[0] ? rows[0].tanda_nombre : ''

      await Notificacion.create(
        req.session.user.id,
        'alerta',
        'Pago faltante',
        `${nombreMiembro} fue marcado como faltante en "${tandaNombre}".`,
        pago.tanda_id
      )

      req.flash('success', 'Pago marcado como faltante')
      redirectBack(req, res, pago.tanda_id)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar el pago')
      res.redirect('/pagos')
    }
  },

  // ── POST /pagos/:id/pendiente ────────────────────────
  marcarPendiente: async (req, res) => {
    try {
      // IDOR protection: verify pago belongs to this user's tanda
      const ownership = await verifyPagoOwnership(req.params.id, req.session.user.id)
      if (!ownership) {
        req.flash('error', 'Pago no encontrado')
        return res.redirect('/pagos')
      }

      const pago = await Pago.marcarPendiente(req.params.id)
      req.flash('success', 'Pago regresado a pendiente')
      redirectBack(req, res, pago.tanda_id)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar el pago')
      res.redirect('/pagos')
    }
  }

}

module.exports = pagoController
