const pool = require('../config/db')

const Miembro = {

  // Get all members of a tanda
  getByTanda: async (tanda_id) => {
    const result = await pool.query(
      `SELECT m.*,
        COUNT(p.id) FILTER (WHERE p.estado = 'pagado') AS pagos_realizados,
        COUNT(p.id) FILTER (WHERE p.estado = 'pendiente') AS pagos_pendientes,
        COUNT(p.id) FILTER (WHERE p.estado = 'faltante') AS pagos_faltantes
       FROM miembros m
       LEFT JOIN pagos p ON p.miembro_id = m.id
       WHERE m.tanda_id = $1
       GROUP BY m.id
       ORDER BY m.numero_turno ASC`,
      [tanda_id]
    )
    return result.rows
  },

  // Get a single member by id
  findById: async (id) => {
    const result = await pool.query(
      'SELECT * FROM miembros WHERE id = $1',
      [id]
    )
    return result.rows[0]
  },

  // Add a member to a tanda
  create: async (tanda_id, nombre, telefono, notas, numero_turno) => {
    const result = await pool.query(
      `INSERT INTO miembros (tanda_id, nombre, telefono, notas, numero_turno)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tanda_id, nombre, telefono, notas, numero_turno]
    )
    return result.rows[0]
  },

  // Update member info
  update: async (id, nombre, telefono, notas) => {
    const result = await pool.query(
      `UPDATE miembros
       SET nombre = $1, telefono = $2, notas = $3
       WHERE id = $4
       RETURNING *`,
      [nombre, telefono, notas, id]
    )
    return result.rows[0]
  },

  // Remove member from tanda
  delete: async (id) => {
    await pool.query('DELETE FROM miembros WHERE id = $1', [id])
  },

  // Count total members across all tandas for an organizer (dashboard stat)
  countByOrganizador: async (organizador_id) => {
    const result = await pool.query(
      `SELECT COUNT(m.id) FROM miembros m
       JOIN tandas t ON t.id = m.tanda_id
       WHERE t.organizador_id = $1`,
      [organizador_id]
    )
    return parseInt(result.rows[0].count)
  },

  // Get next available turn number for a tanda
  nextTurno: async (tanda_id) => {
    const result = await pool.query(
      'SELECT COALESCE(MAX(numero_turno), 0) + 1 AS next FROM miembros WHERE tanda_id = $1',
      [tanda_id]
    )
    return result.rows[0].next
  }

}

module.exports = Miembro