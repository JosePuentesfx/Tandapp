const pool = require('../config/db')

const Ronda = {

  // Get all rondas for a tanda (payout schedule)
  getByTanda: async (tanda_id) => {
    const result = await pool.query(
      `SELECT r.*, m.nombre AS miembro_nombre, m.numero_turno
       FROM rondas r
       JOIN miembros m ON m.id = r.miembro_id
       WHERE r.tanda_id = $1
       ORDER BY r.numero_ronda ASC`,
      [tanda_id]
    )
    return result.rows
  },

  // Get the next upcoming ronda (dashboard stat)
  getProxima: async (organizador_id) => {
    const result = await pool.query(
      `SELECT r.*, m.nombre AS miembro_nombre, t.nombre AS tanda_nombre
       FROM rondas r
       JOIN miembros m ON m.id = r.miembro_id
       JOIN tandas t ON t.id = r.tanda_id
       WHERE t.organizador_id = $1
         AND r.estado = 'pendiente'
       ORDER BY r.fecha_pago ASC
       LIMIT 1`,
      [organizador_id]
    )
    return result.rows[0]
  },

  // Mark a ronda as completed (payout delivered)
  marcarCompletada: async (id) => {
    const result = await pool.query(
      `UPDATE rondas SET estado = 'completada' WHERE id = $1 RETURNING *`,
      [id]
    )
    return result.rows[0]
  },

  // Auto-generate all rondas when a tanda is created
  // Called once after tanda + members are set up
  generarRondas: async (tanda_id, fecha_inicio, frecuencia, miembros) => {
    // miembros must already be sorted by numero_turno ASC before calling this
    // The order they come in = the order of rondas
   
    const diasPorFrecuencia = {
      semanal: 7,
      quincenal: 14,
      mensual: 30
    }
   
    const dias = diasPorFrecuencia[frecuencia] || 7
    const rondas = []
   
    for (let i = 0; i < miembros.length; i++) {
      const miembro = miembros[i]
   
      // Ronda i+1 happens after i * dias days from fecha_inicio
      const fechaPago = new Date(fecha_inicio)
      fechaPago.setDate(fechaPago.getDate() + (dias * i))
   
      // Total payout = all members pay this one person
      const montoTotal = parseFloat(miembro.monto_aportacion) * miembros.length
   
      const result = await pool.query(
        `INSERT INTO rondas (tanda_id, miembro_id, numero_ronda, fecha_pago, monto_total)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tanda_id, miembro.id, i + 1, fechaPago.toISOString().split('T')[0], montoTotal]
      )
   
      rondas.push(result.rows[0])
    }
   
    return rondas
  }

}

module.exports = Ronda