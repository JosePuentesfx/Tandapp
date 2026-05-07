const pool = require('../config/db')
const ExcelJS = require('exceljs')
const { execFile } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')

// ── Helpers ───────────────────────────────────────────────────────────────────
async function cargarDatosTanda(tandaId, organizador_id) {
  const { rows: tandaRows } = await pool.query(
    `SELECT * FROM tandas WHERE id = $1 AND organizador_id = $2`,
    [tandaId, organizador_id]
  )
  if (!tandaRows.length) return null
  const tanda = tandaRows[0]

  const [
    { rows: miembros },
    { rows: rondas },
    { rows: pagos },
    { rows: summaryRows }
  ] = await Promise.all([
    pool.query(`SELECT * FROM miembros WHERE tanda_id = $1 ORDER BY numero_turno ASC NULLS LAST`, [tandaId]),
    pool.query(`SELECT * FROM rondas    WHERE tanda_id = $1 ORDER BY numero_ronda ASC`, [tandaId]),
    pool.query(`SELECT * FROM pagos     WHERE tanda_id = $1`, [tandaId]),
    pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE estado='pagado')    AS pagados,
        COUNT(*) FILTER (WHERE estado='pendiente') AS pendientes,
        COUNT(*) FILTER (WHERE estado='faltante')  AS faltantes,
        COALESCE(SUM(monto) FILTER (WHERE estado='pagado'),0) AS total_cobrado,
        COUNT(*) AS total_pagos
       FROM pagos WHERE tanda_id = $1`, [tandaId]
    )
  ])

  const pagosMap = {}
  pagos.forEach(p => {
    if (!pagosMap[p.miembro_id]) pagosMap[p.miembro_id] = {}
    pagosMap[p.miembro_id][p.ronda_id] = p
  })

  return { tanda, miembros, rondas, pagos, pagosMap, summary: summaryRows[0] }
}

// ── Colores compartidos ───────────────────────────────────────────────────────
const C = {
  VERDE:        '1A7A4A',
  VERDE_CLARO:  'D1FAE5',
  GRIS_HEADER:  'F3F4F6',
  ROJO_CLARO:   'FEE2E2',
  AMBAR_CLARO:  'FEF9C3',
  BLANCO:       'FFFFFF',
  GRIS_TEXTO:   '9CA3AF',
}
const fill   = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + hex } })
const bold   = (size=10, hex='111827') => ({ name: 'Arial', bold: true,  size, color: { argb: 'FF'+hex } })
const normal = (size=10, hex='374151') => ({ name: 'Arial', bold: false, size, color: { argb: 'FF'+hex } })
const center = { horizontal: 'center', vertical: 'middle', wrapText: true }
const left   = { horizontal: 'left',   vertical: 'middle' }
const thin   = { style: 'hair', color: { argb: 'FFDDDDDD' } }

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER EXCEL COMPLETO
// ─────────────────────────────────────────────────────────────────────────────
function buildExcelCompleto(wb, { tanda, miembros, rondas, pagos, pagosMap, summary }) {
  // ── Hoja 1: Resumen ──────────────────────────────────────────────────────
  const h1 = wb.addWorksheet('Resumen General')
  h1.views = [{ showGridLines: false }]

  h1.mergeCells('A1:E1')
  Object.assign(h1.getCell('A1'), {
    value: `Reporte de Tanda — ${tanda.nombre}`,
    font: bold(15, C.BLANCO), fill: fill(C.VERDE), alignment: center
  })
  h1.getRow(1).height = 38

  h1.mergeCells('A2:E2')
  Object.assign(h1.getCell('A2'), {
    value: `Generado el ${new Date().toLocaleDateString('es-MX', { weekday:'long',year:'numeric',month:'long',day:'numeric' })}`,
    font: normal(9, C.GRIS_TEXTO), fill: fill(C.VERDE_CLARO), alignment: center
  })
  h1.getRow(2).height = 20
  h1.addRow([])

  const infoData = [
    ['Nombre',            tanda.nombre],
    ['Descripción',       tanda.descripcion || '—'],
    ['Monto aportación',  `$${Number(tanda.monto_aportacion).toLocaleString('es-MX')} MXN`],
    ['Frecuencia',        tanda.frecuencia.charAt(0).toUpperCase() + tanda.frecuencia.slice(1)],
    ['Total miembros',    tanda.total_miembros],
    ['Total/turno',       `$${Number(tanda.monto_aportacion * tanda.total_miembros).toLocaleString('es-MX')} MXN`],
    ['Fecha inicio',      new Date(tanda.fecha_inicio).toLocaleDateString('es-MX')],
    ['Estado',            tanda.estado.charAt(0).toUpperCase() + tanda.estado.slice(1)],
    ['Rondas generadas',  rondas.length],
  ]
  const hRow = h1.addRow(['Campo', 'Valor'])
  hRow.eachCell(c => { c.font = bold(10,C.BLANCO); c.fill = fill(C.VERDE); c.alignment = center })
  hRow.height = 22

  infoData.forEach(([k,v], i) => {
    const r = h1.addRow([k, v])
    const bg = i%2===0 ? C.BLANCO : C.GRIS_HEADER
    r.getCell(1).font = bold(10); r.getCell(2).font = normal(10)
    r.eachCell(c => { c.fill = fill(bg); c.alignment = left; c.border = { bottom: thin } })
    r.getCell(2).alignment = { horizontal:'right', vertical:'middle' }
    r.height = 20
  })

  h1.addRow([])
  const statTitle = h1.addRow(['Estadísticas de Pagos'])
  h1.mergeCells(`A${statTitle.number}:E${statTitle.number}`)
  statTitle.getCell(1).font = bold(12, C.VERDE); statTitle.height = 24

  const pagados    = Number(summary.pagados)
  const pendientes = Number(summary.pendientes)
  const faltantes  = Number(summary.faltantes)
  const totalPagos = Math.max(pagados+pendientes+faltantes, 1)
  const totalCobrado = Number(summary.total_cobrado)
  const totalEsp = Number(tanda.monto_aportacion) * miembros.length * rondas.length

  const statsRows = [
    ['Pagos completados', pagados,   `${Math.round(pagados/totalPagos*100)}%`,   C.VERDE_CLARO],
    ['Pagos pendientes',  pendientes,`${Math.round(pendientes/totalPagos*100)}%`, C.AMBAR_CLARO],
    ['Pagos faltantes',   faltantes, `${Math.round(faltantes/totalPagos*100)}%`,  C.ROJO_CLARO],
    ['Total recaudado',   `$${totalCobrado.toLocaleString('es-MX')} MXN`, '', 'EFF6FF'],
    ['Total esperado',    `$${totalEsp.toLocaleString('es-MX')} MXN`,    '', C.GRIS_HEADER],
  ]
  statsRows.forEach(([label,val,pct,bg]) => {
    const r = h1.addRow([label, val, pct])
    r.eachCell(c => { c.fill = fill(bg); c.font = normal(10); c.alignment = left; c.border = { bottom: thin } })
    r.getCell(1).font = bold(10); r.height = 20
  })
  h1.columns = [{width:28},{width:28},{width:14},{width:14},{width:14}]

  // ── Hoja 2: Miembros ─────────────────────────────────────────────────────
  const h2 = wb.addWorksheet('Miembros')
  h2.views = [{ showGridLines: false }]
  h2.mergeCells('A1:F1')
  Object.assign(h2.getCell('A1'), {
    value: `Miembros — ${tanda.nombre}`, font: bold(13,C.BLANCO),
    fill: fill(C.VERDE), alignment: center
  })
  h2.getRow(1).height = 34
  h2.addRow([])

  const mhRow = h2.addRow(['#','Turno','Nombre','Teléfono','Notas','Registro'])
  mhRow.eachCell(c => { c.font=bold(10,C.BLANCO); c.fill=fill(C.VERDE); c.alignment=center })
  mhRow.height = 22

  miembros.forEach((m,i) => {
    const r = h2.addRow([i+1, m.numero_turno||'—', m.nombre, m.telefono||'—', m.notas||'—',
                          new Date(m.created_at).toLocaleDateString('es-MX')])
    const bg = i%2===0 ? C.BLANCO : C.GRIS_HEADER
    r.eachCell(c => { c.fill=fill(bg); c.font=normal(10); c.alignment=left; c.border={bottom:thin} })
    r.getCell(1).alignment = center; r.getCell(2).alignment = center; r.height = 20
  })
  h2.addRow([])
  const tmRow = h2.addRow([`Total: ${miembros.length} miembros`])
  h2.mergeCells(`A${tmRow.number}:F${tmRow.number}`)
  tmRow.getCell(1).font = bold(10,C.VERDE); tmRow.getCell(1).fill = fill(C.VERDE_CLARO)
  h2.columns = [{width:6},{width:10},{width:28},{width:18},{width:30},{width:18}]

  // ── Hoja 3: Seguimiento de pagos ─────────────────────────────────────────
  buildHojaSeguimiento(wb, tanda, miembros, rondas, pagosMap, pagos)

  // ── Hoja 4: Calendario ───────────────────────────────────────────────────
  buildHojaCalendario(wb, tanda, miembros, rondas)
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER EXCEL SOLO CALENDARIO
// ─────────────────────────────────────────────────────────────────────────────
function buildExcelCalendario(wb, { tanda, miembros, rondas }) {
  buildHojaCalendario(wb, tanda, miembros, rondas)
}

// ── Hoja compartida: Seguimiento ─────────────────────────────────────────────
function buildHojaSeguimiento(wb, tanda, miembros, rondas, pagosMap, pagos) {
  const h3 = wb.addWorksheet('Seguimiento de Pagos')
  h3.views = [{ state:'frozen', xSplit:2, ySplit:3, showGridLines:false }]

  const totalCols = rondas.length + 5
  const lastCol = String.fromCharCode(64 + Math.min(totalCols, 26))
  h3.mergeCells(`A1:${lastCol}1`)
  Object.assign(h3.getCell('A1'), {
    value: `Seguimiento de Pagos — ${tanda.nombre}`,
    font: bold(13,C.BLANCO), fill: fill(C.VERDE), alignment: center
  })
  h3.getRow(1).height = 34
  h3.addRow([])

  const headers = ['Miembro','Teléfono', ...rondas.map(r=>`Ronda ${r.numero_ronda}\n${new Date(r.fecha_pago).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}`), 'Pagados','Pendientes','Faltantes']
  const hRow = h3.addRow(headers)
  hRow.eachCell(c => { c.font=bold(9,C.BLANCO); c.fill=fill(C.VERDE); c.alignment=center; c.border={bottom:{style:'medium',color:{argb:'FF'+C.VERDE}}} })
  hRow.height = 30

  miembros.forEach((miembro, ri) => {
    const celdas = [miembro.nombre, miembro.telefono||'—']
    let pCount=0, penCount=0, fCount=0

    rondas.forEach(ronda => {
      const esReceptor = ronda.miembro_id === miembro.id
      if (esReceptor) {
        celdas.push('👑 RECIBE')
      } else {
        const p = pagosMap[miembro.id]?.[ronda.id]
        if (!p)                       { celdas.push('—') }
        else if (p.estado==='pagado')   { celdas.push('✓ Pagado');   pCount++ }
        else if (p.estado==='faltante') { celdas.push('✗ Faltante'); fCount++ }
        else                            { celdas.push('⏳ Pendiente'); penCount++ }
      }
    })
    celdas.push(pCount, penCount, fCount)

    const row = h3.addRow(celdas)
    const bgBase = ri%2===0 ? C.BLANCO : C.GRIS_HEADER

    row.eachCell((cell, ci) => {
      const v = cell.value?.toString() || ''
      let bg = bgBase
      if (v.includes('Pagado'))   bg = C.VERDE_CLARO
      if (v.includes('Faltante')) bg = C.ROJO_CLARO
      if (v.includes('Pendiente')) bg = C.AMBAR_CLARO
      if (v.includes('RECIBE'))   bg = 'FFF7ED'
      cell.fill = fill(bg); cell.alignment = ci<=2 ? left : center
      cell.font = normal(9); cell.border = { bottom:thin, right:thin }
    })
    row.getCell(1).font = bold(9); row.height = 20
  })

  // Fila totales
  h3.addRow([])
  const totales = ['TOTALES POR RONDA', '']
  rondas.forEach(ronda => {
    const pagadosRonda = pagos.filter(p=>p.ronda_id===ronda.id && p.estado==='pagado').length
    const debenPagar   = miembros.filter(m=>m.id!==ronda.miembro_id).length
    totales.push(`${pagadosRonda}/${debenPagar}`)
  })
  totales.push('','','')
  const totRow = h3.addRow(totales)
  totRow.eachCell(c => { c.font=bold(9,C.VERDE); c.fill=fill(C.VERDE_CLARO); c.alignment=center; c.border={top:{style:'medium',color:{argb:'FF'+C.VERDE}}} })
  totRow.getCell(1).alignment = left; totRow.height = 20

  h3.getColumn(1).width = 26; h3.getColumn(2).width = 16
  rondas.forEach((_,i) => { h3.getColumn(i+3).width = 14 })
  h3.getColumn(rondas.length+3).width = 11
  h3.getColumn(rondas.length+4).width = 12
  h3.getColumn(rondas.length+5).width = 11
}

// ── Hoja compartida: Calendario ──────────────────────────────────────────────
function buildHojaCalendario(wb, tanda, miembros, rondas) {
  const h4 = wb.addWorksheet('Calendario de Rondas')
  h4.views = [{ showGridLines: false }]
  h4.mergeCells('A1:F1')
  Object.assign(h4.getCell('A1'), {
    value: `Calendario de Rondas — ${tanda.nombre}`,
    font: bold(13,C.BLANCO), fill: fill(C.VERDE), alignment: center
  })
  h4.getRow(1).height = 34
  h4.addRow([])

  const chRow = h4.addRow(['# Ronda','Fecha de Pago','Día','Quien Recibe','Teléfono','Estado'])
  chRow.eachCell(c => { c.font=bold(10,C.BLANCO); c.fill=fill(C.VERDE); c.alignment=center })
  chRow.height = 22

  const hoy = new Date()
  rondas.forEach((ronda, i) => {
    const receptor = miembros.find(m => m.id === ronda.miembro_id)
    const fecha = new Date(ronda.fecha_pago)
    const completada = ronda.estado === 'completada'
    const vencida = !completada && fecha < hoy
    const estadoTxt = completada ? '✓ Completada' : vencida ? '⚠ Vencida' : '⏳ Pendiente'
    const estadoBg  = completada ? C.VERDE_CLARO : vencida ? C.ROJO_CLARO : C.AMBAR_CLARO

    const r = h4.addRow([
      ronda.numero_ronda,
      fecha.toLocaleDateString('es-MX', {year:'numeric',month:'long',day:'numeric'}),
      fecha.toLocaleDateString('es-MX', {weekday:'long'}),
      receptor ? receptor.nombre : '—',
      receptor?.telefono || '—',
      estadoTxt
    ])
    const bg = i%2===0 ? C.BLANCO : C.GRIS_HEADER
    r.eachCell((c,ci) => {
      c.fill = fill(ci===6 ? estadoBg : bg)
      c.alignment = ci===1 ? center : left
      c.font = normal(10); c.border = { bottom: thin }
    })
    r.height = 20
  })
  h4.columns = [{width:10},{width:30},{width:16},{width:26},{width:18},{width:16}]
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTROLADOR
// ─────────────────────────────────────────────────────────────────────────────
const reporteController = {

  // ── GET /reportes ──────────────────────────────────────────────────────────
  getReportes: async (req, res) => {
    try {
      const { rows: tandas } = await pool.query(
        `SELECT t.*, COUNT(m.id) AS miembros_actuales
         FROM tandas t LEFT JOIN miembros m ON m.tanda_id = t.id
         WHERE t.organizador_id = $1 GROUP BY t.id ORDER BY t.created_at DESC`,
        [req.session.user.id]
      )
      const tandasConResumen = await Promise.all(
        tandas.map(async (tanda) => {
          const { rows } = await pool.query(
            `SELECT
              COUNT(*) FILTER (WHERE estado='pagado')    AS pagados,
              COUNT(*) FILTER (WHERE estado='pendiente') AS pendientes,
              COUNT(*) FILTER (WHERE estado='faltante')  AS faltantes,
              COALESCE(SUM(monto) FILTER (WHERE estado='pagado'),0) AS total_cobrado
             FROM pagos WHERE tanda_id = $1`, [tanda.id]
          )
          return { ...tanda, summary: rows[0] }
        })
      )
      res.render('reportes/index', {
        pageTitle: 'Reportes', currentPage: 'reportes',
        user: req.session.user, tandas: tandasConResumen
      })
    } catch (err) {
      console.error(err)
      req.flash('error', 'Error al cargar los reportes')
      res.redirect('/dashboard')
    }
  },

  // ── GET /reportes/:id/excel?tipo=completo|calendario ──────────────────────
  descargarExcel: async (req, res) => {
    try {
      const tiposValidos = ['completo', 'calendario']
      const tipo = tiposValidos.includes(req.query.tipo) ? req.query.tipo : 'completo'
      const datos = await cargarDatosTanda(req.params.id, req.session.user.id)
      if (!datos) { req.flash('error','Tanda no encontrada'); return res.redirect('/reportes') }

      const wb = new ExcelJS.Workbook()
      wb.creator = 'TandaApp'; wb.created = new Date()

      if (tipo === 'calendario') {
        buildExcelCalendario(wb, datos)
      } else {
        buildExcelCompleto(wb, datos)
      }

      const tipoLabel = tipo === 'calendario' ? 'Calendario' : 'Completo'
      const nombre = `TandaApp_${datos.tanda.nombre.replace(/[^a-zA-Z0-9]/g,'_')}_${tipoLabel}_${new Date().toISOString().slice(0,10)}.xlsx`

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`)
      await wb.xlsx.write(res)
      res.end()
    } catch (err) {
      console.error('Error Excel:', err)
      req.flash('error','Error al generar el Excel')
      res.redirect('/reportes')
    }
  },

  // ── GET /reportes/:id/pdf?tipo=completo|calendario ────────────────────────
  descargarPDF: async (req, res) => {
    try {
      const tiposValidos = ['completo', 'calendario']
      const tipo = tiposValidos.includes(req.query.tipo) ? req.query.tipo : 'completo'
      const datos = await cargarDatosTanda(req.params.id, req.session.user.id)
      if (!datos) { req.flash('error','Tanda no encontrada'); return res.redirect('/reportes') }

      // Serializar datos a archivo temporal para pasarlos al script Python
      const tmpJson = path.join(os.tmpdir(), `tandaapp_${Date.now()}.json`)
      const tmpPdf  = path.join(os.tmpdir(), `tandaapp_${Date.now()}.pdf`)

      // Convertir IDs a strings para que el pagosMap funcione en Python
      const pagosMapStr = {}
      Object.entries(datos.pagosMap).forEach(([mid, rondaMap]) => {
        pagosMapStr[String(mid)] = {}
        Object.entries(rondaMap).forEach(([rid, pago]) => {
          pagosMapStr[String(mid)][String(rid)] = pago
        })
      })

      const payload = {
        tanda:    datos.tanda,
        miembros: datos.miembros,
        rondas:   datos.rondas,
        pagosMap: pagosMapStr,
        summary:  datos.summary
      }
      fs.writeFileSync(tmpJson, JSON.stringify(payload, null, 2))

      // Ruta al script Python — está en scripts/generar_pdf.py dentro del proyecto
      const scriptPath = path.join(__dirname, '..', 'scripts', 'generar_pdf.py')

      // En Windows el ejecutable es 'python', en Linux/Mac es 'python3'
      const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'

      execFile(pythonCmd, [scriptPath, tmpJson, tmpPdf, tipo], (err, stdout, stderr) => {
        // Limpiar JSON temporal
        try { fs.unlinkSync(tmpJson) } catch {}

        if (err) {
          console.error('Error Python PDF:', stderr || err.message)
          try { fs.unlinkSync(tmpPdf) } catch {}
          let msg = 'Error al generar el PDF'
          if (err.code === 'ENOENT') {
            msg = 'Python no encontrado. Instálalo desde python.org y agrégalo al PATH'
          } else if (stderr && stderr.includes('reportlab')) {
            msg = 'Falta reportlab: ejecuta "pip install reportlab" en tu terminal'
          }
          req.flash('error', msg)
          return res.redirect('/reportes')
        }

        const tipoLabel = tipo === 'calendario' ? 'Calendario' : 'Completo'
        const nombre = `TandaApp_${datos.tanda.nombre.replace(/[^a-zA-Z0-9]/g,'_')}_${tipoLabel}_${new Date().toISOString().slice(0,10)}.pdf`

        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`)

        const stream = fs.createReadStream(tmpPdf)
        stream.pipe(res)
        stream.on('end', () => { try { fs.unlinkSync(tmpPdf) } catch {} })
        stream.on('error', () => { try { fs.unlinkSync(tmpPdf) } catch {} })
      })
    } catch (err) {
      console.error('Error PDF:', err)
      req.flash('error','Error al generar el PDF')
      res.redirect('/reportes')
    }
  }
}

module.exports = reporteController