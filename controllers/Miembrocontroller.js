const Miembro = require('../models/Miembro')
const Tanda = require('../models/Tanda')
const Pago = require('../models/Pago')
const Ronda = require('../models/Ronda')

const miembroController = {

  // ── POST /tandas/:id/miembros ────────────────────────
  // Add a member to a tanda
  addMiembro: async (req, res) => {
    try {
      const { id } = req.params
      const { nombre, telefono, notas } = req.body

      // Verify tanda belongs to this organizer
      const tanda = await Tanda.findById(id)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      // Get current member count
      const miembros = await Miembro.getByTanda(id)

      // Check if tanda is already full
      if (miembros.length >= tanda.total_miembros) {
        req.flash('error', `Esta tanda ya tiene el máximo de ${tanda.total_miembros} miembros`)
        return res.redirect(`/tandas/${id}`)
      }

      // Auto assign next available turn
      const numero_turno = await Miembro.nextTurno(id)

      await Miembro.create(id, nombre, telefono, notas, numero_turno)

      req.flash('success', `${nombre} agregado a la tanda`)
      res.redirect(`/tandas/${id}/miembros`)

    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al agregar miembro')
      res.redirect(`/tandas/${req.params.id}`)
    }
  },

  // ── POST /tandas/:tandaId/miembros/:id/editar ────────
  // Update member info
  editMiembro: async (req, res) => {
    try {
      const { tandaId, id } = req.params

      // IDOR protection: verify tanda belongs to this user
      const tanda = await Tanda.findById(tandaId)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      // Verify miembro belongs to this tanda
      const miembro = await Miembro.findById(id)
      if (!miembro || miembro.tanda_id !== tanda.id) {
        req.flash('error', 'Miembro no encontrado')
        return res.redirect(`/tandas/${tandaId}`)
      }

      const { nombre, telefono, notas } = req.body
      if (!nombre || nombre.trim() === '') {
        req.flash('error', 'El nombre es requerido')
        return res.redirect(`/tandas/${tandaId}`)
      }

      await Miembro.update(id, nombre.trim(), telefono?.trim() || null, notas?.trim() || null)
      req.flash('success', 'Miembro actualizado')
      res.redirect(`/tandas/${tandaId}`)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al actualizar miembro')
      res.redirect(`/tandas/${req.params.tandaId}`)
    }
  },

  // ── POST /tandas/:tandaId/miembros/:id/delete ────────
  // Remove a member from tanda
  deleteMiembro: async (req, res) => {
    try {
      const { tandaId, id } = req.params

      // IDOR protection: verify tanda belongs to this user
      const tanda = await Tanda.findById(tandaId)
      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      // Verify miembro belongs to this tanda
      const miembro = await Miembro.findById(id)
      if (!miembro || miembro.tanda_id !== tanda.id) {
        req.flash('error', 'Miembro no encontrado')
        return res.redirect(`/tandas/${tandaId}`)
      }

      await Miembro.delete(id)
      req.flash('success', `${miembro.nombre} eliminado de la tanda`)
      res.redirect(`/tandas/${tandaId}/miembros`)
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al eliminar miembro')
      res.redirect(`/tandas/${req.params.tandaId}`)
    }
  },

  // ── POST /tandas/:id/generar-rondas ──────────────────
  // Auto-generate payout schedule once all members are added
  generarRondas: async (req, res) => {
    try {
      const { id } = req.params
      const tanda = await Tanda.findById(id)
      const miembros = await Miembro.getByTanda(id)

      if (!tanda || tanda.organizador_id !== req.session.user.id) {
        req.flash('error', 'Tanda no encontrada')
        return res.redirect('/tandas')
      }

      if (miembros.length === 0) {
        req.flash('error', 'Agrega miembros antes de generar el calendario')
        return res.redirect(`/tandas/${id}`)
      }

      // Add monto_aportacion to each member object for Ronda.generarRondas
      const miembrosConMonto = miembros.map(m => ({
        ...m,
        monto_aportacion: tanda.monto_aportacion
      }))

      // Generate rondas
      const rondas = await Ronda.generarRondas(id, tanda.fecha_inicio, tanda.frecuencia, miembrosConMonto)

      // Generate a pago record for every member in every ronda
      for (const ronda of rondas) {
        for (const miembro of miembros) {
          await Pago.create(id, miembro.id, ronda.id, tanda.monto_aportacion)
        }
      }

      req.flash('success', `Calendario generado con ${rondas.length} rondas`)
      res.redirect(`/tandas/${id}`)

    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al generar el calendario')
      res.redirect(`/tandas/${req.params.id}`)
    }
  }

}

module.exports = miembroController