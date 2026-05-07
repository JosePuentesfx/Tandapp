const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;
app.set('trust proxy', 1);
require('dotenv').config()

// Database connection
require('./config/db')

// Cron jobs
const startCronJobs = require('./scripts/cron_emails')
startCronJobs()

// ── Security headers ─────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
    }
  },
  crossOriginEmbedderPolicy: false
}))

// Body parser
app.use(express.urlencoded({ extended: true }))
app.use(express.json())

// Cookie parser — required for CSRF double-submit cookie
app.use(cookieParser(process.env.SESSION_SECRET))

// Static files
app.use(express.static('public'))

// View engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'))

// ── Rate Limiters ────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production'

// General rate limiter (100 requests per 15 min per IP)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas solicitudes, intenta de nuevo más tarde.',
  standardHeaders: true,
  legacyHeaders: false
})

// Auth rate limiter (10 attempts per 15 min per IP — brute force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos, intenta de nuevo en 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false
})

// Verification code rate limiter (5 attempts per 10 min — protects 6-digit codes)
const codeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: 'Demasiados intentos de verificación. Espera 10 minutos.',
  standardHeaders: true,
  legacyHeaders: false
})

// Email sending rate limiter (3 emails per 15 min — prevents spam)
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: 'Has solicitado demasiados correos. Intenta en 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false
})

// Apply general rate limiter to all routes
app.use(generalLimiter)

// Session — must be before routes
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  }
}))

// Flash — must be after session
app.use(flash())

// ── CSRF Protection (double-submit cookie) ───────────
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.SESSION_SECRET,
  cookieName: '__csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction
  },
  getCsrfTokenFromRequest: (req) => req.body._csrf || req.headers['x-csrf-token'],
  getSessionIdentifier: (req) => req.sessionID || (req.session ? req.session.id : 'unknown')
})

// Make flash + user + CSRF token available in ALL views
app.use((req, res, next) => {
  res.locals.success = req.flash('success')
  res.locals.error = req.flash('error')
  res.locals.user = req.session.user || null
  next()
})
// Prevent back button after logout
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// Load notifications for every request
const loadNotificaciones = require('./middlewares/notificacionesMiddleware')
app.use(loadNotificaciones)

// Apply CSRF protection to all remaining routes
app.use(doubleCsrfProtection)

// Generate CSRF token for views
app.use((req, res, next) => {
  res.locals.csrfToken = generateCsrfToken(req, res)
  next()
})

// Mark all notifications as read (now protected by CSRF)
const Notificacion = require('./models/Notificacion')
app.post('/notificaciones/marcar-leidas', async (req, res) => {
  try {
    if (req.session.user) {
      await Notificacion.markAllAsRead(req.session.user.id)
      req.session.smartLeidas = true
      // Set a persistent cookie for 30 days
      res.cookie('smartLeidas', 'true', { maxAge: 1000 * 60 * 60 * 24 * 30, httpOnly: true, sameSite: 'lax' })
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false })
  }
})

// Routes
const router = require('./routes/router');
app.use('/', router);
app.use('/admin', require('./routes/admin'))
app.use('/tandas', require('./routes/Tandas'))
app.use('/dashboard', require('./routes/dashboard'))
app.use('/pagos', require('./routes/Pagos'))
app.use('/reportes', require('./routes/reportes'))
app.use('/cuenta', require('./routes/cuenta'))

// CSRF error handler
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN' || err.message?.includes('csrf')) {
    req.flash('error', 'Token de seguridad inválido. Intenta de nuevo.')
    return res.redirect(req.get('Referrer') || '/')
  }
  next(err)
})

// Generic error handler (prevents stack trace leaks)
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  res.status(500).render('error', {
    pageTitle: 'Error',
    message: 'Algo salió mal. Intenta de nuevo más tarde.'
  })
})

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    pageTitle: 'No encontrado',
    message: 'La página que buscas no existe.'
  })
})

// Export rate limiters for use in routes
app.locals.authLimiter = authLimiter
app.locals.codeLimiter = codeLimiter
app.locals.emailLimiter = emailLimiter

app.listen(port, () => {
    console.log(`Server is Running on http://localhost:${port}`);
});