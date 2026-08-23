// Helpers para generar automáticamente las deudas de los clubes cuando
// ocurre el hecho que las origina (inscripción a un torneo, creación de un
// partido, o el disparo manual del cargo mensual de un período). Todos
// asumen que el concepto correspondiente puede no estar activo -- en ese
// caso no generan nada.

const { query } = require('../db');

// 'YYYY-MM' del mes en curso, en hora Argentina (evita depender del huso del
// servidor de Render, que corre en UTC). Se usa tanto para el job automático
// (cobrosMensual.js) como para el resumen de "impagos del mes" del Panel Liga.
function periodoActualArgentina() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const anio = partes.find((p) => p.type === 'year').value;
  const mes = partes.find((p) => p.type === 'month').value;
  return `${anio}-${mes}`;
}

// Busca el concepto de un tipo para un torneo, solo si está activo.
async function buscarConceptoActivo(torneoId, tipo) {
  const { rows } = await query(
    'SELECT * FROM torneo_conceptos_pago WHERE torneo_id = $1 AND tipo = $2 AND activo = TRUE',
    [torneoId, tipo]
  );
  return rows[0] || null;
}

// Se llama al inscribir un club en un torneo (alta de equipos_torneo).
// Genera la deuda de "inscripción" para ese club si el concepto está activo.
// No falla si ya existe (ON CONFLICT DO NOTHING, por el índice único).
async function generarDeudaInscripcion(torneoId, clubId) {
  const concepto = await buscarConceptoActivo(torneoId, 'inscripcion');
  if (!concepto) return null;
  const { rows } = await query(
    `INSERT INTO club_deudas (torneo_id, concepto_id, club_id, tipo, descripcion, monto)
     VALUES ($1, $2, $3, 'inscripcion', 'Inscripción al torneo', $4)
     ON CONFLICT (torneo_id, club_id, concepto_id) WHERE tipo = 'inscripcion' DO NOTHING
     RETURNING *`,
    [torneoId, concepto.id, clubId, concepto.monto]
  );
  return rows[0] || null;
}

// Se llama al CARGAR EL RESULTADO de un partido (no al programarlo): recién
// ahí el partido efectivamente se jugó. Genera la deuda "por partido" para
// los DOS clubes que jugaron (local y visitante), si el concepto está
// activo -- así un fixture completo generado de entrada no le carga a los
// clubes de una la deuda de fechas que todavía no se jugaron.
async function generarDeudasPorPartido(torneoId, partidoId, clubLocalId, clubVisitanteId, descripcion) {
  const concepto = await buscarConceptoActivo(torneoId, 'por_partido');
  if (!concepto) return [];
  const creadas = [];
  for (const clubId of [clubLocalId, clubVisitanteId]) {
    const { rows } = await query(
      `INSERT INTO club_deudas (torneo_id, concepto_id, club_id, tipo, partido_id, descripcion, monto)
       VALUES ($1, $2, $3, 'por_partido', $4, $5, $6)
       ON CONFLICT (torneo_id, club_id, concepto_id, partido_id) WHERE tipo = 'por_partido' DO NOTHING
       RETURNING *`,
      [torneoId, concepto.id, clubId, partidoId, descripcion || 'Cargo por partido', concepto.monto]
    );
    if (rows[0]) creadas.push(rows[0]);
  }
  return creadas;
}

// Se llama desde el endpoint manual "generar cargo mensual" de un período
// (ej: '2026-08'). Genera la deuda "mensual" para TODOS los clubes
// inscriptos (en cualquier división/categoría) en el torneo, si el
// concepto está activo. Devuelve cuántas deudas nuevas se crearon.
async function generarDeudasMensual(torneoId, periodo) {
  const concepto = await buscarConceptoActivo(torneoId, 'mensual');
  if (!concepto) return { generadas: 0, concepto: null };

  const clubesResult = await query(
    'SELECT DISTINCT club_id FROM equipos_torneo WHERE torneo_id = $1 AND activo = TRUE',
    [torneoId]
  );

  let generadas = 0;
  for (const { club_id } of clubesResult.rows) {
    const { rows } = await query(
      `INSERT INTO club_deudas (torneo_id, concepto_id, club_id, tipo, periodo, descripcion, monto)
       VALUES ($1, $2, $3, 'mensual', $4, $5, $6)
       ON CONFLICT (torneo_id, club_id, concepto_id, periodo) WHERE tipo = 'mensual' DO NOTHING
       RETURNING *`,
      [torneoId, concepto.id, club_id, periodo, `Cuota mensual ${periodo}`, concepto.monto]
    );
    if (rows[0]) generadas += 1;
  }
  return { generadas, concepto };
}

module.exports = {
  periodoActualArgentina,
  buscarConceptoActivo,
  generarDeudaInscripcion,
  generarDeudasPorPartido,
  generarDeudasMensual,
};
