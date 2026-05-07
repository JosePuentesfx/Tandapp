const pool = require('../config/db')

const Notificacion = {

  // Get recent notifications for a user (last 20, newest first)
  getByUsuario: async (usuario_id) => {
    const result = await pool.query(
      `SELECT * FROM notificaciones 
       WHERE usuario_id = $1 
       ORDER BY created_at DESC 
       LIMIT 20`,
      [usuario_id]
    )
    return result.rows
  },

  // Count unread notifications for a user
  countUnread: async (usuario_id) => {
    const result = await pool.query(
      `SELECT COUNT(*) FROM notificaciones 
       WHERE usuario_id = $1 AND leida = false`,
      [usuario_id]
    )
    return parseInt(result.rows[0].count)
  },

  // Mark a single notification as read
  markAsRead: async (id, usuario_id) => {
    const result = await pool.query(
      `UPDATE notificaciones SET leida = true 
       WHERE id = $1 AND usuario_id = $2 
       RETURNING *`,
      [id, usuario_id]
    )
    return result.rows[0]
  },

  // Mark all notifications as read for a user
  markAllAsRead: async (usuario_id) => {
    await pool.query(
      `UPDATE notificaciones SET leida = true 
       WHERE usuario_id = $1 AND leida = false`,
      [usuario_id]
    )
  },

  // Create a new notification
  create: async (usuario_id, tipo, titulo, mensaje, tanda_id = null) => {
    const result = await pool.query(
      `INSERT INTO notificaciones (usuario_id, tipo, titulo, mensaje, tanda_id, leida, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       RETURNING *`,
      [usuario_id, tipo, titulo, mensaje, tanda_id]
    )
    return result.rows[0]
  }

}

module.exports = Notificacion
