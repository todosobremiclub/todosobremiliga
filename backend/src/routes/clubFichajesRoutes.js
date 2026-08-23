const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).

// GET /club/fichajes?torneo_id=...&categoria_id=... — todas las solicitudes
// de fichaje de MI club (para ver el estado: pendiente / aprobado /
// rechazado), opcionalmente filtradas por torneo y/o división
router.get('/', async (req, res) => {
  const { liga_id, torneo_id, categoria_id, subcategoria_id } = req.query;
  try {
    const params = [req.clubId];
    let filtros = '';
    if (liga_id) {
      params.push(liga_id);
      filtros += ` AND f.liga_id = $${params.length}`;
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
    const { rows } = await query(
      `SELECT f.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
              j.foto_url AS jugador_foto_url, j.fecha_nacimiento AS jugador_fecha_nacimiento,
              cl.nombre AS club_nombre, cl.logo_url AS club_logo_url, cl.color_primario AS club_color_primario,
              l.nombre AS liga_nombre, t.nombre AS torneo_nombre, cat.nombre AS categoria_nombre,
              sub.nombre AS subcategoria_nombre,
              c.codigo_qr AS carnet_codigo_qr, c.vigente_desde AS carnet_vigente_desde,
              c.vigente_hasta AS carnet_vigente_hasta, c.activo AS carnet_activo
       FROM fichajes f
       JOIN jugadores j ON j.id = f.jugador_id
       JOIN clubes cl ON cl.id = f.club_id
       JOIN ligas l ON l.id = f.liga_id
       LEFT JOIN torneos t ON t.id = f.torneo_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
       LEFT JOIN carnets c ON c.fichaje_id = f.id
       WHERE f.club_id = $1${filtros}
       ORDER BY f.fecha_solicitud DESC`,
      params
    );
    res.json({ ok: true, fichajes: rows });
  } catch (err) {
    console.error('Error en GET /club/fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/jugadores/:jugadorId/fichajes — solicitar la habilitación de un
// jugador ante una Liga. El fichaje es SIEMPRE por división puntual dentro
// de un torneo (un torneo puede tener varias divisiones — ej. Baby Fútbol
// con Sub 8, Sub 10, Sub 12 — y hay que fichar para la división exacta en
// la que va a jugar), porque de ahí sale el carnet una vez aprobado.
router.post('/:jugadorId/fichajes', async (req, res) => {
  const { liga_id, torneo_id, categoria_id, subcategoria_id, documentos } = req.body;

  if (!liga_id || !torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan liga_id, torneo_id y/o categoria_id' });
  }

  try {
    const jugador = await query(
      'SELECT 1 FROM jugadores WHERE id = $1 AND club_id = $2',
      [req.params.jugadorId, req.clubId]
    );
    if (!jugador.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Jugador no encontrado en tu club' });
    }

    const clubEnLiga = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2 AND activo = TRUE',
      [req.clubId, liga_id]
    );
    if (!clubEnLiga.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Tu club no participa en esa Liga' });
    }

    const torneo = await query(
      'SELECT 1 FROM torneos WHERE id = $1 AND liga_id = $2',
      [torneo_id, liga_id]
    );
    if (!torneo.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Ese torneo no pertenece a la Liga indicada' });
    }

    const categoria = await query(
      'SELECT 1 FROM categorias WHERE id = $1 AND torneo_id = $2',
      [categoria_id, torneo_id]
    );
    if (!categoria.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Esa división no pertenece al torneo indicado' });
    }

    if (subcategoria_id) {
      const subcategoria = await query(
        'SELECT 1 FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2',
        [subcategoria_id, categoria_id]
      );
      if (!subcategoria.rows[0]) {
        return res.status(404).json({ ok: false, error: 'Esa categoría no pertenece a la división indicada' });
      }
    }

    // No permitir dos solicitudes de fichaje vigentes (pendiente o aprobado)
    // para el mismo jugador en el mismo torneo.
    const yaFichado = await query(
      `SELECT 1 FROM fichajes
       WHERE jugador_id = $1 AND torneo_id = $2 AND estado IN ('pendiente', 'aprobado')`,
      [req.params.jugadorId, torneo_id]
    );
    if (yaFichado.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: 'Ese jugador ya tiene una solicitud de fichaje pendiente o aprobada en ese torneo',
      });
    }

    // Aviso informativo (no bloqueante): mismo DNI ya fichado en OTRO torneo
    // Y/O en OTRA división/categoría de la misma Liga. Sirve para que la
    // Liga detecte un jugador que se quiere fichar por más de un club, o en
    // más de una división/categoría, dentro de su misma Liga.
    const { rows: otrosFichajes } = await query(
      `SELECT f.id, f.estado, f.torneo_id, t.nombre AS torneo_nombre,
              cat.nombre AS categoria_nombre, sub.nombre AS subcategoria_nombre,
              cl.id AS club_id, cl.nombre AS club_nombre
       FROM fichajes f
       JOIN jugadores j ON j.id = f.jugador_id
       JOIN torneos t ON t.id = f.torneo_id
       JOIN clubes cl ON cl.id = f.club_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
       WHERE j.dni = (SELECT dni FROM jugadores WHERE id = $1)
         AND f.liga_id = $2
         AND f.estado IN ('pendiente', 'aprobado')`,
      [req.params.jugadorId, liga_id]
    );

    const { rows } = await query(
      `INSERT INTO fichajes (jugador_id, club_id, liga_id, torneo_id, categoria_id, subcategoria_id, documentos)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '[]'::jsonb))
       RETURNING *`,
      [req.params.jugadorId, req.clubId, liga_id, torneo_id, categoria_id, subcategoria_id || null,
       documentos ? JSON.stringify(documentos) : null]
    );
    res.status(201).json({
      ok: true,
      fichaje: rows[0],
      aviso_otros_fichajes: otrosFichajes.length ? otrosFichajes : undefined,
    });
  } catch (err) {
    console.error('Error en POST fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
