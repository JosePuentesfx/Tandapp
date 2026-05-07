const Notificacion = require('../models/Notificacion')
const pool = require('../config/db')

// Middleware that loads notifications into res.locals for every authenticated request
const loadNotificaciones = async (req, res, next) => {
  try {
    if (req.session && req.session.user) {
      let notificaciones = await Notificacion.getByUsuario(req.session.user.id)
      let unreadCount = await Notificacion.countUnread(req.session.user.id)
      
      const smartNotifs = []

      // Solo mostramos smart notifications si el usuario es organizador
      if (req.session.user.rol === 'organizador' || req.session.user.rol === 'admin') {
        const isSmartLeidas = req.cookies.smartLeidas === 'true'

        // Pagos pendientes
        const resPagos = await pool.query(`
          SELECT COUNT(p.id) FROM pagos p
          JOIN tandas t ON t.id = p.tanda_id
          WHERE t.organizador_id = $1 AND p.estado = 'pendiente'
        `, [req.session.user.id])
        const pendientes = parseInt(resPagos.rows[0].count)
        if (pendientes > 0) {
          smartNotifs.push({
            id: 's_pagos', tipo: 'recordatorio',
            titulo: 'Pagos por registrar',
            mensaje: `Hay ${pendientes} pago(s) pendiente(s) en tus tandas.`,
            leida: isSmartLeidas, 
            created_at: new Date().toISOString()
          })
        }
        
        // Pagos faltantes
        const resFaltantes = await pool.query(`
          SELECT COUNT(p.id) FROM pagos p
          JOIN tandas t ON t.id = p.tanda_id
          WHERE t.organizador_id = $1 AND p.estado = 'faltante'
        `, [req.session.user.id])
        const faltantes = parseInt(resFaltantes.rows[0].count)
        if (faltantes > 0) {
          smartNotifs.push({
            id: 's_faltantes', tipo: 'alerta',
            titulo: 'Pagos Atrasados',
            mensaje: `Atención: tienes ${faltantes} pago(s) reportado(s) como faltantes.`,
            leida: isSmartLeidas,
            created_at: new Date().toISOString()
          })
        }

        // Tandas activas
        const resTandas = await pool.query(`
          SELECT COUNT(*) FROM tandas WHERE organizador_id = $1 AND estado = 'activa'
        `, [req.session.user.id])
        const activas = parseInt(resTandas.rows[0].count)
        if (activas > 0) {
          smartNotifs.push({
            id: 's_tandas', tipo: 'tanda',
            titulo: 'Tandas Activas',
            mensaje: `Tienes ${activas} tanda(s) en curso.`,
            leida: isSmartLeidas,
            created_at: new Date().toISOString()
          })
        }
      }

      notificaciones = [...smartNotifs, ...notificaciones]
      
      // Sort combined array by created_at DESC (newest to oldest)
      notificaciones.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const smartUnread = smartNotifs.filter(n => !n.leida).length
      unreadCount += smartUnread

      res.locals.notificaciones = notificaciones
      res.locals.unreadCount = unreadCount
    } else {
      res.locals.notificaciones = []
      res.locals.unreadCount = 0
    }
  } catch (err) {
    console.error('Error loading notificaciones:', err)
    res.locals.notificaciones = []
    res.locals.unreadCount = 0
  }
  next()
}

module.exports = loadNotificaciones
