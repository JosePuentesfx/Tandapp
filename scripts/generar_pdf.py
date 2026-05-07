#!/usr/bin/env python3
"""
TandaApp — Generador de PDF
Uso: python3 generar_pdf.py <json_data_file> <output_pdf_file> <tipo>
tipo: 'completo' | 'calendario'
"""
import sys, json
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak, KeepTogether
)
from reportlab.platypus.flowables import HRFlowable

# ── Colores de marca ──────────────────────────────────────────────────────────
VERDE       = colors.HexColor('#1A7A4A')
VERDE_CLARO = colors.HexColor('#D1FAE5')
VERDE_MED   = colors.HexColor('#6EE7B7')
GRIS_HEADER = colors.HexColor('#F3F4F6')
GRIS_TEXTO  = colors.HexColor('#6B7280')
GRIS_BORDER = colors.HexColor('#E5E7EB')
ROJO        = colors.HexColor('#EF4444')
ROJO_CLARO  = colors.HexColor('#FEE2E2')
AMBAR       = colors.HexColor('#F59E0B')
AMBAR_CLARO = colors.HexColor('#FEF9C3')
NEGRO       = colors.HexColor('#111827')
BLANCO      = colors.white


def make_styles():
    base = getSampleStyleSheet()
    return {
        'titulo': ParagraphStyle('titulo', fontName='Helvetica-Bold', fontSize=18,
                                  textColor=BLANCO, alignment=TA_CENTER, spaceAfter=0),
        'subtitulo': ParagraphStyle('sub', fontName='Helvetica', fontSize=9,
                                     textColor=GRIS_TEXTO, alignment=TA_CENTER, spaceAfter=12),
        'seccion': ParagraphStyle('sec', fontName='Helvetica-Bold', fontSize=11,
                                   textColor=VERDE, spaceAfter=6, spaceBefore=14),
        'normal': ParagraphStyle('normal', fontName='Helvetica', fontSize=9,
                                  textColor=NEGRO, spaceAfter=4),
        'pequeño': ParagraphStyle('peq', fontName='Helvetica', fontSize=8,
                                   textColor=GRIS_TEXTO, spaceAfter=2),
        'celda': ParagraphStyle('celda', fontName='Helvetica', fontSize=8, textColor=NEGRO),
        'celda_bold': ParagraphStyle('celdab', fontName='Helvetica-Bold', fontSize=8, textColor=NEGRO),
    }


def estado_color(estado):
    if estado == 'pagado':   return VERDE_CLARO
    if estado == 'faltante': return ROJO_CLARO
    if estado == 'pendiente': return AMBAR_CLARO
    return BLANCO


def estado_texto(estado):
    if estado == 'pagado':    return 'Pagado'
    if estado == 'faltante':  return 'Faltante'
    if estado == 'pendiente': return 'Pendiente'
    return '—'


def header_footer(canvas, doc, tanda_nombre, tipo_label):
    canvas.saveState()
    w, h = doc.pagesize
    # Header band
    canvas.setFillColor(VERDE)
    canvas.rect(0, h - 28, w, 28, fill=1, stroke=0)
    canvas.setFont('Helvetica-Bold', 9)
    canvas.setFillColor(BLANCO)
    canvas.drawString(1*cm, h - 18, f'TandaApp  ·  {tanda_nombre}  ·  {tipo_label}')
    canvas.setFont('Helvetica', 8)
    canvas.drawRightString(w - 1*cm, h - 18, f'Pág. {doc.page}')
    # Footer
    canvas.setFillColor(GRIS_TEXTO)
    canvas.setFont('Helvetica', 7)
    canvas.drawString(1*cm, 0.5*cm, 'Generado por TandaApp')
    canvas.drawRightString(w - 1*cm, 0.5*cm, 'tandaapp.com')
    canvas.restoreState()


# ── SECCIÓN: RESUMEN GENERAL ──────────────────────────────────────────────────
def seccion_resumen(tanda, summary, rondas, styles):
    story = []
    story.append(Paragraph('Resumen de la Tanda', styles['seccion']))

    frecuencia = tanda.get('frecuencia', '').capitalize()
    monto = float(tanda.get('monto_aportacion', 0))
    total_miembros = int(tanda.get('total_miembros', 0))
    total_turno = monto * total_miembros

    info_data = [
        ['Campo', 'Valor'],
        ['Nombre', tanda.get('nombre', '—')],
        ['Descripción', tanda.get('descripcion') or '—'],
        ['Monto de aportación', f"${monto:,.2f} MXN"],
        ['Frecuencia', frecuencia],
        ['Total de miembros', str(total_miembros)],
        ['Total a recibir / turno', f"${total_turno:,.2f} MXN"],
        ['Fecha de inicio', tanda.get('fecha_inicio', '—')[:10]],
        ['Estado', tanda.get('estado', '—').capitalize()],
        ['Rondas generadas', str(len(rondas))],
    ]

    col_w = [5*cm, 9*cm]
    t = Table(info_data, colWidths=col_w)
    t.setStyle(TableStyle([
        ('BACKGROUND',  (0,0), (-1,0), VERDE),
        ('TEXTCOLOR',   (0,0), (-1,0), BLANCO),
        ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,-1), 8),
        ('FONTNAME',    (0,1), (0,-1), 'Helvetica-Bold'),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BLANCO, GRIS_HEADER]),
        ('ALIGN',       (0,0), (0,-1), 'LEFT'),
        ('ALIGN',       (1,0), (1,-1), 'RIGHT'),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID',        (0,0), (-1,-1), 0.3, GRIS_BORDER),
    ]))
    story.append(t)
    story.append(Spacer(1, 12))

    # Stats de pagos
    story.append(Paragraph('Estadísticas de Pagos', styles['seccion']))
    pagados    = int(summary.get('pagados', 0))
    pendientes = int(summary.get('pendientes', 0))
    faltantes  = int(summary.get('faltantes', 0))
    total_cobrado = float(summary.get('total_cobrado', 0))
    total_pag  = max(pagados + pendientes + faltantes, 1)
    total_esp  = monto * total_miembros * len(rondas)

    stats_data = [
        ['Concepto', 'Cantidad', 'Porcentaje'],
        ['Pagos completados', str(pagados), f'{round(pagados/total_pag*100)}%'],
        ['Pagos pendientes',  str(pendientes), f'{round(pendientes/total_pag*100)}%'],
        ['Pagos faltantes',   str(faltantes), f'{round(faltantes/total_pag*100)}%'],
        ['Total recaudado',   f'${total_cobrado:,.2f} MXN', ''],
        ['Total esperado',    f'${total_esp:,.2f} MXN', ''],
    ]

    stat_colors = [VERDE, VERDE_CLARO, AMBAR_CLARO, ROJO_CLARO, colors.HexColor('#EFF6FF'), GRIS_HEADER]
    t2 = Table(stats_data, colWidths=[7*cm, 4*cm, 3*cm])
    style_cmds = [
        ('BACKGROUND',  (0,0), (-1,0), VERDE),
        ('TEXTCOLOR',   (0,0), (-1,0), BLANCO),
        ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,-1), 8),
        ('FONTNAME',    (0,1), (0,-1), 'Helvetica-Bold'),
        ('ALIGN',       (1,0), (-1,-1), 'CENTER'),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('GRID',        (0,0), (-1,-1), 0.3, GRIS_BORDER),
    ]
    for i, color in enumerate(stat_colors[1:], 1):
        style_cmds.append(('BACKGROUND', (0,i), (-1,i), color))
    t2.setStyle(TableStyle(style_cmds))
    story.append(t2)

    return story


# ── SECCIÓN: MIEMBROS ─────────────────────────────────────────────────────────
def seccion_miembros(miembros, styles):
    story = [PageBreak(), Paragraph('Lista de Miembros', styles['seccion'])]

    headers = ['#', 'Turno', 'Nombre', 'Teléfono', 'Notas']
    rows = [headers]
    for i, m in enumerate(miembros):
        rows.append([
            str(i+1),
            str(m.get('numero_turno') or '—'),
            m.get('nombre', '—'),
            m.get('telefono') or '—',
            m.get('notas') or '—',
        ])
    rows.append(['', '', f'Total: {len(miembros)} miembros', '', ''])

    t = Table(rows, colWidths=[1*cm, 1.5*cm, 5.5*cm, 3*cm, 5*cm])
    style_cmds = [
        ('BACKGROUND',  (0,0), (-1,0), VERDE),
        ('TEXTCOLOR',   (0,0), (-1,0), BLANCO),
        ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,-1), 8),
        ('FONTNAME',    (0,1), (0,-2), 'Helvetica'),
        ('FONTNAME',    (0,-1), (-1,-1), 'Helvetica-Bold'),
        ('BACKGROUND',  (0,-1), (-1,-1), VERDE_CLARO),
        ('TEXTCOLOR',   (0,-1), (-1,-1), VERDE),
        ('ROWBACKGROUNDS', (0,1), (-1,-2), [BLANCO, GRIS_HEADER]),
        ('ALIGN',       (0,0), (1,-1), 'CENTER'),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('GRID',        (0,0), (-1,-1), 0.3, GRIS_BORDER),
    ]
    t.setStyle(TableStyle(style_cmds))
    story.append(t)
    return story


# ── SECCIÓN: SEGUIMIENTO DE PAGOS ────────────────────────────────────────────
def seccion_seguimiento(miembros, rondas, pagos_map, styles, page_size):
    story = [PageBreak(), Paragraph('Seguimiento de Pagos por Ronda', styles['seccion'])]

    # Ancho disponible
    available_w = page_size[0] - 3*cm  # landscape A4 minus margins
    nombre_w = 4*cm
    col_ronda_w = max(1.8*cm, (available_w - nombre_w) / max(len(rondas), 1))

    headers = [Paragraph('Miembro', ParagraphStyle('h', fontName='Helvetica-Bold', fontSize=7, textColor=BLANCO))]
    for r in rondas:
        fecha = r.get('fecha_pago', '')[:10]
        headers.append(Paragraph(f"R{r['numero_ronda']}\n{fecha[5:]}", 
                                  ParagraphStyle('rh', fontName='Helvetica-Bold', fontSize=6.5,
                                                  textColor=BLANCO, alignment=TA_CENTER)))

    rows = [headers]
    style_cmds = [
        ('BACKGROUND',  (0,0), (-1,0), VERDE),
        ('FONTSIZE',    (0,0), (-1,-1), 7.5),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING',  (0,0), (-1,-1), 4),
        ('BOTTOMPADDING',(0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
        ('GRID',        (0,0), (-1,-1), 0.3, GRIS_BORDER),
    ]

    for row_i, miembro in enumerate(miembros):
        row = [Paragraph(miembro.get('nombre', ''), 
                         ParagraphStyle('mn', fontName='Helvetica-Bold', fontSize=7.5, textColor=NEGRO))]
        bg_base = BLANCO if row_i % 2 == 0 else GRIS_HEADER

        for col_i, ronda in enumerate(rondas):
            es_receptor = str(ronda.get('miembro_id')) == str(miembro.get('id'))
            col = col_i + 1

            if es_receptor:
                row.append(Paragraph('RECIBE', ParagraphStyle('rec', fontName='Helvetica-Bold',
                                                                fontSize=6.5, textColor=VERDE, alignment=TA_CENTER)))
                style_cmds.append(('BACKGROUND', (col, row_i+1), (col, row_i+1), colors.HexColor('#FFF7ED')))
            else:
                mid = str(miembro.get('id'))
                rid = str(ronda.get('id'))
                pago = pagos_map.get(mid, {}).get(rid)
                if pago:
                    estado = pago.get('estado', 'pendiente')
                    texto  = 'Pagado' if estado == 'pagado' else ('Faltante' if estado == 'faltante' else 'Pendiente')
                    color_text = VERDE if estado == 'pagado' else (ROJO if estado == 'faltante' else AMBAR)
                    row.append(Paragraph(texto, ParagraphStyle('est', fontName='Helvetica-Bold',
                                                                fontSize=6.5, textColor=color_text, alignment=TA_CENTER)))
                    style_cmds.append(('BACKGROUND', (col, row_i+1), (col, row_i+1), estado_color(estado)))
                else:
                    row.append(Paragraph('—', ParagraphStyle('nd', fontSize=7, textColor=GRIS_TEXTO, alignment=TA_CENTER)))
                    style_cmds.append(('BACKGROUND', (col, row_i+1), (col, row_i+1), bg_base))

        style_cmds.append(('BACKGROUND', (0, row_i+1), (0, row_i+1), bg_base))
        rows.append(row)

    col_widths = [nombre_w] + [col_ronda_w] * len(rondas)
    t = Table(rows, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle(style_cmds))
    story.append(t)

    # Leyenda
    story.append(Spacer(1, 8))
    legend_data = [['', 'Pagado', '', 'Pendiente', '', 'Faltante', '', 'Recibe']]
    lt = Table(legend_data, colWidths=[0.5*cm, 2*cm, 0.3*cm, 2.5*cm, 0.3*cm, 2.2*cm, 0.3*cm, 2*cm])
    lt.setStyle(TableStyle([
        ('BACKGROUND', (1,0),(1,0), VERDE_CLARO),
        ('BACKGROUND', (3,0),(3,0), AMBAR_CLARO),
        ('BACKGROUND', (5,0),(5,0), ROJO_CLARO),
        ('BACKGROUND', (7,0),(7,0), colors.HexColor('#FFF7ED')),
        ('FONTSIZE',   (0,0),(-1,-1), 7),
        ('FONTNAME',   (0,0),(-1,-1), 'Helvetica'),
        ('ALIGN',      (0,0),(-1,-1), 'CENTER'),
        ('VALIGN',     (0,0),(-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0),(-1,-1), 3),
        ('BOTTOMPADDING',(0,0),(-1,-1), 3),
        ('GRID',       (1,0),(1,0), 0.5, GRIS_BORDER),
        ('GRID',       (3,0),(3,0), 0.5, GRIS_BORDER),
        ('GRID',       (5,0),(5,0), 0.5, GRIS_BORDER),
        ('GRID',       (7,0),(7,0), 0.5, GRIS_BORDER),
    ]))
    story.append(lt)
    return story


# ── SECCIÓN: CALENDARIO ───────────────────────────────────────────────────────
def seccion_calendario(rondas, miembros, styles, compact=False):
    story = []
    if not compact:
        story.append(PageBreak())
    story.append(Paragraph('Calendario de Rondas', styles['seccion']))

    headers = ['# Ronda', 'Fecha de Pago', 'Día', 'Quien Recibe', 'Teléfono', 'Estado']
    rows = [headers]

    miembros_map = {str(m['id']): m for m in miembros}

    from datetime import date
    hoy = date.today()

    for ronda in rondas:
        receptor_id = str(ronda.get('miembro_id', ''))
        receptor = miembros_map.get(receptor_id, {})
        fecha_str = ronda.get('fecha_pago', '')[:10]
        try:
            fecha_obj = date.fromisoformat(fecha_str)
            dia = fecha_obj.strftime('%A').capitalize()
            fecha_formateada = fecha_obj.strftime('%d/%m/%Y')
            es_pasada = fecha_obj < hoy
        except:
            dia = '—'
            fecha_formateada = fecha_str
            es_pasada = False

        completada = ronda.get('estado') == 'completada'
        if completada:
            estado_txt = 'Completada'
        elif es_pasada:
            estado_txt = 'Vencida'
        else:
            estado_txt = 'Pendiente'

        rows.append([
            str(ronda.get('numero_ronda', '')),
            fecha_formateada,
            dia,
            receptor.get('nombre', '—'),
            receptor.get('telefono') or '—',
            estado_txt,
        ])

    t = Table(rows, colWidths=[1.5*cm, 3*cm, 3*cm, 5*cm, 3*cm, 2.8*cm])
    style_cmds = [
        ('BACKGROUND',  (0,0), (-1,0), VERDE),
        ('TEXTCOLOR',   (0,0), (-1,0), BLANCO),
        ('FONTNAME',    (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE',    (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [BLANCO, GRIS_HEADER]),
        ('ALIGN',       (0,0), (0,-1), 'CENTER'),
        ('ALIGN',       (5,0), (5,-1), 'CENTER'),
        ('VALIGN',      (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING',  (0,0), (-1,-1), 5),
        ('BOTTOMPADDING',(0,0), (-1,-1), 5),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
        ('GRID',        (0,0), (-1,-1), 0.3, GRIS_BORDER),
    ]
    for i, row in enumerate(rows[1:], 1):
        estado = row[5]
        if estado == 'Completada':
            style_cmds.append(('BACKGROUND', (5,i),(5,i), VERDE_CLARO))
            style_cmds.append(('TEXTCOLOR',  (5,i),(5,i), VERDE))
        elif estado == 'Vencida':
            style_cmds.append(('BACKGROUND', (5,i),(5,i), ROJO_CLARO))
            style_cmds.append(('TEXTCOLOR',  (5,i),(5,i), ROJO))
        else:
            style_cmds.append(('BACKGROUND', (5,i),(5,i), AMBAR_CLARO))
            style_cmds.append(('TEXTCOLOR',  (5,i),(5,i), AMBAR))
        style_cmds.append(('FONTNAME', (5,i),(5,i), 'Helvetica-Bold'))

    t.setStyle(TableStyle(style_cmds))
    story.append(t)
    return story


# ── PORTADA ───────────────────────────────────────────────────────────────────
def portada(tanda, tipo_label, styles, page_size):
    story = []
    w, _ = page_size

    # Banner verde
    banner_data = [[Paragraph(f'TandaApp', ParagraphStyle('bn', fontName='Helvetica-Bold',
                                                            fontSize=22, textColor=BLANCO, alignment=TA_CENTER))]]
    bt = Table(banner_data, colWidths=[w - 3*cm])
    bt.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), VERDE),
        ('TOPPADDING', (0,0),(-1,-1), 18),
        ('BOTTOMPADDING', (0,0),(-1,-1), 18),
    ]))
    story.append(bt)
    story.append(Spacer(1, 6))

    sub_data = [[Paragraph(tipo_label, ParagraphStyle('sl', fontName='Helvetica', fontSize=11,
                                                       textColor=VERDE, alignment=TA_CENTER))]]
    st = Table(sub_data, colWidths=[w - 3*cm])
    st.setStyle(TableStyle([
        ('BACKGROUND', (0,0),(-1,-1), VERDE_CLARO),
        ('TOPPADDING', (0,0),(-1,-1), 8),
        ('BOTTOMPADDING', (0,0),(-1,-1), 8),
    ]))
    story.append(st)
    story.append(Spacer(1, 10))

    # Nombre de la tanda
    story.append(Paragraph(tanda.get('nombre', ''), ParagraphStyle('tn', fontName='Helvetica-Bold',
                                                                     fontSize=16, textColor=NEGRO, alignment=TA_CENTER, spaceAfter=4)))
    from datetime import date
    story.append(Paragraph(f"Reporte generado el {date.today().strftime('%d/%m/%Y')}",
                            ParagraphStyle('rd', fontName='Helvetica', fontSize=9,
                                            textColor=GRIS_TEXTO, alignment=TA_CENTER, spaceAfter=16)))
    story.append(HRFlowable(width='100%', thickness=1, color=GRIS_BORDER))
    story.append(Spacer(1, 8))
    return story


# ── MAIN ─────────────────────────────────────────────────────────────────────
def main():
    json_file  = sys.argv[1]
    output_pdf = sys.argv[2]
    tipo       = sys.argv[3]  # 'completo' | 'calendario'

    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    tanda      = data['tanda']
    miembros   = data['miembros']
    rondas     = data['rondas']
    pagos_map  = data['pagosMap']
    summary    = data.get('summary', {})

    styles = make_styles()

    # Orientación: landscape para seguimiento de pagos (muchas columnas)
    if tipo == 'completo':
        page_size = landscape(A4)
        tipo_label = 'Reporte Completo'
    else:
        page_size = A4
        tipo_label = 'Calendario de Rondas'

    doc = SimpleDocTemplate(
        output_pdf,
        pagesize=page_size,
        leftMargin=1.5*cm, rightMargin=1.5*cm,
        topMargin=1.8*cm,  bottomMargin=1.2*cm,
    )

    def on_page(canvas, doc):
        header_footer(canvas, doc, tanda.get('nombre',''), tipo_label)

    story = portada(tanda, tipo_label, styles, page_size)

    if tipo == 'completo':
        story += seccion_resumen(tanda, summary, rondas, styles)
        story += seccion_miembros(miembros, styles)
        story += seccion_seguimiento(miembros, rondas, pagos_map, styles, page_size)
        story += seccion_calendario(rondas, miembros, styles)
    else:
        story += seccion_calendario(rondas, miembros, styles, compact=True)

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    print('OK')

if __name__ == '__main__':
    main()