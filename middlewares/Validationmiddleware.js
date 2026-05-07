// ── Input sanitizer helper ────────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return ''
  return str.trim()
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

const validationMiddleware = {

    // ── validateLogin ────────────────────────────────────
    validateLogin: (req, res, next) => {
      const { email, password } = req.body
  
      if (!email || !password) {
        req.flash('error', 'Correo y contraseña son requeridos')
        return res.redirect('/login')
      }
  
      // Basic email format check
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email) || email.length > 254) {
        req.flash('error', 'Ingresa un correo válido')
        return res.redirect('/login')
      }

      // Normalize email
      req.body.email = email.trim().toLowerCase()
  
      next()
    },
  
    // ── validateRegister ─────────────────────────────────
    validateRegister: (req, res, next) => {
      const { nombre, apellido, email, password, confirmPassword } = req.body
  
      if (!nombre || !apellido || !email || !password || !confirmPassword) {
        req.flash('error', 'Todos los campos son requeridos')
        return res.redirect('/register')
      }

      // Length limits
      if (nombre.trim().length > 50) {
        req.flash('error', 'El nombre no puede tener más de 50 caracteres')
        return res.redirect('/register')
      }
      if (apellido.trim().length > 50) {
        req.flash('error', 'El apellido no puede tener más de 50 caracteres')
        return res.redirect('/register')
      }

      // Name format (letters, spaces, accents only)
      const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/
      if (!nameRegex.test(nombre.trim()) || !nameRegex.test(apellido.trim())) {
        req.flash('error', 'El nombre y apellido solo pueden contener letras')
        return res.redirect('/register')
      }
  
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email) || email.length > 254) {
        req.flash('error', 'Ingresa un correo válido')
        return res.redirect('/register')
      }
  
      if (password.length < 8 || password.length > 128) {
        req.flash('error', 'La contraseña debe tener entre 8 y 128 caracteres')
        return res.redirect('/register')
      }

      // Require at least: 1 uppercase, 1 lowercase, 1 number, 1 special char
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/`~]).{8,}$/
      if (!passwordRegex.test(password)) {
        req.flash('error', 'La contraseña debe incluir mayúscula, minúscula, número y carácter especial')
        return res.redirect('/register')
      }
  
      if (password !== confirmPassword) {
        req.flash('error', 'Las contraseñas no coinciden')
        return res.redirect('/register')
      }

      // Sanitize + normalize
      req.body.nombre = sanitize(nombre)
      req.body.apellido = sanitize(apellido)
      req.body.email = email.trim().toLowerCase()
  
      next()
    },
  
    // ── validateTanda ────────────────────────────────────
    validateTanda: (req, res, next) => {
      const { nombre, monto_aportacion, frecuencia, total_miembros, fecha_inicio } = req.body
  
      if (!nombre || !monto_aportacion || !frecuencia || !total_miembros || !fecha_inicio) {
        req.flash('error', 'Todos los campos requeridos deben estar llenos')
        return res.redirect(req.get('Referrer') || '/')
      }

      // Name length
      if (nombre.trim().length > 100) {
        req.flash('error', 'El nombre de la tanda no puede tener más de 100 caracteres')
        return res.redirect(req.get('Referrer') || '/')
      }
  
      const monto = parseFloat(monto_aportacion)
      if (isNaN(monto) || monto <= 0 || monto > 1000000) {
        req.flash('error', 'El monto debe ser un número entre $1 y $1,000,000')
        return res.redirect(req.get('Referrer') || '/')
      }
  
      const miembros = parseInt(total_miembros)
      if (isNaN(miembros) || miembros < 2 || miembros > 100) {
        req.flash('error', 'La tanda debe tener entre 2 y 100 miembros')
        return res.redirect(req.get('Referrer') || '/')
      }
  
      const frecuenciasValidas = ['semanal', 'quincenal', 'mensual']
      if (!frecuenciasValidas.includes(frecuencia)) {
        req.flash('error', 'Frecuencia inválida')
        return res.redirect(req.get('Referrer') || '/')
      }

      // Validate date format
      const fecha = new Date(fecha_inicio)
      if (isNaN(fecha.getTime())) {
        req.flash('error', 'Fecha de inicio inválida')
        return res.redirect(req.get('Referrer') || '/')
      }

      // Sanitize
      req.body.nombre = sanitize(nombre)
      req.body.monto_aportacion = monto
      req.body.total_miembros = miembros
  
      next()
    },
  
    // ── validateMiembro ──────────────────────────────────
    validateMiembro: (req, res, next) => {
      const { nombre, telefono } = req.body
  
      if (!nombre || nombre.trim() === '') {
        req.flash('error', 'El nombre del miembro es requerido')
        return res.redirect(req.get('Referrer') || '/')
      }

      if (nombre.trim().length > 80) {
        req.flash('error', 'El nombre no puede tener más de 80 caracteres')
        return res.redirect(req.get('Referrer') || '/')
      }

      // Validate phone if provided
      if (telefono && telefono.trim() !== '') {
        const phoneClean = telefono.replace(/[\s\-\(\)\.]/g, '')
        if (!/^\+?\d{7,15}$/.test(phoneClean)) {
          req.flash('error', 'El teléfono no tiene un formato válido')
          return res.redirect(req.get('Referrer') || '/')
        }
      }

      // Sanitize
      req.body.nombre = sanitize(nombre)
      req.body.telefono = telefono ? sanitize(telefono) : null
      req.body.notas = req.body.notas ? sanitize(req.body.notas) : null
  
      next()
    },

    // ── validateEstado ──────────────────────────────────
    validateEstado: (req, res, next) => {
      const { estado } = req.body
      const estadosValidos = ['activa', 'pausada', 'finalizada']
      if (!estado || !estadosValidos.includes(estado)) {
        req.flash('error', 'Estado inválido')
        return res.redirect(req.get('Referrer') || '/')
      }
      next()
    },

    // ── validatePerfil ──────────────────────────────────
    validatePerfil: (req, res, next) => {
      const { nombre, apellido } = req.body
      if (!nombre?.trim() || !apellido?.trim()) {
        req.flash('error', 'El nombre y apellido son obligatorios')
        return res.redirect('/cuenta')
      }
      if (nombre.trim().length > 50 || apellido.trim().length > 50) {
        req.flash('error', 'El nombre y apellido no pueden tener más de 50 caracteres')
        return res.redirect('/cuenta')
      }
      const nameRegex = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s'-]+$/
      if (!nameRegex.test(nombre.trim()) || !nameRegex.test(apellido.trim())) {
        req.flash('error', 'El nombre y apellido solo pueden contener letras')
        return res.redirect('/cuenta')
      }
      req.body.nombre = sanitize(nombre)
      req.body.apellido = sanitize(apellido)
      next()
    },

    // ── validatePassword ────────────────────────────────
    validatePassword: (req, res, next) => {
      const { password_nueva, password_confirmar } = req.body
      if (!password_nueva || password_nueva.length < 8 || password_nueva.length > 128) {
        req.flash('error', 'La contraseña debe tener entre 8 y 128 caracteres')
        return res.redirect('/cuenta/password/nueva')
      }
      // Require at least: 1 uppercase, 1 lowercase, 1 number, 1 special char
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{}|;:'",.<>?/`~]).{8,}$/
      if (!passwordRegex.test(password_nueva)) {
        req.flash('error', 'La contraseña debe incluir mayúscula, minúscula, número y carácter especial')
        return res.redirect('/cuenta/password/nueva')
      }
      if (password_nueva !== password_confirmar) {
        req.flash('error', 'Las contraseñas no coinciden')
        return res.redirect('/cuenta/password/nueva')
      }
      next()
    },

    // ── validateId ──────────────────────────────────────
    // Ensures :id param is a valid integer (prevents path traversal / injection)
    validateId: (paramName = 'id') => {
      return (req, res, next) => {
        const id = parseInt(req.params[paramName])
        if (isNaN(id) || id <= 0) {
          req.flash('error', 'ID inválido')
          return res.redirect(req.get('Referrer') || '/')
        }
        req.params[paramName] = id
        next()
      }
    }
  
  }
  
  module.exports = validationMiddleware