const pool = require('../config/db')

const Pago = {

  // Get all payments for a tanda (payment tracking table)
  getByTanda: async (tanda_id) => {
    const result = await pool.query(
      `SELECT p.*, m.nombre AS miembro_nombre, r.numero_ronda
       FROM pagos p
       JOIN miembros m ON m.id = p.miembro_id
       JOIN rondas r ON r.id = p.ronda_id
       WHERE p.tanda_id = $1
       ORDER BY r.numero_ronda ASC, m.numero_turno ASC`,
      [tanda_id]
    )
    return result.rows
  },

  // Get all payments for a specific member
  getByMiembro: async (miembro_id) => {
    const result = await pool.query(
      `SELECT p.*, r.numero_ronda, r.fecha_pago AS fecha_ronda
       FROM pagos p
       JOIN rondas r ON r.id = p.ronda_id
       WHERE p.miembro_id = $1
       ORDER BY r.numero_ronda ASC`,
      [miembro_id]
    )
    return result.rows
  },

  // Mark a payment as paid
  marcarPagado: async (id) => {
    const result = await pool.query(
      `UPDATE pagos
       SET estado = 'pagado', fecha_pago = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    )
    return result.rows[0]
  },

  // Mark a payment as missing/faltante
  marcarFaltante: async (id) => {
    const result = await pool.query(
      `UPDATE pagos SET estado = 'faltante' WHERE id = $1 RETURNING *`,
      [id]
    )
    return result.rows[0]
  },

  // Reset payment back to pending
  marcarPendiente: async (id) => {
    const result = await pool.query(
      `UPDATE pagos SET estado = 'pendiente', fecha_pago = NULL WHERE id = $1 RETURNING *`,
      [id]
    )
    return result.rows[0]
  },

  // Create a payment record (called when a ronda is generated)
  create: async (tanda_id, miembro_id, ronda_id, monto) => {
    const result = await pool.query(
      `INSERT INTO pagos (tanda_id, miembro_id, ronda_id, monto, estado)
       VALUES ($1, $2, $3, $4, 'pendiente')
       RETURNING *`,
      [tanda_id, miembro_id, ronda_id, monto]
    )
    return result.rows[0]
  },

  // Dashboard stat — count pending payments for an organizer
  countPendientes: async (organizador_id) => {
    const result = await pool.query(
      `SELECT COUNT(p.id) FROM pagos p
       JOIN tandas t ON t.id = p.tanda_id
       WHERE t.organizador_id = $1 AND p.estado = 'pendiente'`,
      [organizador_id]
    )
    return parseInt(result.rows[0].count)
  },

  // Payment summary for a tanda (for reports/charts)
  getSummaryByTanda: async (tanda_id) => {
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE estado = 'pagado')   AS pagados,
        COUNT(*) FILTER (WHERE estado = 'pendiente') AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'faltante')  AS faltantes,
        SUM(monto) FILTER (WHERE estado = 'pagado')  AS total_cobrado
       FROM pagos
       WHERE tanda_id = $1`,
      [tanda_id]
    )
    return result.rows[0]
  }

}

module.exports = Pago