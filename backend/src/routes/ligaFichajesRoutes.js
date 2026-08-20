const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/fichajes?estado=pendiente&torneo_id=...&categoria_id=... —
// solicitudes de fichaje de MI liga (por defecto trae todas; se puede
// filtrar por estado, torneo y/o categoría)
router.get('/', async (req, res) => {
  const { estado, torneo_id, categoria_id } = req.query;
  try {
    let sql = `
      SELECT f.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
             j.foto_url AS jugador_foto_url, j.fecha_nacimiento AS jugador_fecha_nacimiento, j.activo AS jugador_activo,
             c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
             t.nombre AS torneo_nombre, cat.nombre AS categoria_nombre,
             car.codigo_qr AS carnet_codigo_qr, car.vigente_desde AS carnet_vigente_desde,
             car.vigente_hasta AS carnet_vigente_hasta, car.activo AS carnet_activo
      FROM fichajes f
      JOIN jugadores j ON j.id = f.jugador_id
      JOIN clubes c ON c.id = f.club_id
      LEFT JOIN torneos t ON t.id = f.torneo_id
      LEFT JOIN categorias cat ON cat.id = f.categoria_id
      LEFT JOIN carnets car ON car.fichaje_id = f.id
      WHERE f.liga_id = $1
    `;
    const params = [req.ligaId];
    if (estado) {
      params.push(estado);
      sql += ` AND f.estado = $${params.length}`;
    }
    if (torneo_id) {
      params.push(torneo_id);
      sql += ` AND f.torneo_id = $${params.length}`;
    }
    if (categoria_id) {
      params.push(categoria_id);
      sql += ` AND f.categoria_id = $${params.length}`;
    }
    sql += ' ORDER BY f.fecha_solicitud DESC';

    const { rows } = await query(sql, params);
    res.json({ ok: true, fichajes: rows });
  } catch (err) {
    console.error('Error en GET /liga/fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/fichajes/:fichajeId/aprobar — aprueba el fichaje y genera
// automáticamente el carnet digital del jugador para ese torneo.
router.patch('/:fichajeId/aprobar', async (req, res) => {
  try {
    const fichajeResult = await query(
      'SELECT * FROM fichajes WHERE id = $1 AND liga_id = $2',
      [req.params.fichajeId, req.ligaId]
    );
    const fichaje = fichajeResult.rows[0];
    if (!fichaje) return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu Liga' });
    if (fichaje.estado === 'aprobado') {
      return res.status(409).json({ ok: false, error: 'Ese fichaje ya estaba aprobado' });
    }

    const actualizado = await query(
      `UPDATE fichajes SET estado = 'aprobado', aprobado_por = $1, fecha_resolucion = NOW(), motivo_rechazo = NULL
       WHERE id = $2 RETURNING *`,
      [req.usuario.id, req.params.fichajeId]
    );

    // Genera el carnet digital, si todavía no existe uno para este fichaje.
    const carnetExistente = await query('SELECT * FROM carnets WHERE fichaje_id = $1', [req.params.fichajeId]);
    let carnet = carnetExistente.rows[0];
    if (!carnet) {
      const codigoQr = crypto.randomUUID();
      const carnetResult = await query(
        `INSERT INTO carnets (jugador_id, torneo_id, fichaje_id, codigo_qr)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [fichaje.jugador_id, fichaje.torneo_id, req.params.fichajeId, codigoQr]
      );
      carnet = carnetResult.rows[0];
    }

    res.json({ ok: true, fichaje: actualizado.rows[0], carnet });
  } catch (err) {
    console.error('Error en PATCH aprobar fichaje:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/fichajes/:fichajeId/rechazar
router.patch('/:fichajeId/rechazar', async (req, res) => {
  const { motivo_rechazo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE fichajes SET estado = 'rechazado', motivo_rechazo = $1, fecha_resolucion = NOW(), aprobado_por = $2
       WHERE id = $3 AND liga_id = $4
       RETURNING *`,
      [motivo_rechazo || null, req.usuario.id, req.params.fichajeId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu Liga' });
    res.json({ ok: true, fichaje: rows[0] });
  } catch (err) {
    console.error('Error en PATCH rechazar fichaje:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
