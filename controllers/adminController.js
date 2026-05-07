const pool = require('../config/db')

const adminController = {

  // ── GET /admin ────────────────────────────────────────
  getDashboard: async (req, res) => {
    try {
      const [{ rows: statsRows }, { rows: usuarios }] = await Promise.all([
        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM usuarios)                           AS "totalUsuarios",
            (SELECT COUNT(*) FROM usuarios WHERE activo = true)       AS "usuariosActivos",
            (SELECT COUNT(*) FROM usuarios WHERE activo = false)      AS "usuariosInactivos",
            (SELECT COUNT(*) FROM usuarios WHERE rol = 'organizador') AS "totalOrganizadores",
            (SELECT COUNT(*) FROM usuarios WHERE rol = 'admin')       AS "totalAdmins",
            (SELECT COUNT(*) FROM tandas)                             AS "totalTandas",
            (SELECT COUNT(*) FROM tandas WHERE estado = 'activa')     AS "tandasActivas",
            (SELECT COUNT(*) FROM miembros)                           AS "totalMiembros",
            (SELECT COUNT(*) FROM pagos)                              AS "totalPagos"
        `),
        pool.query(`
          SELECT id, nombre, apellido, email, rol, activo, created_at
          FROM usuarios ORDER BY created_at DESC LIMIT 8
        `)
      ])

      const { rows: ultimoRows } = await pool.query(
        `SELECT nombre, apellido, created_at FROM usuarios ORDER BY created_at DESC LIMIT 1`
      )

      const stats = { ...statsRows[0], ultimoRegistro: ultimoRows[0] || null }
      Object.keys(stats).forEach(k => {
        if (typeof stats[k] === 'string' && !isNaN(stats[k])) stats[k] = Number(stats[k])
      })

      res.render('admin/admin', {
        pageTitle: 'Admin — Dashboard', currentPage: 'admin',
        user: req.session.user, stats, usuarios
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar el panel')
      res.redirect('/dashboard')
    }
  },

  // ── GET /admin/actividad ──────────────────────────────
  getActividad: async (req, res) => {
    try {
      const { rows: statsRows } = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM usuarios)                                           AS "totalUsuarios",
          (SELECT COUNT(*) FROM usuarios WHERE activo = true)                       AS "usuariosActivos",
          (SELECT COUNT(*) FROM usuarios WHERE rol = 'organizador')                 AS "totalOrganizadores",
          (SELECT COUNT(*) FROM usuarios WHERE rol = 'admin')                       AS "totalAdmins",
          (SELECT COUNT(*) FROM tandas)                                             AS "totalTandas",
          (SELECT COUNT(*) FROM tandas WHERE estado = 'activa')                     AS "tandasActivas",
          (SELECT COUNT(*) FROM tandas WHERE estado = 'pausada')                    AS "tandasPausadas",
          (SELECT COUNT(*) FROM tandas WHERE estado = 'finalizada')                 AS "tandasFinalizadas",
          (SELECT COUNT(*) FROM pagos WHERE estado = 'pagado')                      AS "pagosPagados",
          (SELECT COUNT(*) FROM pagos WHERE estado = 'pendiente')                   AS "pagosPendientes",
          (SELECT COUNT(*) FROM pagos WHERE estado = 'faltante')                    AS "pagosFaltantes",
          (SELECT COUNT(*) FROM usuarios
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()))     AS "registrosEsteMes",
          (SELECT COUNT(*) FROM usuarios
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month'))
                                                                                    AS "registrosMesAnterior",
          (SELECT COUNT(*) FROM tandas
            WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW()))     AS "tandasEsteMes",
          (SELECT COUNT(*) FROM pagos
            WHERE DATE_TRUNC('day', fecha_pago) = CURRENT_DATE)                     AS "pagosHoy"
      `)

      const actividadStats = statsRows[0]
      Object.keys(actividadStats).forEach(k => {
        if (typeof actividadStats[k] === 'string' && !isNaN(actividadStats[k])) {
          actividadStats[k] = Number(actividadStats[k])
        }
      })

      // Registros de usuarios últimos 6 meses
      const { rows: regPorMes } = await pool.query(`
        SELECT
          DATE_TRUNC('month', created_at)                     AS fecha_orden,
          COUNT(*) FILTER (WHERE rol = 'organizador')         AS organizadores,
          COUNT(*) FILTER (WHERE rol = 'admin')               AS admins
        FROM usuarios
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY fecha_orden ASC
      `)

      // Tandas creadas últimos 6 meses
      const { rows: tandasMes } = await pool.query(`
        SELECT
          DATE_TRUNC('month', created_at) AS fecha_orden,
          COUNT(*)                        AS total
        FROM tandas
        WHERE created_at >= NOW() - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY fecha_orden ASC
      `)

      // Construir array de 6 meses (rellenar con 0 si no hay datos)
      const meses = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date()
        d.setDate(1)
        d.setMonth(d.getMonth() - i)
        meses.push({
          label: d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
          key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        })
      }

      const regMap = {}
      regPorMes.forEach(r => {
        const k = new Date(r.fecha_orden).toISOString().slice(0, 7)
        regMap[k] = { org: Number(r.organizadores), adm: Number(r.admins) }
      })
      const tanMap = {}
      tandasMes.forEach(r => {
        const k = new Date(r.fecha_orden).toISOString().slice(0, 7)
        tanMap[k] = Number(r.total)
      })

      const graficas = {
        mesesLabels:     meses.map(m => m.label),
        registrosPorMes: meses.map(m => regMap[m.key]?.org || 0),
        adminsPorMes:    meses.map(m => regMap[m.key]?.adm || 0),
        tandasPorMes:    meses.map(m => tanMap[m.key] || 0),
      }

      const { rows: ultimosUsuarios } = await pool.query(`
        SELECT id, nombre, apellido, email, rol, activo, created_at
        FROM usuarios ORDER BY created_at DESC LIMIT 10
      `)

      res.render('admin/actividad', {
        pageTitle: 'Admin — Actividad', currentPage: 'admin',
        user: req.session.user,
        actividadStats,
        graficas,
        ultimosUsuarios
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar la actividad')
      res.redirect('/admin')
    }
  },

  // ── GET /admin/usuarios ───────────────────────────────
  getUsuarios: async (req, res) => {
    try {
      const { rows: usuarios } = await pool.query(`
        SELECT u.id, u.nombre, u.apellido, u.email, u.rol, u.activo, u.created_at,
               COUNT(t.id) AS total_tandas
        FROM usuarios u
        LEFT JOIN tandas t ON t.organizador_id = u.id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `)
      res.render('admin/usuarios', {
        pageTitle: 'Admin — Usuarios', currentPage: 'admin',
        user: req.session.user, usuarios
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar los usuarios')
      res.redirect('/admin')
    }
  },

  // ── POST /admin/usuarios/:id/desactivar ───────────────
  desactivarUsuario: async (req, res) => {
    try {
      const id = parseInt(req.params.id)
      if (isNaN(id)) {
        req.flash('error', 'ID inválido')
        return res.redirect('/admin/usuarios')
      }

      if (id === req.session.user.id) {
        req.flash('error', 'No puedes desactivar tu propia cuenta')
        return res.redirect('/admin/usuarios')
      }

      const { rows } = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id])
      if (rows.length === 0) {
        req.flash('error', 'Usuario no encontrado')
        return res.redirect('/admin/usuarios')
      }

      await pool.query(`UPDATE usuarios SET activo = false WHERE id = $1`, [id])
      req.flash('success', 'Usuario desactivado correctamente')
      res.redirect('/admin/usuarios')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al desactivar el usuario')
      res.redirect('/admin/usuarios')
    }
  },

  // ── POST /admin/usuarios/:id/activar ──────────────────
  activarUsuario: async (req, res) => {
    try {
      const id = parseInt(req.params.id)
      if (isNaN(id)) {
        req.flash('error', 'ID inválido')
        return res.redirect('/admin/usuarios')
      }

      const { rows } = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id])
      if (rows.length === 0) {
        req.flash('error', 'Usuario no encontrado')
        return res.redirect('/admin/usuarios')
      }

      await pool.query(`UPDATE usuarios SET activo = true WHERE id = $1`, [id])
      req.flash('success', 'Usuario activado correctamente')
      res.redirect('/admin/usuarios')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al activar el usuario')
      res.redirect('/admin/usuarios')
    }
  },

  // ── POST /admin/usuarios/:id/rol ───────────────────────
  cambiarRol: async (req, res) => {
    try {
      const id = parseInt(req.params.id)
      const { rol } = req.body

      if (isNaN(id)) {
        req.flash('error', 'ID inválido')
        return res.redirect('/admin/usuarios')
      }

      if (id === req.session.user.id) {
        req.flash('error', 'No puedes cambiar tu propio rol')
        return res.redirect('/admin/usuarios')
      }

      const rolesValidos = ['organizador', 'admin']
      if (!rolesValidos.includes(rol)) {
        req.flash('error', 'Rol no válido')
        return res.redirect('/admin/usuarios')
      }

      const { rows } = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id])
      if (rows.length === 0) {
        req.flash('error', 'Usuario no encontrado')
        return res.redirect('/admin/usuarios')
      }

      await pool.query('UPDATE usuarios SET rol = $1 WHERE id = $2', [rol, id])
      req.flash('success', `Rol actualizado a "${rol}" correctamente`)
      res.redirect('/admin/usuarios')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cambiar el rol')
      res.redirect('/admin/usuarios')
    }
  },

  // ── POST /admin/usuarios/:id/eliminar ──────────────────
  eliminarUsuario: async (req, res) => {
    const client = await pool.connect()
    try {
      const id = parseInt(req.params.id)

      if (isNaN(id)) {
        req.flash('error', 'ID inválido')
        return res.redirect('/admin/usuarios')
      }

      if (id === req.session.user.id) {
        req.flash('error', 'No puedes eliminarte a ti mismo')
        return res.redirect('/admin/usuarios')
      }

      const { rows } = await client.query('SELECT id, nombre, apellido FROM usuarios WHERE id = $1', [id])
      if (rows.length === 0) {
        req.flash('error', 'Usuario no encontrado')
        return res.redirect('/admin/usuarios')
      }

      // Eliminar datos relacionados en cascada — wrapped in transaction
      await client.query('BEGIN')
      await client.query('DELETE FROM notificaciones WHERE usuario_id = $1', [id])
      await client.query('DELETE FROM pagos WHERE miembro_id IN (SELECT id FROM miembros WHERE tanda_id IN (SELECT id FROM tandas WHERE organizador_id = $1))', [id])
      await client.query('DELETE FROM rondas WHERE tanda_id IN (SELECT id FROM tandas WHERE organizador_id = $1)', [id])
      await client.query('DELETE FROM miembros WHERE tanda_id IN (SELECT id FROM tandas WHERE organizador_id = $1)', [id])
      await client.query('DELETE FROM tandas WHERE organizador_id = $1', [id])
      await client.query('DELETE FROM usuarios WHERE id = $1', [id])
      await client.query('COMMIT')

      // Sanitize user name before inserting in flash message
      const safeName = `${rows[0].nombre} ${rows[0].apellido}`.replace(/[<>"'&]/g, '')
      req.flash('success', `Usuario "${safeName}" eliminado permanentemente`)
      res.redirect('/admin/usuarios')
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(err)
      req.flash('error', 'Error al eliminar el usuario')
      res.redirect('/admin/usuarios')
    } finally {
      client.release()
    }
  }
}

module.exports = adminController
