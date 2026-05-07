const pool = require('../config/db')

const Tanda = {

  // Get all tandas for a specific organizer (dashboard list)
  getByOrganizador: async (organizador_id) => {
    const result = await pool.query(
      `SELECT t.*,
        COUNT(m.id) AS miembros_actuales,
        LEAST(100, GREATEST(0,
          CASE
            WHEN t.fecha_inicio IS NULL THEN 0
            WHEN CURRENT_DATE < t.fecha_inicio::date THEN 0
            ELSE ROUND(
              (CURRENT_DATE - t.fecha_inicio::date)::numeric /
              (t.total_miembros * 
                CASE t.frecuencia
                  WHEN 'semanal'   THEN 7
                  WHEN 'quincenal' THEN 14
                  WHEN 'mensual'   THEN 30
                  ELSE 7
                END
              )::numeric * 100
            )
          END
        )) AS progreso_fecha
       FROM tandas t
       LEFT JOIN miembros m ON m.tanda_id = t.id
       WHERE t.organizador_id = $1
       GROUP BY t.id
       ORDER BY t.created_at DESC`,
      [organizador_id]
    )
    return result.rows
  }
   
  ,

  // Get a single tanda by id (detail page)
  findById: async (id) => {
    const result = await pool.query(
      'SELECT * FROM tandas WHERE id = $1',
      [id]
    )
    return result.rows[0]
  },

  // Create new tanda
  create: async (nombre, descripcion, monto_aportacion, frecuencia, total_miembros, fecha_inicio, organizador_id) => {
    const result = await pool.query(
      `INSERT INTO tandas
        (nombre, descripcion, monto_aportacion, frecuencia, total_miembros, fecha_inicio, organizador_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [nombre, descripcion, monto_aportacion, frecuencia, total_miembros, fecha_inicio, organizador_id]
    )
    return result.rows[0]
  },

  // Update tanda
  update: async (id, nombre, descripcion, monto_aportacion, frecuencia, total_miembros, fecha_inicio) => {
    const result = await pool.query(
      `UPDATE tandas
       SET nombre = $1, descripcion = $2, monto_aportacion = $3,
           frecuencia = $4, total_miembros = $5, fecha_inicio = $6
       WHERE id = $7
       RETURNING *`,
      [nombre, descripcion, monto_aportacion, frecuencia, total_miembros, fecha_inicio, id]
    )
    return result.rows[0]
  },

  // Change tanda status (activa / pausada / finalizada)
  updateEstado: async (id, estado) => {
    const result = await pool.query(
      'UPDATE tandas SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, id]
    )
    return result.rows[0]
  },

  // Delete tanda (cascades to miembros, pagos, rondas)
  delete: async (id) => {
    await pool.query('DELETE FROM tandas WHERE id = $1', [id])
  },

  // Dashboard stats — count active tandas for an organizer
  countActivas: async (organizador_id) => {
    const result = await pool.query(
      `SELECT COUNT(*) FROM tandas
       WHERE organizador_id = $1 AND estado = 'activa'`,
      [organizador_id]
    )
    return parseInt(result.rows[0].count)
  }

}

module.exports = Tanda