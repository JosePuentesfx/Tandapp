const bcrypt = require('bcrypt')
const Usuario = require('../models/Usuario')

const authController = {

  // ── GET /login ──────────────────────────────────────
  getLogin: (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session.user) return res.redirect('/')
    res.render('auth/login', { pageTitle: 'Iniciar Sesión' })
  },

  // ── POST /login ─────────────────────────────────────
  postLogin: async (req, res) => {
    try {
      const { email, password } = req.body

      // 1. Check if user exists
      const user = await Usuario.findByEmail(email)
      if (!user) {
        req.flash('error', 'Correo o contraseña incorrectos')
        return res.redirect('/login')
      }

      // 2. Check if account is active
      if (!user.activo) {
        req.flash('error', 'Tu cuenta ha sido desactivada')
        return res.redirect('/login')
      }

      // 3. Compare password with hash
      const match = await bcrypt.compare(password, user.password_hash)
      if (!match) {
        req.flash('error', 'Correo o contraseña incorrectos')
        return res.redirect('/login')
      }

      // 4. Save user in session (never save password_hash)
      req.session.user = {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol
      }

      req.flash('success', `Bienvenido de vuelta, ${user.nombre}!`)

      // Redirect based on role
      if (user.rol === 'admin') {
        return res.redirect('/admin')
      } else {
        return res.redirect('/dashboard')
      }

    } catch (err) {
      console.error('Login error:', err)
      req.flash('error', 'Algo salió mal, intenta de nuevo')
      res.redirect('/login')
    }
  },

  // ── GET /register ───────────────────────────────────
  getRegister: (req, res) => {
    if (req.session.user) return res.redirect('/dashboard')
    res.render('auth/register', { pageTitle: 'Crear Cuenta' })
  },

  // ── POST /register ──────────────────────────────────
  postRegister: async (req, res) => {
    try {
      const { nombre, apellido, email, password, confirmPassword } = req.body

      // 1. Passwords match
      if (password !== confirmPassword) {
        req.flash('error', 'Las contraseñas no coinciden')
        return res.redirect('/register')
      }

      if (password.length < 8) {
        req.flash('error', 'La contraseña debe tener al menos 8 caracteres')
        return res.redirect('/register')
      }

      // 3. Email already taken
      const exists = await Usuario.emailExists(email)
      if (exists) {
        req.flash('error', 'Este correo ya está registrado')
        return res.redirect('/register')
      }

      // 4. Hash password
      const password_hash = await bcrypt.hash(password, 10)

      // 5. Generate validation code
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()
      const expiry = new Date(Date.now() + 10 * 60 * 1000)

      // 6. Save in session
      req.session.pendingUser = {
        nombre,
        apellido,
        email,
        password_hash,
        codigo,
        expiry
      }

      // XSS Prevention: escape HTML chars in user input before placing in email
      const escapeHTML = (str) =>
        str.replace(/[&<>'"]/g, (tag) => ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag]));

      const safeNombre = escapeHTML(nombre);

      // 7. Send email
      const mailer = require('../config/mailer')
      try {
        await mailer.sendMail({
          from:    process.env.EMAIL_FROM,
          to:      email,
          subject: 'Verifica tu cuenta — TandApp',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:26px;font-weight:800;color:#1a7a4a;">TandApp</span>
              </div>
              <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px;">Código de verificación</h2>
              <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
                Hola <strong>${safeNombre}</strong>, usa este código para verificar tu registro.
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
      } catch (mailErr) {
        console.error('SMTP Error (Register):', mailErr)
        req.flash('error', 'Error al enviar el correo de verificación. Revisa la configuración del servidor.')
        return res.redirect('/register')
      }

      req.flash('success', `Código enviado a ${email}. Verifícalo para completar tu registro.`)
      res.redirect('/register/verificar')

    } catch (err) {
      console.error('Register error:', err)
      req.flash('error', 'Algo salió mal, intenta de nuevo')
      res.redirect('/register')
    }
  },

  // ── GET /register/verificar ─────────────────────────
  getRegisterVerificar: (req, res) => {
    if (!req.session.pendingUser) {
      req.flash('error', 'Por favor, regístrate primero')
      return res.redirect('/register')
    }
    res.render('auth/register-verificar', {
      pageTitle: 'Verificar correo',
      pendingUser: req.session.pendingUser
    })
  },

  // ── POST /register/verificar ────────────────────────
  postRegisterVerificar: async (req, res) => {
    try {
      const { codigo } = req.body
      const pendingUser = req.session.pendingUser

      if (!pendingUser) {
        req.flash('error', 'Sesión expirada. Regístrate de nuevo.')
        return res.redirect('/register')
      }

      if (new Date() > new Date(pendingUser.expiry)) {
        req.session.pendingUser = null
        req.flash('error', 'El código expiró. Regístrate de nuevo.')
        return res.redirect('/register')
      }

      if (codigo.trim() !== pendingUser.codigo) {
        req.flash('error', 'Código incorrecto.')
        return res.redirect('/register/verificar')
      }

      // Check if email already taken (just in case)
      const exists = await Usuario.emailExists(pendingUser.email)
      if (exists) {
        req.session.pendingUser = null
        req.flash('error', 'Este correo ya está registrado')
        return res.redirect('/register')
      }

      // Create user
      const user = await Usuario.create(
        pendingUser.nombre,
        pendingUser.apellido,
        pendingUser.email,
        pendingUser.password_hash
      )

      // Auto login after register
      req.session.user = {
        id: user.id,
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        rol: user.rol
      }
      
      req.session.pendingUser = null
      req.flash('success', `Cuenta verificada exitosamente, bienvenido ${user.nombre}!`)
      if (user.rol === 'admin') {
        return res.redirect('/admin')
      } else {
        return res.redirect('/dashboard')
      }

    } catch (err) {
      console.error('Verify error:', err)
      req.flash('error', 'Error al verificar el código')
      res.redirect('/register/verificar')
    }
  },

  // ── POST /logout ────────────────────────────────────
  logout: (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error('Logout error:', err)
      res.clearCookie('connect.sid')
      res.redirect('/login')
    })
  },

  // ── GET /forgot-password ────────────────────────────
  getForgotPassword: (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.render('auth/forgot-password', { pageTitle: 'Olvidé mi contraseña' })
  },

  // ── POST /forgot-password ───────────────────────────
  postForgotPassword: async (req, res) => {
    try {
      const { email } = req.body
      if (!email) {
        req.flash('error', 'El correo es requerido')
        return res.redirect('/forgot-password')
      }

      const user = await Usuario.findByEmail(email)
      if (!user) {
        // Por seguridad, siempre decimos que se envió para no revelar si el correo existe
        req.flash('success', `Si existe una cuenta con el correo ${email}, hemos enviado un código.`)
        return res.redirect('/reset-password/verificar')
      }

      // Generate validation code
      const codigo = Math.floor(100000 + Math.random() * 900000).toString()
      const expiry = new Date(Date.now() + 10 * 60 * 1000)

      req.session.resetPwd = { email, codigo, expiry }

      const mailer = require('../config/mailer')
      try {
        await mailer.sendMail({
          from:    process.env.EMAIL_FROM,
          to:      email,
          subject: 'Restablecer contraseña — TandApp',
          html: `
            <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
              <div style="text-align:center;margin-bottom:24px;">
                <span style="font-size:26px;font-weight:800;color:#1a7a4a;">TandApp</span>
              </div>
              <h2 style="font-size:18px;font-weight:700;color:#111827;margin:0 0 8px;">Recuperación de contraseña</h2>
              <p style="font-size:14px;color:#6b7280;margin:0 0 24px;">
                Usa este código para restablecer tu contraseña.
                Expira en <strong>10 minutos</strong>.
              </p>
              <div style="background:#f0fdf4;border:2px dashed #86efac;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
                <span style="font-size:44px;font-weight:800;letter-spacing:12px;color:#1a7a4a;">${codigo}</span>
              </div>
            </div>
          `
        })
      } catch (mailErr) {
        console.error('SMTP Error (Forgot Password):', mailErr)
        req.flash('error', 'Error al enviar el correo de recuperación.')
        return res.redirect('/forgot-password')
      }

      req.flash('success', `Código enviado a ${email}. Verifícalo para continuar.`)
      res.redirect('/reset-password/verificar')

    } catch (err) {
      console.error(err)
      req.flash('error', 'Algo salió mal, intenta de nuevo')
      res.redirect('/forgot-password')
    }
  },

  // ── GET /reset-password/verificar ───────────────────
  getForgotVerify: (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    if (!req.session.resetPwd) {
      req.flash('error', 'Por favor solicita un código primero')
      return res.redirect('/forgot-password')
    }
    res.render('auth/forgot-password-verify', {
      pageTitle: 'Verificar código',
      email: req.session.resetPwd.email
    })
  },

  // ── POST /reset-password/verificar ──────────────────
  postForgotVerify: (req, res) => {
    const { codigo } = req.body
    const resetSession = req.session.resetPwd

    if (!resetSession) {
      req.flash('error', 'Sesión expirada. Solicita el código de nuevo.')
      return res.redirect('/forgot-password')
    }

    if (new Date() > new Date(resetSession.expiry)) {
      req.session.resetPwd = null
      req.flash('error', 'El código expiró. Solicita uno nuevo.')
      return res.redirect('/forgot-password')
    }

    if (codigo.trim() !== resetSession.codigo) {
      req.flash('error', 'Código incorrecto.')
      return res.redirect('/reset-password/verificar')
    }

    // Code verified: allow changing password
    req.session.resetPwd.verified = true
    res.redirect('/reset-password/nueva')
  },

  // ── GET /reset-password/nueva ───────────────────────
  getForgotNew: (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    if (!req.session.resetPwd || !req.session.resetPwd.verified) {
      req.flash('error', 'Verifica tu código primero')
      return res.redirect('/forgot-password')
    }
    res.render('auth/forgot-password-new', { pageTitle: 'Nueva contraseña' })
  },

  // ── POST /reset-password/nueva ──────────────────────
  postForgotNew: async (req, res) => {
    try {
      const resetSession = req.session.resetPwd
      if (!resetSession || !resetSession.verified) {
        return res.redirect('/forgot-password')
      }

      const { password_nueva, password_confirmar } = req.body

      if (!password_nueva || password_nueva.length < 8) {
        req.flash('error', 'La contraseña debe tener mínimo 8 caracteres.')
        return res.redirect('/reset-password/nueva')
      }

      if (password_nueva !== password_confirmar) {
        req.flash('error', 'Las contraseñas no coinciden.')
        return res.redirect('/reset-password/nueva')
      }

      const password_hash = await bcrypt.hash(password_nueva, 10)
      await Usuario.updatePassword(resetSession.email, password_hash)

      req.session.resetPwd = null
      req.flash('success', 'Contraseña actualizada. Ya puedes iniciar sesión.')
      res.redirect('/login')

    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cambiar la contraseña.')
      res.redirect('/reset-password/nueva')
    }
  }

}

module.exports = authController