const pool      = require('../config/db')
const bcrypt    = require('bcrypt')
const mailer    = require('../config/mailer')

const cuentaController = {

  // ── GET /cuenta ───────────────────────────────────────
  getCuenta: async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          u.created_at,
          COUNT(DISTINCT t.id) AS "totalTandas",
          COUNT(DISTINCT m.id) AS "totalMiembros"
        FROM usuarios u
        LEFT JOIN tandas   t ON t.organizador_id = u.id
        LEFT JOIN miembros m ON m.tanda_id = t.id
        WHERE u.id = $1
        GROUP BY u.created_at
      `, [req.session.user.id])

      res.render('cuenta/index', {
        pageTitle: 'Mi Cuenta',
        currentPage: 'cuenta',
        user: req.session.user,
        cuentaData: rows[0] || { created_at: new Date(), totalTandas: 0, totalMiembros: 0 }
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar la cuenta')
      res.redirect('/dashboard')
    }
  },

  // ── POST /cuenta/perfil ───────────────────────────────
  actualizarPerfil: async (req, res) => {
    try {
      const { nombre, apellido } = req.body
      if (!nombre?.trim() || !apellido?.trim()) {
        req.flash('error', 'El nombre y apellido son obligatorios')
        return res.redirect('/cuenta')
      }
      await pool.query(
        `UPDATE usuarios SET nombre = $1, apellido = $2 WHERE id = $3`,
        [nombre.trim(), apellido.trim(), req.session.user.id]
      )
      req.session.user.nombre   = nombre.trim()
      req.session.user.apellido = apellido.trim()
      req.flash('success', 'Información actualizada correctamente')
      res.redirect('/cuenta')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar el perfil')
      res.redirect('/cuenta')
    }
  },

  // ── GET /cuenta/password ──────────────────────────────
  getPasswordSolicitar: (req, res) => {
    res.render('cuenta/password solicitar', {
      pageTitle: 'Cambiar contraseña',
      currentPage: 'cuenta',
      user: req.session.user
    })
  },

  // ── POST /cuenta/password/solicitar ──────────────────
  postPasswordSolicitar: async (req, res) => {
    try {
      const userId = req.session.user.id
      const email  = req.session.user.email
      const nombre = req.session.user.nombre

      const codigo = Math.floor(100000 + Math.random() * 900000).toString()
      const expiry = new Date(Date.now() + 10 * 60 * 1000)

      await pool.query(
        `UPDATE usuarios SET reset_codigo = $1, reset_expiry = $2 WHERE id = $3`,
        [codigo, expiry, userId]
      )

      // XSS Prevention: escape HTML chars in user input before placing in email
      const escapeHTML = (str) =>
        str.replace(/[&<>'"]/g, (tag) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));

      const safeNombre = escapeHTML(nombre);

      await mailer.sendMail({
        from:    process.env.EMAIL_FROM,
        to:      email,
        subject: 'Tu código de verificación — TandApp',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
            <div style="text-align:center;margin-bottom:24px;">
              <span style="font-size:26px;font-weight:800;color:#1a7a4a;">TandApp</span>
            </div>
            <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px;">Código de verificación</h2>
            <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
              Hola <strong>${safeNombre}</strong>, usa este código para confirmar el cambio de contraseña.
              Expira en <strong>10 minutos</strong>.
            </p>
            <div style="background:#f0fdf4;border:2px dashed #86efac;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
              <span style="font-size:44px;font-weight:800;letter-spacing:12px;color:#1a7a4a;">${codigo}</span>
            </div>
            <p style="font-size:12px;color:#9ca3af;text-align:center;margin:0;">
              Si no solicitaste este código, ignora este mensaje.
            </p>
          </div>
        `
      })

      req.flash('success', `Código enviado a ${email}`)
      res.redirect('/cuenta/password/verificar')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al enviar el correo. Intenta de nuevo.')
      res.redirect('/cuenta/password')
    }
  },

  // ── GET /cuenta/password/verificar ───────────────────
  getPasswordVerificar: (req, res) => {
    res.render('cuenta/password verificar', {
      pageTitle: 'Verificar código',
      currentPage: 'cuenta',
      user: req.session.user
    })
  },

  // ── POST /cuenta/password/verificar ──────────────────
  postPasswordVerificar: async (req, res) => {
    try {
      const { codigo } = req.body
      const userId = req.session.user.id

      const { rows } = await pool.query(
        `SELECT reset_codigo, reset_expiry FROM usuarios WHERE id = $1`,
        [userId]
      )

      const { reset_codigo, reset_expiry } = rows[0]

      if (!reset_codigo) {
        req.flash('error', 'No hay un código activo. Solicita uno nuevo.')
        return res.redirect('/cuenta/password')
      }
      if (new Date() > new Date(reset_expiry)) {
        await pool.query(
          `UPDATE usuarios SET reset_codigo = NULL, reset_expiry = NULL WHERE id = $1`,
          [userId]
        )
        req.flash('error', 'El código expiró. Solicita uno nuevo.')
        return res.redirect('/cuenta/password')
      }
      if (codigo.trim() !== reset_codigo) {
        req.flash('error', 'Código incorrecto. Verifica tu correo.')
        return res.redirect('/cuenta/password/verificar')
      }

      req.session.codigoVerificado = true
      res.redirect('/cuenta/password/nueva')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al verificar el código')
      res.redirect('/cuenta/password/verificar')
    }
  },

  // ── GET /cuenta/password/nueva ────────────────────────
  getPasswordNueva: (req, res) => {
    if (!req.session.codigoVerificado) {
      req.flash('error', 'Primero verifica tu código')
      return res.redirect('/cuenta/password')
    }
    res.render('cuenta/password nueva', {
      pageTitle: 'Nueva contraseña',
      currentPage: 'cuenta',
      user: req.session.user
    })
  },

  // ── POST /cuenta/password/nueva ───────────────────────
  postPasswordNueva: async (req, res) => {
    try {
      if (!req.session.codigoVerificado) {
        req.flash('error', 'Sesión inválida. Empieza de nuevo.')
        return res.redirect('/cuenta/password')
      }

      const { password_nueva, password_confirmar } = req.body

      if (!password_nueva || password_nueva.length < 8) {
        req.flash('error', 'La contraseña debe tener al menos 8 caracteres')
        return res.redirect('/cuenta/password/nueva')
      }
      if (password_nueva !== password_confirmar) {
        req.flash('error', 'Las contraseñas no coinciden')
        return res.redirect('/cuenta/password/nueva')
      }

      const hash = await bcrypt.hash(password_nueva, 10)
      await pool.query(
        `UPDATE usuarios SET password_hash = $1, reset_codigo = NULL, reset_expiry = NULL WHERE id = $2`,
        [hash, req.session.user.id]
      )

      delete req.session.codigoVerificado
      req.flash('success', '¡Contraseña cambiada correctamente!')
      res.redirect('/cuenta')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al guardar la nueva contraseña')
      res.redirect('/cuenta/password/nueva')
    }
  }
}

module.exports = cuentaController