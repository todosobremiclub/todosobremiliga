const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { generarDeudasMensual } = require('../utils/cobros');

const TIPOS_VALIDOS = ['inscripcion', 'mensual', 'por_partido'];

// Chequea que el torneo sea de MI liga. Devuelve la fila o null.
async function buscarTorneoDeMiLiga(torneoId, ligaId) {
  const { rows } = await query('SELECT * FROM torneos WHERE id = $1 AND liga_id = $2', [torneoId, ligaId]);
  return rows[0] || null;
}

// ===== DEUDA Y PAGOS DE UN CLUB, A TRAVÉS DE TODOS SUS TORNEOS =====
// A diferencia del resto de las rutas de este archivo (que miran un torneo
// para todos los clubes), estas dos miran un club para todos los torneos de
// tu Liga — pensadas para el popup "Deuda y pagos" que se abre desde la
// pantalla de Fichajes del club.

// GET /liga/cobros/clubes/:clubId/deudas
router.get('/clubes/:clubId/deudas', async (req, res) => {
  try {
    const clubOk = await query('SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2', [req.params.clubId, req.ligaId]);
    if (!clubOk.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });

    const { rows } = await query(
      `SELECT d.*, t.nombre AS torneo_nombre,
              p.jornada AS partido_jornada,
              cl.nombre AS partido_club_local, cv.nombre AS partido_club_visitante,
              COALESCE(pg.total_pagado, 0) AS total_pagado,
              d.monto - COALESCE(pg.total_pagado, 0) AS saldo,
              CASE
                WHEN COALESCE(pg.total_pagado, 0) <= 0 THEN 'pendiente'
                WHEN COALESCE(pg.total_pagado, 0) >= d.monto THEN 'pagada'
                ELSE 'parcial'
              END AS estado
       FROM club_deudas d
       JOIN torneos t ON t.id = d.torneo_id
       LEFT JOIN partidos p ON p.id = d.partido_id
       LEFT JOIN equipos_torneo el ON el.id = p.equipo_local_id
       LEFT JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       LEFT JOIN clubes cl ON cl.id = el.club_id
       LEFT JOIN clubes cv ON cv.id = ev.club_id
       LEFT JOIN LATERAL (
         SELECT SUM(monto) AS total_pagado FROM club_pagos WHERE deuda_id = d.id
       ) pg ON true
       WHERE d.club_id = $1 AND t.liga_id = $2
       ORDER BY t.nombre ASC, d.creado_at DESC`,
      [req.params.clubId, req.ligaId]
    );
    res.json({ ok: true, deudas: rows });
  } catch (err) {
    console.error('Error en GET deudas de club (todos los torneos):', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/cobros/clubes/:clubId/pagos
router.get('/clubes/:clubId/pagos', async (req, res) => {
  try {
    const clubOk = await query('SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2', [req.params.clubId, req.ligaId]);
    if (!clubOk.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });

    const { rows } = await query(
      `SELECT pg.*, d.tipo, d.descripcion AS deuda_descripcion, d.monto AS deuda_monto, t.nombre AS torneo_nombre
       FROM club_pagos pg
       JOIN club_deudas d ON d.id = pg.deuda_id
       JOIN torneos t ON t.id = d.torneo_id
       WHERE d.club_id = $1 AND t.liga_id = $2
       ORDER BY pg.fecha DESC, pg.creado_at DESC`,
      [req.params.clubId, req.ligaId]
    );
    res.json({ ok: true, pagos: rows });
  } catch (err) {
    console.error('Error en GET pagos de club (todos los torneos):', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== CONCEPTOS DE COBRO DEL TORNEO =====

// GET /liga/cobros/:torneoId/conceptos
router.get('/:torneoId/conceptos', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      'SELECT * FROM torneo_conceptos_pago WHERE torneo_id = $1 ORDER BY tipo ASC',
      [req.params.torneoId]
    );
    // Siempre devuelve los 3 tipos posibles, aunque todavía no se hayan
    // configurado (con monto null y activo false) -- así el frontend
    // puede pintar directamente las 3 filas del formulario.
    const conceptos = TIPOS_VALIDOS.map((tipo) => rows.find((c) => c.tipo === tipo) || { tipo, monto: null, activo: false, torneo_id: req.params.torneoId });
    res.json({ ok: true, conceptos });
  } catch (err) {
    console.error('Error en GET conceptos de cobro:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/cobros/:torneoId/conceptos/:tipo — crea o actualiza el concepto
// (monto, activo). Si se activa la INSCRIPCIÓN, genera de una la deuda para
// todos los clubes ya inscriptos en el torneo (que todavía no la tengan).
// El concepto "por partido" no hace falta backfillearlo acá: se genera solo
// cuando se crea cada partido (ver ligaFixtureRoutes.js), así que si se
// activa después de tener partidos ya cargados, esos partidos viejos no
// generan cargo retroactivo (se avisa en la respuesta).
router.put('/:torneoId/conceptos/:tipo', async (req, res) => {
  const { tipo } = req.params;
  const { monto, activo } = req.body;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ ok: false, error: 'Tipo de concepto inválido' });
  }
  if (monto == null || Number(monto) <= 0) {
    return res.status(400).json({ ok: false, error: 'Falta un monto válido' });
  }
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `INSERT INTO torneo_conceptos_pago (torneo_id, tipo, monto, activo)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (torneo_id, tipo) DO UPDATE SET
         monto = EXCLUDED.monto, activo = EXCLUDED.activo, actualizado_at = NOW()
       RETURNING *`,
      [req.params.torneoId, tipo, monto, activo !== false]
    );
    const concepto = rows[0];

    let deudasGeneradas = 0;
    if (tipo === 'inscripcion' && concepto.activo) {
      const clubesResult = await query(
        'SELECT DISTINCT club_id FROM equipos_torneo WHERE torneo_id = $1 AND activo = TRUE',
        [req.params.torneoId]
      );
      for (const { club_id } of clubesResult.rows) {
        const ins = await query(
          `INSERT INTO club_deudas (torneo_id, concepto_id, club_id, tipo, descripcion, monto)
           VALUES ($1, $2, $3, 'inscripcion', 'Inscripción al torneo', $4)
           ON CONFLICT (torneo_id, club_id, concepto_id) WHERE tipo = 'inscripcion' DO NOTHING
           RETURNING id`,
          [req.params.torneoId, concepto.id, club_id, concepto.monto]
        );
        if (ins.rows[0]) deudasGeneradas += 1;
      }
    }

    res.json({ ok: true, concepto, deudas_generadas: deudasGeneradas });
  } catch (err) {
    console.error('Error en PUT concepto de cobro:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/cobros/:torneoId/generar-mensual — dispara manualmente la
// generación del cargo mensual de un período (body: { periodo: 'YYYY-MM' })
// para todos los clubes inscriptos en el torneo. Se puede volver a llamar
// para el mismo período sin duplicar (el índice único lo evita).
router.post('/:torneoId/generar-mensual', async (req, res) => {
  const { periodo } = req.body;
  if (!periodo || !/^\d{4}-\d{2}$/.test(periodo)) {
    return res.status(400).json({ ok: false, error: "Falta un período válido (formato 'YYYY-MM')" });
  }
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const resultado = await generarDeudasMensual(req.params.torneoId, periodo);
    if (!resultado.concepto) {
      return res.status(400).json({ ok: false, error: 'Este torneo no tiene activado el cobro mensual' });
    }
    res.status(201).json({ ok: true, deudas_generadas: resultado.generadas, periodo });
  } catch (err) {
    console.error('Error en POST generar-mensual:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== VISTA RÁPIDA: qué pagó y qué adeuda cada club =====

// GET /liga/cobros/:torneoId/resumen — un renglón por club inscripto, con el
// total adeudado (suma de club_deudas.monto), el total pagado (suma de
// club_pagos.monto contra esas deudas) y el saldo pendiente.
router.get('/:torneoId/resumen', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `SELECT c.id AS club_id, c.nombre AS club_nombre, c.logo_url AS club_logo_url,
              COALESCE(SUM(d.monto), 0) AS total_adeudado,
              COALESCE(SUM(pg.total_pagado), 0) AS total_pagado,
              COALESCE(SUM(d.monto), 0) - COALESCE(SUM(pg.total_pagado), 0) AS saldo_pendiente
       FROM (SELECT DISTINCT club_id FROM equipos_torneo WHERE torneo_id = $1 AND activo = TRUE) et
       JOIN clubes c ON c.id = et.club_id
       LEFT JOIN club_deudas d ON d.club_id = c.id AND d.torneo_id = $1
       LEFT JOIN LATERAL (
         SELECT SUM(p.monto) AS total_pagado FROM club_pagos p WHERE p.deuda_id = d.id
       ) pg ON true
       GROUP BY c.id, c.nombre, c.logo_url
       ORDER BY saldo_pendiente DESC, c.nombre ASC`,
      [req.params.torneoId]
    );
    res.json({ ok: true, resumen: rows });
  } catch (err) {
    console.error('Error en GET resumen de cobros:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/cobros/:torneoId/clubes/:clubId/deudas — detalle de las deudas
// de un club puntual, con su saldo calculado y su estado (pendiente/parcial/pagada).
router.get('/:torneoId/clubes/:clubId/deudas', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `SELECT d.*,
              p.jornada AS partido_jornada, p.fecha AS partido_fecha,
              cl.nombre AS partido_club_local, cv.nombre AS partido_club_visitante,
              COALESCE(pg.total_pagado, 0) AS total_pagado,
              d.monto - COALESCE(pg.total_pagado, 0) AS saldo,
              CASE
                WHEN COALESCE(pg.total_pagado, 0) <= 0 THEN 'pendiente'
                WHEN COALESCE(pg.total_pagado, 0) >= d.monto THEN 'pagada'
                ELSE 'parcial'
              END AS estado
       FROM club_deudas d
       LEFT JOIN partidos p ON p.id = d.partido_id
       LEFT JOIN equipos_torneo el ON el.id = p.equipo_local_id
       LEFT JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       LEFT JOIN clubes cl ON cl.id = el.club_id
       LEFT JOIN clubes cv ON cv.id = ev.club_id
       LEFT JOIN LATERAL (
         SELECT SUM(monto) AS total_pagado FROM club_pagos WHERE deuda_id = d.id
       ) pg ON true
       WHERE d.torneo_id = $1 AND d.club_id = $2
       ORDER BY d.creado_at DESC`,
      [req.params.torneoId, req.params.clubId]
    );
    res.json({ ok: true, deudas: rows });
  } catch (err) {
    console.error('Error en GET deudas de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== PAGOS =====

// GET /liga/cobros/:torneoId/pagos — listado de pagos registrados (para
// revisar/analizar), con filtros opcionales por club_id y tipo de concepto.
router.get('/:torneoId/pagos', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const params = [req.params.torneoId];
    let filtro = '';
    if (req.query.club_id) {
      params.push(req.query.club_id);
      filtro += ` AND d.club_id = $${params.length}`;
    }
    if (req.query.tipo && TIPOS_VALIDOS.includes(req.query.tipo)) {
      params.push(req.query.tipo);
      filtro += ` AND d.tipo = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT pg.*, d.tipo, d.descripcion AS deuda_descripcion, d.monto AS deuda_monto,
              c.id AS club_id, c.nombre AS club_nombre
       FROM club_pagos pg
       JOIN club_deudas d ON d.id = pg.deuda_id
       JOIN clubes c ON c.id = d.club_id
       WHERE d.torneo_id = $1${filtro}
       ORDER BY pg.fecha DESC, pg.creado_at DESC`,
      params
    );
    res.json({ ok: true, pagos: rows });
  } catch (err) {
    console.error('Error en GET pagos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/cobros/:torneoId/pagos — registra un pago contra una deuda
// puntual. Soporta pagos parciales: no exige que el monto cubra el saldo
// total, pero no deja pagar de más (no puede superar el saldo pendiente).
router.post('/:torneoId/pagos', async (req, res) => {
  const { deuda_id, monto, fecha, comentario } = req.body;
  if (!deuda_id || monto == null || Number(monto) <= 0) {
    return res.status(400).json({ ok: false, error: 'Faltan deuda_id y/o un monto válido' });
  }
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const deudaResult = await query(
      `SELECT d.*, COALESCE(pg.total_pagado, 0) AS total_pagado
       FROM club_deudas d
       LEFT JOIN LATERAL (SELECT SUM(monto) AS total_pagado FROM club_pagos WHERE deuda_id = d.id) pg ON true
       WHERE d.id = $1 AND d.torneo_id = $2`,
      [deuda_id, req.params.torneoId]
    );
    const deuda = deudaResult.rows[0];
    if (!deuda) return res.status(404).json({ ok: false, error: 'Deuda no encontrada en este torneo' });

    const saldo = Number(deuda.monto) - Number(deuda.total_pagado);
    if (Number(monto) > saldo + 0.009) {
      return res.status(400).json({ ok: false, error: `El pago (${monto}) supera el saldo pendiente de esta deuda (${saldo.toFixed(2)})` });
    }

    const { rows } = await query(
      `INSERT INTO club_pagos (deuda_id, monto, fecha, comentario, creado_por)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, $5)
       RETURNING *`,
      [deuda_id, monto, fecha || null, comentario || null, req.usuario.id]
    );
    res.status(201).json({ ok: true, pago: rows[0], saldo_restante: saldo - Number(monto) });
  } catch (err) {
    console.error('Error en POST pago:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/cobros/:torneoId/pagos/:pagoId — anula un pago mal cargado.
router.delete('/:torneoId/pagos/:pagoId', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rowCount } = await query(
      `DELETE FROM club_pagos pg USING club_deudas d
       WHERE pg.id = $1 AND pg.deuda_id = d.id AND d.torneo_id = $2`,
      [req.params.pagoId, req.params.torneoId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Pago no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE pago:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
