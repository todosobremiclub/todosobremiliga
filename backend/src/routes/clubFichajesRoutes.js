const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).

// GET /club/fichajes — todas las solicitudes de fichaje de MI club
// (para ver el estado: pendiente / aprobado / rechazado)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT f.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
              l.nombre AS liga_nombre, t.nombre AS torneo_nombre,
              c.codigo_qr AS carnet_codigo_qr, c.vigente_desde AS carnet_vigente_desde,
              c.vigente_hasta AS carnet_vigente_hasta, c.activo AS carnet_activo
       FROM fichajes f
       JOIN jugadores j ON j.id = f.jugador_id
       JOIN ligas l ON l.id = f.liga_id
       LEFT JOIN torneos t ON t.id = f.torneo_id
       LEFT JOIN carnets c ON c.fichaje_id = f.id
       WHERE f.club_id = $1
       ORDER BY f.fecha_solicitud DESC`,
      [req.clubId]
    );
    res.json({ ok: true, fichajes: rows });
  } catch (err) {
    console.error('Error en GET /club/fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/jugadores/:jugadorId/fichajes — solicitar la habilitación de un
// jugador ante una Liga (requiere indicar en qué torneo/categoría se lo va a
// inscribir, porque de ahí sale el carnet una vez aprobado).
router.post('/:jugadorId/fichajes', async (req, res) => {
  const { liga_id, torneo_id, categoria_id, documentos } = req.body;

  if (!liga_id || !torneo_id) {
    return res.status(400).json({ ok: false, error: 'Faltan liga_id y/o torneo_id' });
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

    const { rows } = await query(
      `INSERT INTO fichajes (jugador_id, club_id, liga_id, torneo_id, categoria_id, documentos)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, '[]'::jsonb))
       RETURNING *`,
      [req.params.jugadorId, req.clubId, liga_id, torneo_id, categoria_id || null,
       documentos ? JSON.stringify(documentos) : null]
    );
    res.status(201).json({ ok: true, fichaje: rows[0] });
  } catch (err) {
    console.error('Error en POST fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
