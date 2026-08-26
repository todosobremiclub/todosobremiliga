const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { query, getClient } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// Dado un conjunto de filas de fichajes ya traídas (paginadas o no), calcula
// "otros_fichajes_mismo_dni" (el mismo DNI fichado en otro torneo/categoría/
// subcategoría de la Liga) con UNA sola consulta adicional, acotada a los
// DNIs de ESAS filas — no a toda la Liga. Antes esto era una sub-consulta
// correlacionada dentro del SELECT principal (una vuelta completa a
// fichajes/jugadores POR CADA FILA), que con muchos fichajes cargados
// (ej. una prueba de volumen) tardaba decenas de segundos; con esta versión
// el costo no depende de cuántos fichajes tenga la Liga en total, sólo de
// cuántas filas se están mostrando.
async function agregarOtrosFichajesMismoDni(ligaId, filas) {
  const dnis = [...new Set(filas.map((f) => f.jugador_dni).filter(Boolean))];
  if (!dnis.length) return filas;

  const { rows: coincidencias } = await query(
    `SELECT j2.dni, f2.id AS fichaje_id, f2.torneo_id, f2.categoria_id, f2.subcategoria_id, f2.estado,
            t2.nombre AS torneo_nombre, cat2.nombre AS categoria_nombre, sub2.nombre AS subcategoria_nombre,
            c2.id AS club_id, c2.nombre AS club_nombre
     FROM fichajes f2
     JOIN jugadores j2 ON j2.id = f2.jugador_id
     JOIN clubes c2 ON c2.id = f2.club_id
     JOIN torneos t2 ON t2.id = f2.torneo_id
     LEFT JOIN categorias cat2 ON cat2.id = f2.categoria_id
     LEFT JOIN categoria_subcategorias sub2 ON sub2.id = f2.subcategoria_id
     WHERE f2.liga_id = $1
       AND f2.estado IN ('pendiente', 'aprobado')
       AND j2.dni = ANY($2::text[])`,
    [ligaId, dnis]
  );

  const porDni = {};
  coincidencias.forEach((c) => {
    if (!porDni[c.dni]) porDni[c.dni] = [];
    porDni[c.dni].push(c);
  });

  return filas.map((f) => {
    const otros = (porDni[f.jugador_dni] || []).filter((c) =>
      c.fichaje_id !== f.id &&
      (c.torneo_id !== f.torneo_id || c.categoria_id !== f.categoria_id || c.subcategoria_id !== f.subcategoria_id)
    );
    return {
      ...f,
      otros_fichajes_mismo_dni: otros.length
        ? otros.map((o) => ({
            torneo_id: o.torneo_id, torneo_nombre: o.torneo_nombre,
            categoria_nombre: o.categoria_nombre, subcategoria_nombre: o.subcategoria_nombre,
            club_id: o.club_id, club_nombre: o.club_nombre, estado: o.estado
          }))
        : null
    };
  });
}

// GET /liga/fichajes?estado=pendiente&torneo_id=...&categoria_id=...&club_id=... —
// solicitudes de fichaje de MI liga, paginado (25 por página por defecto,
// máximo 100). Se puede filtrar por estado, torneo, división y/o club.
// ?todos=true trae hasta 1000 sin paginar (para casos como el globito de
// pendientes o "fichajes de este club", donde se necesita el conjunto
// completo, no una página).
router.get('/', async (req, res) => {
  const { estado, torneo_id, categoria_id, subcategoria_id, club_id } = req.query;
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(100, Math.max(1, parseInt(req.query.por_pagina, 10) || 25));
    const offset = (pagina - 1) * porPagina;
    const todos = req.query.todos === 'true';

    const params = [req.ligaId];
    let filtros = '';
    if (estado) {
      params.push(estado);
      filtros += ` AND f.estado = $${params.length}`;
    }
    if (torneo_id) {
      params.push(torneo_id);
      filtros += ` AND f.torneo_id = $${params.length}`;
    }
    if (categoria_id) {
      params.push(categoria_id);
      filtros += ` AND f.categoria_id = $${params.length}`;
    }
    if (subcategoria_id) {
      params.push(subcategoria_id);
      filtros += ` AND f.subcategoria_id = $${params.length}`;
    }
    if (club_id) {
      params.push(club_id);
      filtros += ` AND f.club_id = $${params.length}`;
    }

    const baseSelect = `
      SELECT f.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
             j.foto_url AS jugador_foto_url, j.fecha_nacimiento AS jugador_fecha_nacimiento, j.activo AS jugador_activo,
             c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
             t.nombre AS torneo_nombre, cat.nombre AS categoria_nombre, sub.nombre AS subcategoria_nombre,
             car.codigo_qr AS carnet_codigo_qr, car.vigente_desde AS carnet_vigente_desde,
             car.vigente_hasta AS carnet_vigente_hasta, car.activo AS carnet_activo
      FROM fichajes f
      JOIN jugadores j ON j.id = f.jugador_id
      JOIN clubes c ON c.id = f.club_id
      LEFT JOIN torneos t ON t.id = f.torneo_id
      LEFT JOIN categorias cat ON cat.id = f.categoria_id
      LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
      LEFT JOIN carnets car ON car.fichaje_id = f.id
      WHERE f.liga_id = $1${filtros}
      ORDER BY f.fecha_solicitud DESC
    `;

    if (todos) {
      // Sin tope realista de "cuántos fichajes puede tener una Liga" (con
      // pruebas de volumen puede haber decenas de miles), pero con un techo
      // de todos modos para no arriesgarse a traer una cantidad ilimitada
      // por error de uso.
      const { rows } = await query(`${baseSelect} LIMIT 50000`, params);
      const fichajes = await agregarOtrosFichajesMismoDni(req.ligaId, rows);
      return res.json({ ok: true, fichajes, total: fichajes.length, todos: true });
    }

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total FROM fichajes f WHERE f.liga_id = $1${filtros}`,
      params
    );

    params.push(porPagina, offset);
    const { rows } = await query(
      `${baseSelect} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const fichajes = await agregarOtrosFichajesMismoDni(req.ligaId, rows);

    res.json({
      ok: true,
      fichajes,
      total: totalResult.rows[0].total,
      pagina,
      por_pagina: porPagina
    });
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
