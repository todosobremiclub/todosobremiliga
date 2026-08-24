const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).
// Pestaña "Reportes" del Panel Liga: 4 reportes de alto nivel sobre toda la
// Liga (no un torneo puntual), pensados para gráficos.

// ============================================================================
// 1) GET /liga/reportes/clubes-por-torneo
// Árbol Torneo -> División (categoría) -> Categoría (subcategoría) con la
// cantidad de clubes inscriptos en cada nivel, más el total de clubes
// activos de la Liga (participen o no de algún torneo todavía).
// ============================================================================
router.get('/clubes-por-torneo', async (req, res) => {
  try {
    const totalClubesResult = await query(
      'SELECT COUNT(DISTINCT club_id)::int AS total FROM club_liga WHERE liga_id = $1 AND activo = TRUE',
      [req.ligaId]
    );

    const { rows } = await query(
      `SELECT t.id AS torneo_id, t.nombre AS torneo_nombre,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre,
              sub.id AS subcategoria_id, sub.nombre AS subcategoria_nombre,
              et.club_id
       FROM equipos_torneo et
       JOIN torneos t ON t.id = et.torneo_id
       JOIN categorias cat ON cat.id = et.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = et.subcategoria_id
       WHERE t.liga_id = $1 AND et.activo = TRUE`,
      [req.ligaId]
    );

    const torneos = construirArbolClubes(rows);
    res.json({ ok: true, total_clubes: totalClubesResult.rows[0].total, torneos });
  } catch (err) {
    console.error('Error en GET /liga/reportes/clubes-por-torneo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Arma el árbol Torneo -> Categoría -> Subcategoría contando clubes
// DISTINTOS en cada nivel (un mismo club puede tener más de un equipo en la
// misma categoría si hay subcategorías, y no queremos contarlo dos veces al
// nivel de categoría).
function construirArbolClubes(filas) {
  const torneosMap = new Map();
  for (const fila of filas) {
    if (!torneosMap.has(fila.torneo_id)) {
      torneosMap.set(fila.torneo_id, { torneo_id: fila.torneo_id, torneo_nombre: fila.torneo_nombre, clubes: new Set(), categorias: new Map() });
    }
    const torneo = torneosMap.get(fila.torneo_id);
    torneo.clubes.add(fila.club_id);

    if (!torneo.categorias.has(fila.categoria_id)) {
      torneo.categorias.set(fila.categoria_id, { categoria_id: fila.categoria_id, categoria_nombre: fila.categoria_nombre, clubes: new Set(), subcategorias: new Map() });
    }
    const categoria = torneo.categorias.get(fila.categoria_id);
    categoria.clubes.add(fila.club_id);

    if (fila.subcategoria_id) {
      if (!categoria.subcategorias.has(fila.subcategoria_id)) {
        categoria.subcategorias.set(fila.subcategoria_id, { subcategoria_id: fila.subcategoria_id, subcategoria_nombre: fila.subcategoria_nombre, clubes: new Set() });
      }
      categoria.subcategorias.get(fila.subcategoria_id).clubes.add(fila.club_id);
    }
  }

  return Array.from(torneosMap.values()).map((t) => ({
    torneo_id: t.torneo_id,
    torneo_nombre: t.torneo_nombre,
    total_clubes: t.clubes.size,
    categorias: Array.from(t.categorias.values()).map((c) => ({
      categoria_id: c.categoria_id,
      categoria_nombre: c.categoria_nombre,
      total_clubes: c.clubes.size,
      subcategorias: Array.from(c.subcategorias.values()).map((s) => ({
        subcategoria_id: s.subcategoria_id,
        subcategoria_nombre: s.subcategoria_nombre,
        total_clubes: s.clubes.size,
      })),
    })),
  }));
}

// ============================================================================
// 2) GET /liga/reportes/recaudado-vs-gastos?anio=YYYY
// Recaudado (ingresos varios + pagos de deudas de clubes) vs Gastos, mes a
// mes de un año, con acumulado mensual y el total anual.
// ============================================================================
router.get('/recaudado-vs-gastos', async (req, res) => {
  const anio = parseInt(req.query.anio, 10) || new Date().getFullYear();
  try {
    const [ingresosPorMes, pagosPorMes, gastosPorMes] = await Promise.all([
      query(
        `SELECT EXTRACT(MONTH FROM fecha)::int AS mes, SUM(monto) AS total
         FROM ingresos WHERE liga_id = $1 AND EXTRACT(YEAR FROM fecha) = $2
         GROUP BY mes`,
        [req.ligaId, anio]
      ),
      query(
        `SELECT EXTRACT(MONTH FROM p.fecha)::int AS mes, SUM(p.monto) AS total
         FROM club_pagos p
         JOIN club_deudas d ON d.id = p.deuda_id
         JOIN torneos t ON t.id = d.torneo_id
         WHERE t.liga_id = $1 AND EXTRACT(YEAR FROM p.fecha) = $2
         GROUP BY mes`,
        [req.ligaId, anio]
      ),
      query(
        `SELECT EXTRACT(MONTH FROM fecha)::int AS mes, SUM(monto) AS total
         FROM gastos WHERE liga_id = $1 AND EXTRACT(YEAR FROM fecha) = $2
         GROUP BY mes`,
        [req.ligaId, anio]
      ),
    ]);

    const ingresosMap = new Map(ingresosPorMes.rows.map((r) => [r.mes, Number(r.total)]));
    const pagosMap = new Map(pagosPorMes.rows.map((r) => [r.mes, Number(r.total)]));
    const gastosMap = new Map(gastosPorMes.rows.map((r) => [r.mes, Number(r.total)]));

    let acumuladoRecaudado = 0;
    let acumuladoGastos = 0;
    const meses = [];
    for (let mes = 1; mes <= 12; mes++) {
      const recaudado = (ingresosMap.get(mes) || 0) + (pagosMap.get(mes) || 0);
      const gastos = gastosMap.get(mes) || 0;
      acumuladoRecaudado += recaudado;
      acumuladoGastos += gastos;
      meses.push({ mes, recaudado, gastos, acumulado_recaudado: acumuladoRecaudado, acumulado_gastos: acumuladoGastos });
    }

    res.json({
      ok: true,
      anio,
      meses,
      anual: { recaudado: acumuladoRecaudado, gastos: acumuladoGastos, diferencia: acumuladoRecaudado - acumuladoGastos },
    });
  } catch (err) {
    console.error('Error en GET /liga/reportes/recaudado-vs-gastos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ============================================================================
// 3) GET /liga/reportes/esperado-vs-recaudado?torneo_id=...
// Esperado (todo lo que se le debería cobrar a los clubes: inscripción +
// cuotas + por partido) vs Recaudado (lo que efectivamente pagaron), a nivel
// de toda la Liga y desglosado por Torneo. Si se pasa torneo_id, además trae
// el desglose por club de ese torneo puntual.
// ============================================================================
router.get('/esperado-vs-recaudado', async (req, res) => {
  const { torneo_id } = req.query;
  try {
    const { rows: porTorneo } = await query(
      `SELECT t.id AS torneo_id, t.nombre AS torneo_nombre,
              COALESCE(SUM(d.monto), 0) AS esperado,
              COALESCE(SUM(pg.pagado), 0) AS recaudado
       FROM torneos t
       LEFT JOIN club_deudas d ON d.torneo_id = t.id
       LEFT JOIN LATERAL (SELECT SUM(monto) AS pagado FROM club_pagos WHERE deuda_id = d.id) pg ON d.id IS NOT NULL
       WHERE t.liga_id = $1
       GROUP BY t.id, t.nombre
       HAVING COALESCE(SUM(d.monto), 0) > 0
       ORDER BY t.nombre ASC`,
      [req.ligaId]
    );

    const torneos = porTorneo.map((t) => ({
      torneo_id: t.torneo_id,
      torneo_nombre: t.torneo_nombre,
      esperado: Number(t.esperado),
      recaudado: Number(t.recaudado),
      diferencia: Number(t.recaudado) - Number(t.esperado),
    }));

    const total = torneos.reduce(
      (acc, t) => ({ esperado: acc.esperado + t.esperado, recaudado: acc.recaudado + t.recaudado }),
      { esperado: 0, recaudado: 0 }
    );
    total.diferencia = total.recaudado - total.esperado;

    let detalle_por_club = null;
    if (torneo_id) {
      const torneoOk = await query('SELECT 1 FROM torneos WHERE id = $1 AND liga_id = $2', [torneo_id, req.ligaId]);
      if (!torneoOk.rows[0]) {
        return res.status(404).json({ ok: false, error: 'Ese torneo no pertenece a tu Liga' });
      }
      const { rows: porClub } = await query(
        `SELECT c.id AS club_id, c.nombre AS club_nombre,
                SUM(d.monto) AS esperado,
                COALESCE(SUM(pg.pagado), 0) AS recaudado
         FROM club_deudas d
         JOIN clubes c ON c.id = d.club_id
         LEFT JOIN LATERAL (SELECT SUM(monto) AS pagado FROM club_pagos WHERE deuda_id = d.id) pg ON true
         WHERE d.torneo_id = $1
         GROUP BY c.id, c.nombre
         ORDER BY c.nombre ASC`,
        [torneo_id]
      );
      detalle_por_club = porClub.map((c) => ({
        club_id: c.club_id,
        club_nombre: c.club_nombre,
        esperado: Number(c.esperado),
        recaudado: Number(c.recaudado),
        diferencia: Number(c.recaudado) - Number(c.esperado),
      }));
    }

    res.json({ ok: true, total, torneos, detalle_por_club });
  } catch (err) {
    console.error('Error en GET /liga/reportes/esperado-vs-recaudado:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ============================================================================
// 4) GET /liga/reportes/fichados
// Mismo árbol Torneo -> División -> Categoría que clubes-por-torneo, pero
// contando fichajes APROBADOS (jugadores habilitados) en vez de clubes.
// ============================================================================
router.get('/fichados', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id AS torneo_id, t.nombre AS torneo_nombre,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre,
              sub.id AS subcategoria_id, sub.nombre AS subcategoria_nombre,
              f.id AS fichaje_id
       FROM fichajes f
       JOIN torneos t ON t.id = f.torneo_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
       WHERE t.liga_id = $1 AND f.estado = 'aprobado'`,
      [req.ligaId]
    );

    const torneosMap = new Map();
    for (const fila of rows) {
      if (!torneosMap.has(fila.torneo_id)) {
        torneosMap.set(fila.torneo_id, { torneo_id: fila.torneo_id, torneo_nombre: fila.torneo_nombre, total: 0, categorias: new Map() });
      }
      const torneo = torneosMap.get(fila.torneo_id);
      torneo.total++;

      const catKey = fila.categoria_id || 'sin-categoria';
      if (!torneo.categorias.has(catKey)) {
        torneo.categorias.set(catKey, { categoria_id: fila.categoria_id, categoria_nombre: fila.categoria_nombre || 'Sin división', total: 0, subcategorias: new Map() });
      }
      const categoria = torneo.categorias.get(catKey);
      categoria.total++;

      if (fila.subcategoria_id) {
        if (!categoria.subcategorias.has(fila.subcategoria_id)) {
          categoria.subcategorias.set(fila.subcategoria_id, { subcategoria_id: fila.subcategoria_id, subcategoria_nombre: fila.subcategoria_nombre, total: 0 });
        }
        categoria.subcategorias.get(fila.subcategoria_id).total++;
      }
    }

    const torneos = Array.from(torneosMap.values()).map((t) => ({
      torneo_id: t.torneo_id,
      torneo_nombre: t.torneo_nombre,
      total_fichados: t.total,
      categorias: Array.from(t.categorias.values()).map((c) => ({
        categoria_id: c.categoria_id,
        categoria_nombre: c.categoria_nombre,
        total_fichados: c.total,
        subcategorias: Array.from(c.subcategorias.values()).map((s) => ({
          subcategoria_id: s.subcategoria_id,
          subcategoria_nombre: s.subcategoria_nombre,
          total_fichados: s.total,
        })),
      })),
    }));

    res.json({ ok: true, total_fichados: rows.length, torneos });
  } catch (err) {
    console.error('Error en GET /liga/reportes/fichados:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
