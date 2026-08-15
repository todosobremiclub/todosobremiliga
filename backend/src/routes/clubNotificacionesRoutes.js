const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js) y
// req.usuario.id (para saber qué notificaciones ya leyó este usuario).
//
// Un club puede participar en varias Ligas (vía club_liga), así que acá se
// traen las notificaciones de TODAS las Ligas activas en las que participa,
// ya sean dirigidas puntualmente a mi club (n.club_id = mi club) o generales
// para todos los clubes de esa Liga (n.club_id IS NULL).

// GET /club/notificaciones — notificaciones recibidas por mi club
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.*, l.nombre AS liga_nombre,
              (nl.id IS NOT NULL) AS leida
       FROM notificaciones n
       JOIN ligas l ON l.id = n.liga_id
       JOIN club_liga cl ON cl.liga_id = n.liga_id AND cl.club_id = $1 AND cl.activo = TRUE
       LEFT JOIN notificaciones_lecturas nl ON nl.notificacion_id = n.id AND nl.usuario_id = $2
       WHERE n.club_id = $1 OR n.club_id IS NULL
       ORDER BY n.creado_at DESC`,
      [req.clubId, req.usuario.id]
    );
    res.json({ ok: true, notificaciones: rows });
  } catch (err) {
    console.error('Error en GET /club/notificaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /club/notificaciones/:notificacionId/leida — marcar como leída (por MI usuario)
router.patch('/:notificacionId/leida', async (req, res) => {
  try {
    const notif = await query(
      `SELECT n.id FROM notificaciones n
       JOIN club_liga cl ON cl.liga_id = n.liga_id AND cl.club_id = $1 AND cl.activo = TRUE
       WHERE n.id = $2 AND (n.club_id = $1 OR n.club_id IS NULL)`,
      [req.clubId, req.params.notificacionId]
    );
    if (!notif.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Notificación no encontrada para tu club' });
    }

    await query(
      `INSERT INTO notificaciones_lecturas (notificacion_id, usuario_id)
       VALUES ($1, $2)
       ON CONFLICT (notificacion_id, usuario_id) DO NOTHING`,
      [req.params.notificacionId, req.usuario.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PATCH /club/notificaciones/:notificacionId/leida:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
