const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/notificaciones — notificaciones enviadas por mi Liga
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.*, c.nombre AS club_nombre
       FROM notificaciones n
       LEFT JOIN clubes c ON c.id = n.club_id
       WHERE n.liga_id = $1
       ORDER BY n.creado_at DESC`,
      [req.ligaId]
    );
    res.json({ ok: true, notificaciones: rows });
  } catch (err) {
    console.error('Error en GET /liga/notificaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/notificaciones — enviar una notificación a un club puntual o a
// todos los clubes de la Liga (club_id ausente/null = para todos).
router.post('/', async (req, res) => {
  const { titulo, mensaje, tipo, club_id } = req.body;

  if (!titulo || !titulo.trim() || !mensaje || !mensaje.trim()) {
    return res.status(400).json({ ok: false, error: 'Faltan título y/o mensaje' });
  }

  try {
    if (club_id) {
      const clubEnMiLiga = await query(
        'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
        [club_id, req.ligaId]
      );
      if (!clubEnMiLiga.rows[0]) {
        return res.status(404).json({ ok: false, error: 'Ese club no participa en tu Liga' });
      }
    }

    const { rows } = await query(
      `INSERT INTO notificaciones (liga_id, club_id, titulo, mensaje, tipo, enviado_por)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'general'), $6)
       RETURNING *`,
      [req.ligaId, club_id || null, titulo.trim(), mensaje.trim(), tipo || null, req.usuario.id]
    );
    res.status(201).json({ ok: true, notificacion: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/notificaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
