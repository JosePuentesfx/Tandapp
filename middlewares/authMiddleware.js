const authMiddleware = {

    // ── isLoggedIn ───────────────────────────────────────
    // Protects any route that requires login
    // Usage: router.get('/dashboard', isLoggedIn, controller)
    isLoggedIn: (req, res, next) => {
      if (req.session.user) return next()
      req.flash('error', 'Debes iniciar sesión para continuar')
      res.redirect('/login')
    },
  
    // ── isAdmin ──────────────────────────────────────────
    // Protects routes only admins can access
    // Usage: router.get('/admin/usuarios', isLoggedIn, isAdmin, controller)
    isAdmin: (req, res, next) => {
      if (req.session.user && req.session.user.rol === 'admin') return next()
      req.flash('error', 'No tienes permiso para acceder a esta página')
      res.redirect('/dashboard')
    },
  
    // ── isGuest ──────────────────────────────────────────
    // Prevents logged in users from seeing login/register
    // Usage: router.get('/login', isGuest, controller)
    isGuest: (req, res, next) => {
      if (!req.session.user) return next()
      res.redirect('/dashboard')
    }
  
  }
  
  module.exports = authMiddleware