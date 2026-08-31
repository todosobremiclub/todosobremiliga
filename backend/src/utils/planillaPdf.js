const PDFDocument = require('pdfkit');

// Genera la planilla de partido en PDF (formato "de cancha", para imprimir
// y llevar al partido) -- mismo layout que la planilla en papel que ya usa
// la Liga: logo arriba, datos del partido, y una tabla por equipo con los
// jugadores fichados (Nº, nombre, y columnas en blanco para que el árbitro/
// delegado anote Goles, Tarjetas Amarillas, Tarjetas Rojas y la firma).
//
// No dibuja resultados ni estadísticas cargadas en el sistema -- es una
// hoja para completar A MANO el día del partido, igual que la de papel.
//
// `logoBuffer` es opcional (null si la Liga no tiene logo, o si vino en un
// formato que no se pudo decodificar) -- sin él, simplemente no se dibuja.
function generarPlanillaPdf({
  ligaNombre,
  logoBuffer,
  torneoNombre,
  categoriaNombre,
  subcategoriaNombre,
  fecha,
  hora,
  sede,
  clubLocalNombre,
  clubVisitanteNombre,
  jugadoresLocal,
  jugadoresVisitante,
}) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });

  const anchoPagina = doc.page.width;
  const margen = doc.page.margins.left;
  const anchoUtil = anchoPagina - margen * 2;

  // --- Encabezado: logo + título centrado -----------------------------
  const alturaLogo = 46;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, margen, margen, { fit: [alturaLogo, alturaLogo] });
    } catch (_) {
      // Un logo corrupto no debe romper la descarga de la planilla.
    }
  }

  doc.font('Helvetica-Bold').fontSize(15).text(ligaNombre || 'Planilla de partido', margen, margen, {
    width: anchoUtil,
    align: 'center',
  });
  doc.font('Helvetica-Bold').fontSize(12).text(torneoNombre.toUpperCase(), margen, margen + 20, {
    width: anchoUtil,
    align: 'center',
  });
  const subtituloCategoria = [categoriaNombre, subcategoriaNombre].filter(Boolean).join(' - ');
  if (subtituloCategoria) {
    doc.font('Helvetica').fontSize(10).text(subtituloCategoria, margen, margen + 36, {
      width: anchoUtil,
      align: 'center',
    });
  }

  let y = margen + alturaLogo + 12;

  // --- Datos del partido ------------------------------------------------
  doc.font('Helvetica').fontSize(10);
  doc.text(`Fecha: ${fecha || '_______________'}`, margen, y);
  doc.text(`Hora: ${hora || '_______________'}`, margen + 220, y);
  doc.text(`Sede: ${sede || '_______________________________'}`, margen + 400, y);
  y += 16;
  doc.text('Delegado: ______________________________________________________________', margen, y);
  y += 20;

  doc.font('Helvetica-Bold').fontSize(11);
  doc.text(`${clubLocalNombre}     VS     ${clubVisitanteNombre}`, margen, y, { width: anchoUtil, align: 'center' });
  y += 22;

  // --- Las dos tablas de jugadores, lado a lado -------------------------
  const anchoTabla = (anchoUtil - 16) / 2;
  const alturaFila = 16;
  const filasMinimas = 18;
  const filas = Math.max(filasMinimas, jugadoresLocal.length, jugadoresVisitante.length);

  const finTablas = dibujarTablaEquipo(doc, {
    x: margen,
    y,
    ancho: anchoTabla,
    alturaFila,
    filas,
    jugadores: jugadoresLocal,
  });
  dibujarTablaEquipo(doc, {
    x: margen + anchoTabla + 16,
    y,
    ancho: anchoTabla,
    alturaFila,
    filas,
    jugadores: jugadoresVisitante,
  });

  y = finTablas + 26;

  // --- Firmas y observaciones --------------------------------------------
  doc.font('Helvetica').fontSize(9);
  doc.text('_______________________________________', margen, y);
  doc.text('Nombre y firma Capitán', margen, y + 12);
  doc.text('_______________________________________', margen + anchoTabla + 16, y);
  doc.text('Nombre y firma Capitán', margen + anchoTabla + 16, y + 12);

  y += 34;
  doc.font('Helvetica-Bold').fontSize(10).text('OBSERVACIONES:', margen, y);
  doc.moveTo(margen, y + 30).lineTo(anchoPagina - margen, y + 30).strokeColor('#999999').stroke();

  doc.end();
  return doc;
}

// Dibuja la grilla de un equipo: encabezado (Nº, Nombre completo, Goles,
// T.A., T.R., Firma) + una fila por jugador fichado (con su nombre y número
// de camiseta ya completados, marcando "(SANCIONADO)" junto al nombre si
// corresponde) + filas en blanco hasta completar `filas`, para anotar a
// mano si falta alguien. Devuelve el Y donde terminó de dibujar.
function dibujarTablaEquipo(doc, { x, y, ancho, alturaFila, filas, jugadores }) {
  // Proporción de columnas: Nº chico, Nombre grande, Goles/TA/TR chicos, Firma mediana.
  const columnas = [
    { titulo: 'Nº', ancho: 0.07 },
    { titulo: 'Nombre completo', ancho: 0.40 },
    { titulo: 'Goles', ancho: 0.11 },
    { titulo: 'T.A.', ancho: 0.10 },
    { titulo: 'T.R.', ancho: 0.10 },
    { titulo: 'Firma', ancho: 0.22 },
  ];
  const anchosPx = columnas.map((c) => c.ancho * ancho);

  const alturaEncabezado = 18;
  doc.rect(x, y, ancho, alturaEncabezado).fillAndStroke('#e5e5e5', '#333333');
  doc.fillColor('#000000').font('Helvetica-Bold').fontSize(8.5);
  let cx = x;
  columnas.forEach((c, i) => {
    doc.text(c.titulo, cx + 3, y + 5, { width: anchosPx[i] - 6, align: i === 1 ? 'left' : 'center' });
    cx += anchosPx[i];
  });

  let fy = y + alturaEncabezado;
  doc.font('Helvetica').fontSize(8.5);
  for (let i = 0; i < filas; i++) {
    const jugador = jugadores[i];
    doc.rect(x, fy, ancho, alturaFila).stroke('#333333');
    cx = x;
    columnas.forEach((c, colIndex) => {
      doc.rect(cx, fy, anchosPx[colIndex], alturaFila).stroke('#333333');
      if (jugador) {
        if (colIndex === 0 && jugador.numero != null) {
          doc.text(String(jugador.numero), cx + 3, fy + 4, { width: anchosPx[colIndex] - 6, align: 'center' });
        } else if (colIndex === 1) {
          const nombre = jugador.sancionado ? `${jugador.nombreCompleto}  (SANCIONADO)` : jugador.nombreCompleto;
          doc
            .fillColor(jugador.sancionado ? '#b00020' : '#000000')
            .text(nombre, cx + 3, fy + 4, { width: anchosPx[colIndex] - 6, align: 'left' });
          doc.fillColor('#000000');
        }
      }
      cx += anchosPx[colIndex];
    });
    fy += alturaFila;
  }
  return fy;
}

module.exports = { generarPlanillaPdf };
