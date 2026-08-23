const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { query, getClient } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/fichajes?estado=pendiente&torneo_id=...&categoria_id=...&club_id=... —
// solicitudes de fichaje de MI liga (por defecto trae todas; se puede
// filtrar por estado, torneo, división y/o club)
router.get('/', async (req, res) => {
  const { estado, torneo_id, categoria_id, subcategoria_id, club_id } = req.query;
  try {
    let sql = `
      SELECT f.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
             j.foto_url AS jugador_foto_url, j.fecha_nacimiento AS jugador_fecha_nacimiento, j.activo AS jugador_activo,
             c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
             t.nombre AS torneo_nombre, cat.nombre AS categoria_nombre, sub.nombre AS subcategoria_nombre,
             car.codigo_qr AS carnet_codigo_qr, car.vigente_desde AS carnet_vigente_desde,
             car.vigente_hasta AS carnet_vigente_hasta, car.activo AS carnet_activo,
             (
               SELECT json_agg(json_build_object(
                 'torneo_id', t2.id, 'torneo_nombre', t2.nombre,
                 'categoria_nombre', cat2.nombre, 'subcategoria_nombre', sub2.nombre,
                 'club_id', c2.id, 'club_nombre', c2.nombre,
                 'estado', f2.estado
               ))
               FROM fichajes f2
               JOIN torneos t2 ON t2.id = f2.torneo_id
               JOIN clubes c2 ON c2.id = f2.club_id
               LEFT JOIN categorias cat2 ON cat2.id = f2.categoria_id
               LEFT JOIN categoria_subcategorias sub2 ON sub2.id = f2.subcategoria_id
               WHERE f2.liga_id = f.liga_id
                 AND f2.id <> f.id
                 AND f2.estado IN ('pendiente', 'aprobado')
                 AND (
                   f2.torneo_id IS DISTINCT FROM f.torneo_id
                   OR f2.categoria_id IS DISTINCT FROM f.categoria_id
                   OR f2.subcategoria_id IS DISTINCT FROM f.subcategoria_id
                 )
                 AND EXISTS (
                   SELECT 1 FROM jugadores j2
                   WHERE j2.id = f2.jugador_id AND j2.dni = j.dni
                 )
             ) AS otros_fichajes_mismo_dni
      FROM fichajes f
      JOIN jugadores j ON j.id = f.jugador_id
      JOIN clubes c ON c.id = f.club_id
      LEFT JOIN torneos t ON t.id = f.torneo_id
      LEFT JOIN categorias cat ON cat.id = f.categoria_id
      LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
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
    if (subcategoria_id) {
      params.push(subcategoria_id);
      sql += ` AND f.subcategoria_id = $${params.length}`;
    }
    if (club_id) {
      params.push(club_id);
      sql += ` AND f.club_id = $${params.length}`;
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
//
// IMPORTANTE: va todo en una transacción. Antes, el UPDATE del estado y el
// INSERT del carnet eran dos consultas sueltas: si el fichaje no tenía
// torneo_id cargado (dato viejo/incompleto), el INSERT fallaba por la
// restricción NOT NULL de carnets.torneo_id, pero el UPDATE ya había
// quedado confirmado -> quedaba un fichaje "aprobado" sin carnet y sin
// forma de generarlo de nuevo salvo por SQL a mano. Con la transacción, si
// falla el carnet, se revierte también el cambio de estado.
router.patch('/:fichajeId/aprobar', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const fichajeResult = await client.query(
      'SELECT * FROM fichajes WHERE id = $1 AND liga_id = $2 FOR UPDATE',
      [req.params.fichajeId, req.ligaId]
    );
    const fichaje = fichajeResult.rows[0];
    if (!fichaje) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu Liga' });
    }
    if (fichaje.estado === 'aprobado') {
      await client.query('ROLLBACK');
      return res.status(409).json({ ok: false, error: 'Ese fichaje ya estaba aprobado' });
    }
    if (!fichaje.torneo_id || !fichaje.categoria_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        ok: false,
        error: 'Este fichaje no tiene Torneo y/o División asignados: completalos con "Editar" antes de aprobarlo.',
      });
    }

    const actualizado = await client.query(
      `UPDATE fichajes SET estado = 'aprobado', aprobado_por = $1, fecha_resolucion = NOW(), motivo_rechazo = NULL
       WHERE id = $2 RETURNING *`,
      [req.usuario.id, req.params.fichajeId]
    );

    // Genera el carnet digital, si todavía no existe uno para este fichaje.
    const carnetExistente = await client.query('SELECT * FROM carnets WHERE fichaje_id = $1', [req.params.fichajeId]);
    let carnet = carnetExistente.rows[0];
    if (!carnet) {
      const codigoQr = crypto.randomUUID();
      const carnetResult = await client.query(
        `INSERT INTO carnets (jugador_id, torneo_id, fichaje_id, codigo_qr)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [fichaje.jugador_id, fichaje.torneo_id, req.params.fichajeId, codigoQr]
      );
      carnet = carnetResult.rows[0];
    }
    await client.query('COMMIT');

    res.json({ ok: true, fichaje: actualizado.rows[0], carnet });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* noop */ }
    console.error('Error en PATCH aprobar fichaje:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PATCH /liga/fichajes/:fichajeId/generar-carnet — para un fichaje que ya
// quedó "aprobado" pero, por un dato viejo/incompleto, se quedó sin carnet
// (ver comentario arriba de /aprobar). Antes de usar esto hay que haber
// completado Torneo y División con "Editar".
router.patch('/:fichajeId/generar-carnet', async (req, res) => {
  try {
    const fichajeResult = await query('SELECT * FROM fichajes WHERE id = $1 AND liga_id = $2', [req.params.fichajeId, req.ligaId]);
    const fichaje = fichajeResult.rows[0];
    if (!fichaje) return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu Liga' });
    if (fichaje.estado !== 'aprobado') {
      return res.status(400).json({ ok: false, error: 'Sólo se puede generar el carnet de un fichaje aprobado' });
    }
    if (!fichaje.torneo_id || !fichaje.categoria_id) {
      return res.status(400).json({
        ok: false,
        error: 'Este fichaje no tiene Torneo y/o División asignados: completalos con "Editar" antes de generar el carnet.',
      });
    }
    const carnetExistente = await query('SELECT * FROM carnets WHERE fichaje_id = $1', [req.params.fichajeId]);
    if (carnetExistente.rows[0]) {
      return res.json({ ok: true, carnet: carnetExistente.rows[0] });
    }
    const codigoQr = crypto.randomUUID();
    const carnetResult = await query(
      `INSERT INTO carnets (jugador_id, torneo_id, fichaje_id, codigo_qr)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [fichaje.jugador_id, fichaje.torneo_id, req.params.fichajeId, codigoQr]
    );
    res.json({ ok: true, carnet: carnetResult.rows[0] });
  } catch (err) {
    console.error('Error en PATCH generar-carnet:', err);
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

// PUT /liga/fichajes/:fichajeId — la Liga corrige a qué torneo/división
// quedó fichado un jugador (por ejemplo, si el club se equivocó al pedirlo).
router.put('/:fichajeId', async (req, res) => {
  const { torneo_id, categoria_id, subcategoria_id } = req.body;
  if (!torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan torneo_id y/o categoria_id' });
  }
  try {
    const fichaje = await query('SELECT * FROM fichajes WHERE id = $1 AND liga_id = $2', [req.params.fichajeId, req.ligaId]);
    if (!fichaje.rows[0]) return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu Liga' });

    const contexto = await query(
      `SELECT 1 FROM categorias c JOIN torneos t ON t.id = c.torneo_id
       WHERE c.id = $1 AND c.torneo_id = $2 AND t.liga_id = $3`,
      [categoria_id, torneo_id, req.ligaId]
    );
    if (!contexto.rows[0]) {
      return res.status(400).json({ ok: false, error: 'Esa división no pertenece a ese torneo de tu Liga' });
    }

    if (subcategoria_id) {
      const subcontexto = await query(
        'SELECT 1 FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2',
        [subcategoria_id, categoria_id]
      );
      if (!subcontexto.rows[0]) {
        return res.status(400).json({ ok: false, error: 'Esa categoría no pertenece a esa división' });
      }
    }

    const { rows } = await query(
      `UPDATE fichajes SET torneo_id = $1, categoria_id = $2, subcategoria_id = $3 WHERE id = $4 AND liga_id = $5 RETURNING *`,
      [torneo_id, categoria_id, subcategoria_id || null, req.params.fichajeId, req.ligaId]
    );
    res.json({ ok: true, fichaje: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/fichajes/:fichajeId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/fichajes/:fichajeId — borra un fichaje puntual (y el carnet
// asociado, si ya se había generado al aprobarlo).
router.delete('/:fichajeId', async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const fichaje = await client.query('SELECT id FROM fichajes WHERE id = $1 AND liga_id = $2', [req.params.fichajeId, req.ligaId]);
    if (!fichaje.rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu Liga' });
    }
    await client.query('DELETE FROM carnets WHERE fichaje_id = $1', [req.params.fichajeId]);
    await client.query('DELETE FROM fichajes WHERE id = $1', [req.params.fichajeId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en DELETE /liga/fichajes/:fichajeId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// POST /liga/fichajes/eliminar-multiple — borrado masivo de fichajes (y sus
// carnets asociados), pensado para el checkbox de selección múltiple en el
// listado de fichajes del panel de Liga.
router.post('/eliminar-multiple', async (req, res) => {
  const { fichaje_ids } = req.body;
  if (!Array.isArray(fichaje_ids) || !fichaje_ids.length) {
    return res.status(400).json({ ok: false, error: 'Falta fichaje_ids (array)' });
  }
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const propios = await client.query(
      'SELECT id FROM fichajes WHERE id = ANY($1::uuid[]) AND liga_id = $2',
      [fichaje_ids, req.ligaId]
    );
    const idsPropios = propios.rows.map((r) => r.id);
    if (idsPropios.length) {
      await client.query('DELETE FROM carnets WHERE fichaje_id = ANY($1::uuid[])', [idsPropios]);
      await client.query('DELETE FROM fichajes WHERE id = ANY($1::uuid[])', [idsPropios]);
    }
    await client.query('COMMIT');
    res.json({ ok: true, eliminados: idsPropios.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /liga/fichajes/eliminar-multiple:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
