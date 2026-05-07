const Tanda = require('../models/Tanda')
const Miembro = require('../models/Miembro')
const Pago = require('../models/Pago')
const Ronda = require('../models/Ronda')
const pool = require('../config/db')

const dashboardController = {

  getDashboard: async (req, res) => {
    try {
      const organizador_id = req.session.user.id

      // Fetch all stats at the same time
      const [tandasActivas, totalMiembros, pagosPendientes, proximaRonda, tandas] = await Promise.all([
        Tanda.countActivas(organizador_id),
        Miembro.countByOrganizador(organizador_id),
        Pago.countPendientes(organizador_id),
        Ronda.getProxima(organizador_id),
        Tanda.getByOrganizador(organizador_id)
      ])

      // Payment summary across ALL tandas for the donut chart
      const summaryResult = await pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE p.estado = 'pagado')    AS pagados,
          COUNT(*) FILTER (WHERE p.estado = 'pendiente') AS pendientes,
          COUNT(*) FILTER (WHERE p.estado = 'faltante')  AS faltantes
         FROM pagos p
         JOIN tandas t ON t.id = p.tanda_id
         WHERE t.organizador_id = $1`,
        [organizador_id]
      )

      const pagosSummary = {
        pagados:    parseInt(summaryResult.rows[0].pagados)    || 0,
        pendientes: parseInt(summaryResult.rows[0].pendientes) || 0,
        faltantes:  parseInt(summaryResult.rows[0].faltantes)  || 0
      }

      res.render('dashboard/index', {
        pageTitle: 'Dashboard',
        currentPage: 'dashboard',
        user: req.session.user,
        stats: {
          tandasActivas,
          totalMiembros,
          pagosPendientes,
          proximaRonda
        },
        tandas: tandas.slice(0, 5),
        pagosSummary
      })

    } catch (err) {
      console.error('Dashboard error:', err)
      res.render('dashboard/index', {
        pageTitle: 'Dashboard',
        currentPage: 'dashboard',
        user: req.session.user,
        stats: { tandasActivas: 0, totalMiembros: 0, pagosPendientes: 0, proximaRonda: null },
        tandas: [],
        pagosSummary: { pagados: 0, pendientes: 0, faltantes: 0 }
      })
    }
  }
}

module.exports = dashboardController