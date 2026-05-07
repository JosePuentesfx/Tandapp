const pool = require('../config/db')

const Usuario = {

  // Find user by email (used for login)
  findByEmail: async (email) => {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1',
      [email]
    )
    return result.rows[0]
  },

  // Find user by id (used for session/profile)
  findById: async (id) => {
    const result = await pool.query(
      'SELECT * FROM usuarios WHERE id = $1',
      [id]
    )
    return result.rows[0]
  },

  // Create new user (register)
  create: async (nombre, apellido, email, password_hash) => {
    const result = await pool.query(
      `INSERT INTO usuarios (nombre, apellido, email, password_hash, rol)
       VALUES ($1, $2, $3, $4, 'organizador')
       RETURNING *`,
      [nombre, apellido, email, password_hash]
    )
    return result.rows[0]
  },

  // Get all users (admin only)
  getAll: async () => {
    const result = await pool.query(
      'SELECT id, nombre, apellido, email, rol, activo, created_at FROM usuarios ORDER BY created_at DESC'
    )
    return result.rows
  },

  // Deactivate user (admin only)
  deactivate: async (id) => {
    const result = await pool.query(
      'UPDATE usuarios SET activo = false WHERE id = $1 RETURNING *',
      [id]
    )
    return result.rows[0]
  },

  // Check if email already exists (used in register validation)
  emailExists: async (email) => {
    const result = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email]
    )
    return result.rows.length > 0
  },
  activate: async (id) => {
    const result = await pool.query(
      'UPDATE usuarios SET activo = true WHERE id = $1 RETURNING *',
      [id]
    )
    return result.rows[0]
  },

  // Update password externally (forgot password)
  updatePassword: async (email, password_hash) => {
    const result = await pool.query(
      'UPDATE usuarios SET password_hash = $1 WHERE email = $2 RETURNING *',
      [password_hash, email]
    )
    return result.rows[0]
  }

}

module.exports = Usuario