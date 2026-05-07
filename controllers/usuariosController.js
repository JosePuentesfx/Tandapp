const pool = require('../config/db')

const getMiembros = async (req, res) => {
  try {
    const organizadorId = req.session.user.id

    const result = await pool.query(`
      SELECT
        m.id,
        m.nombre,
        m.telefono,
        m.notas,
        m.numero_turno,
        m.tanda_id,
        t.nombre AS tanda_nombre,
        COALESCE(SUM(CASE WHEN p.estado = 'pagado' THEN p.monto ELSE 0 END), 0) AS total_pagado,
        COALESCE(SUM(CASE WHEN p.estado = 'pendiente' THEN p.monto ELSE 0 END), 0) AS total_pendiente
      FROM miembros m
      JOIN tandas t ON t.id = m.tanda_id
      LEFT JOIN pagos p ON p.miembro_id = m.id
      WHERE t.organizador_id = $1
      GROUP BY m.id, t.id
      ORDER BY t.nombre, m.numero_turno
    `, [organizadorId])

    const miembros = result.rows
    const totalTandas = [...new Set(miembros.map(m => m.tanda_id))].length
    const totalPendientes = miembros.filter(m => Number(m.total_pendiente) > 0).length

    res.render('usuarios/usuarios', {
      pageTitle: 'Miembros',
      currentPage: 'miembros',
      user: req.session.user,
      miembros,
      totalMiembros: miembros.length,
      totalTandas,
      totalPendientes
    })
  } catch (err) {
    console.error(err)
    req.flash('error', 'Error al cargar los miembros')
    res.redirect('/dashboard')
  }
}

module.exports = { getMiembros }