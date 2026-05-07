const Tanda = require('../models/Tanda')
const Miembro = require('../models/Miembro')
const Pago = require('../models/Pago')
const Ronda = require('../models/Ronda')
const pool = require('../config/db')
const Notificacion = require('../models/Notificacion')

const tandaController = {

  // ── GET /tandas ──────────────────────────────────────
  // List all tandas for the organizer
  getTandas: async (req, res) => {
    try {
      const tandas = await Tanda.getByOrganizador(req.session.user.id)
      res.render('tandas/index', {
        pageTitle: 'Mis Tandas',
        currentPage: 'tandas',
        user: req.session.user,
        tandas
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar las tandas')
      res.redirect('/dashboard')
    }
  },

  // ── GET /tandas/nueva ────────────────────────────────
  // Show create tanda form
  getNueva: (req, res) => {
    res.render('tandas/nueva', {
      pageTitle: 'Nueva Tanda',
      currentPage: 'tandas',
      user: req.session.user
    })
  },

  // ── POST /tandas/nueva ───────────────────────────────
  // Create a new tanda
  postNueva: async (req, res) => {
    try {
      const { nombre, descripcion, monto_aportacion, frecuencia, total_miembros, fecha_inicio } = req.body

      // Basic validation
      if (!nombre || !monto_aportacion || !frecuencia || !total_miembros || !fecha_inicio) {
        req.flash('error', 'Por favor llena todos los campos requeridos')
        return res.redirect('/tandas/nueva')
      }

      const tanda = await Tanda.create(
        nombre, descripcion, monto_aportacion,
        frecuencia, total_miembros, fecha_inicio,
        req.session.user.id
      )

      req.flash('success', `Tanda "${nombre}" creada exitosamente`)
      res.redirect(`/tandas/${tanda.id}/miembros`)

    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al crear la tanda')
      res.redirect('/tandas/nueva')
    }
  },

  // ── GET /tandas/:id ──────────────────────────────────
  // Tanda detail — shows members + payment tracking table
  getDetalle: async (req, res) => {
    try {
      const { id } = req.params

      const [tanda, miembros, rondas, pagos] = await Promise.all([
        Tanda.findById(id),
        Miembro.getByTanda(id),
        Ronda.getByTanda(id),
        Pago.getByTanda(id)
      ])

      // If tanda not found or doesn't belong to this organizer
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      // Payment summary for the donut chart
      const summary = await Pago.getSummaryByTanda(id)

      res.render('tandas/detalle', {
        pageTitle: tanda.nombre,
        currentPage: 'tandas',
        user: req.session.user,
        tanda,
        miembros,
        rondas,
        pagos,
        summary
      })

    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar la tanda')
      res.redirect('/tandas')
    }
  },

  // ── GET /tandas/:id/editar ───────────────────────────
  getEditar: async (req, res) => {
    try {
      const tanda = await Tanda.findById(req.params.id)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }
      res.render('tandas/editar', {
        pageTitle: 'Editar Tanda',
        currentPage: 'tandas',
        user: req.session.user,
        tanda
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar la tanda')
      res.redirect('/tandas')
    }
  },

  // ── POST /tandas/:id/editar ──────────────────────────
  postEditar: async (req, res) => {
    try {
      const tanda = await Tanda.findById(req.params.id)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      const { nombre, descripcion } = req.body
      if (!nombre || nombre.trim() === '' || nombre.trim().length > 100) {
        req.flash('error', 'El nombre es requerido (máximo 100 caracteres)')
        return res.redirect(`/tandas/${req.params.id}`)
      }

      await pool.query(
        'UPDATE tandas SET nombre = $1, descripcion = $2 WHERE id = $3',
        [nombre.trim(), descripcion?.trim() || null, req.params.id]
      )
      req.flash('success', 'Tanda actualizada')
      res.redirect(`/tandas/${req.params.id}`)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar la tanda')
      res.redirect(`/tandas/${req.params.id}`)
    }
  },

  // ── POST /tandas/:id/estado ──────────────────────────
  // Change tanda status (activa / pausada / finalizada)
  updateEstado: async (req, res) => {
    try {
      const { estado } = req.body

      // Validate estado is a valid value (whitelist)
      const estadosValidos = ['activa', 'pausada', 'finalizada']
      if (!estadosValidos.includes(estado)) {
        req.flash('error', 'Estado inválido')
        return res.redirect(`/tandas/${req.params.id}`)
      }

      // IDOR protection
      const tanda = await Tanda.findById(req.params.id)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      await Tanda.updateEstado(req.params.id, estado)

      // Notify on meaningful status changes
      if (estado === 'finalizada') {
        await Notificacion.create(
          req.session.user.id,
          'tanda',
          'Tanda completada',
          `La tanda "${tanda.nombre}" ha sido marcada como finalizada. ¡Felicidades!`,
          tanda.id
        )
      } else if (estado === 'pausada') {
        await Notificacion.create(
          req.session.user.id,
          'recordatorio',
          'Tanda pausada',
          `La tanda "${tanda.nombre}" ha sido pausada.`,
          tanda.id
        )
      }

      req.flash('success', 'Estado de la tanda actualizado')
      res.redirect(`/tandas/${req.params.id}`)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar el estado')
      res.redirect(`/tandas/${req.params.id}`)
    }
  },

  // ── POST /tandas/:id/delete ──────────────────────────
  deleteTanda: async (req, res) => {
    try {
      const tanda = await Tanda.findById(req.params.id)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      // Create notification before deleting (so we still have tanda info)
      await Notificacion.create(
        req.session.user.id,
        'alerta',
        'Tanda eliminada',
        `La tanda "${tanda.nombre}" con ${tanda.total_miembros} miembros ha sido eliminada permanentemente.`,
        null  // tanda_id will no longer exist
      )

      await Tanda.delete(req.params.id)
      req.flash('success', `Tanda "${tanda.nombre}" eliminada`)
      res.redirect('/tandas')
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al eliminar la tanda')
      res.redirect('/tandas')
    }
  },
  // ── GET /tandas/:id/miembros ─────────────────────────
 
// Step 2 — Show members page
getMiembros: async (req, res) => {
  try {
    const tanda = await Tanda.findById(req.params.id)
    if (!tanda || tanda.organizador_id !== req.session.user.id) {
      req.flash('error', 'Tanda no encontrada')
      return res.redirect('/tandas')
    }
    const miembros = await Miembro.getByTanda(req.params.id)
    const rondas = await Ronda.getByTanda(req.params.id)  // ← add this
    res.render('tandas/miembros', {
      pageTitle: 'Agregar Miembros',
      currentPage: 'tandas',
      user: req.session.user,
      tanda,
      miembros,
      rondas   // ← pass this
    })
  } catch (err) {
    console.error(err)
    req.flash('error', 'Error al cargar la página')
    res.redirect('/tandas')
  }
},
 
// ── GET /tandas/:id/turnos ───────────────────────────
// Step 3 — Show turn assignment page
getTurnos: async (req, res) => {
  try {
    const tanda = await Tanda.findById(req.params.id)
    if (!tanda || tanda.organizador_id !== req.session.user.id) {
      req.flash('error', 'Tanda no encontrada')
      return res.redirect('/tandas')
    }
    const miembros = await Miembro.getByTanda(req.params.id)
    if (miembros.length === 0) {
      req.flash('error', 'Agrega miembros primero')
      return res.redirect(`/tandas/${req.params.id}/miembros`)
    }
    res.render('tandas/turnos', {
      pageTitle: 'Asignar Turnos',
      currentPage: 'tandas',
      user: req.session.user,
      tanda,
      miembros
    })
  } catch (err) {
    console.error(err)
    req.flash('error', 'Error al cargar la página')
    res.redirect('/tandas')
  }
},
 
// ── POST /tandas/:id/asignar-turnos ─────────────────
// Save turn assignments + generate full schedule
// REPLACE asignarTurnos in Tandacontroller.js with this:

asignarTurnos: async (req, res) => {
  try {
    const { id } = req.params
    const { turnos, modo } = req.body

    const tanda = await Tanda.findById(id)
    if (!tanda || tanda.organizador_id !== req.session.user.id) {
      req.flash('error', 'Tanda no encontrada')
      return res.redirect('/tandas')
    }

    // ── DOUBLE SUBMIT PROTECTION ──────────────────────────
    // If rondas already exist for this tanda, don't generate again
    const existingRondas = await pool.query(
      'SELECT id FROM rondas WHERE tanda_id = $1 LIMIT 1',
      [id]
    )
    if (existingRondas.rows.length > 0) {
      req.flash('error', 'El calendario ya fue generado para esta tanda')
      return res.redirect(`/tandas/${id}`)
    }

    // Get all members to map array index to member id if needed
    const miembrosResult = await pool.query(
      'SELECT * FROM miembros WHERE tanda_id = $1 ORDER BY id ASC',
      [id]
    )
    const miembros = miembrosResult.rows

    // Build a set of valid member IDs for this tanda (IDOR protection)
    const validMemberIds = new Set(miembros.map(m => m.id))

    // Validate turnos input
    if (!turnos) {
      req.flash('error', 'No se enviaron turnos')
      return res.redirect(`/tandas/${id}/turnos`)
    }

    // Handle both object {miembroId: turno} and array [turno1, turno2]
    if (Array.isArray(turnos)) {
      for (let i = 0; i < turnos.length; i++) {
        const turnoVal = parseInt(turnos[i])
        if (isNaN(turnoVal) || turnoVal < 1 || turnoVal > miembros.length) {
          req.flash('error', 'Valores de turno inválidos')
          return res.redirect(`/tandas/${id}/turnos`)
        }
        await pool.query(
          'UPDATE miembros SET numero_turno = $1 WHERE id = $2 AND tanda_id = $3',
          [turnoVal, miembros[i].id, id]
        )
      }
    } else {
      for (const [miembroId, turno] of Object.entries(turnos)) {
        const parsedId = parseInt(miembroId)
        const turnoVal = parseInt(turno)
        // Verify the member belongs to THIS tanda (prevents IDOR)
        if (!validMemberIds.has(parsedId)) {
          req.flash('error', 'Miembro no válido para esta tanda')
          return res.redirect(`/tandas/${id}/turnos`)
        }
        if (isNaN(turnoVal) || turnoVal < 1 || turnoVal > miembros.length) {
          req.flash('error', 'Valores de turno inválidos')
          return res.redirect(`/tandas/${id}/turnos`)
        }
        await pool.query(
          'UPDATE miembros SET numero_turno = $1 WHERE id = $2 AND tanda_id = $3',
          [turnoVal, parsedId, id]
        )
      }
    }

    // ── GET MEMBERS SORTED BY ASSIGNED TURN ──────────────
    // This is what determines the calendar order
    const miembrosOrdenados = await pool.query(
      'SELECT * FROM miembros WHERE tanda_id = $1 ORDER BY numero_turno ASC',
      [id]
    )

    const miembrosConMonto = miembrosOrdenados.rows.map(m => ({
      ...m,
      monto_aportacion: tanda.monto_aportacion
    }))

    // ── GENERATE RONDAS in turn order ────────────────────
    const rondas = await Ronda.generarRondas(
      id,
      tanda.fecha_inicio,
      tanda.frecuencia,
      miembrosConMonto
    )

    // ── GENERATE PAGOS for each member × ronda ───────────
    for (const ronda of rondas) {
      for (const miembro of miembrosOrdenados.rows) {
        await Pago.create(id, miembro.id, ronda.id, tanda.monto_aportacion)
      }
    }

    await Notificacion.create(
      req.session.user.id,
      'tanda',
      'Calendario generado',
      `El calendario de la tanda "${tanda.nombre}" ha sido generado con ${rondas.length} rondas.`,
      tanda.id
    )

    req.flash('success', '¡Tanda creada! El calendario ha sido generado.')
    res.redirect(`/tandas/${id}`)

  } catch (err) {
    console.error(err)
    req.flash('error', 'Error al asignar turnos')
    res.redirect(`/tandas/${req.params.id}/turnos`)
  }
},

// ── RONDAS POST /tandas/:tandaId/rondas/:id/entregada ──
  marcarRondaCompletada: async (req, res) => {
    try {
      const { tandaId, id: rondaId } = req.params;
      
      const tanda = await Tanda.findById(tandaId);
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada');
        return res.redirect('/tandas');
      }

      const ronda = await pool.query('SELECT * FROM rondas WHERE id = $1 AND tanda_id = $2', [rondaId, tandaId]);
      
      if(ronda.rows.length === 0){
        req.flash('error', 'Ronda no encontrada');
        return res.redirect(`/tandas/${tandaId}`);
      }
      
      await Ronda.marcarCompletada(rondaId);
      
      // Notificar al organizador
      await Notificacion.create(
        req.session.user.id,
        'alerta',
        'Ronda entregada',
        `Has marcado la ronda #${ronda.rows[0].numero_ronda} como entregada.`,
        tandaId
      );

      req.flash('success', 'Ronda marcada como entregada.');
      res.redirect(`/tandas/${tandaId}`);
    } catch (err) {
      console.error(err);
      req.flash('error', 'Error al marcar ronda como entregada');
      res.redirect(`/tandas/${req.params.tandaId}`);
    }
  }
 

}


module.exports = tandaController