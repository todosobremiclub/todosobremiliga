const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).
//
// Este archivo existe para que el Panel Club sepa en qué Ligas participa SU
// club (vía club_liga) y así pueda armar el desplegable de "a qué Liga le
// pido el fichaje". Una vez que el club_admin elige una Liga, el frontend
// usa las rutas PÚBLICAS de /web/... (que ya existen) para traer los
// torneos y categorías de esa Liga, sin necesitar más rutas nuevas acá.

// GET /club/ligas — Ligas en las que participa mi club (activas)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT l.id, l.nombre, l.slug
       FROM club_liga cl
       JOIN ligas l ON l.id = cl.liga_id
       WHERE cl.club_id = $1 AND cl.activo = TRUE AND l.activo = TRUE
       ORDER BY l.nombre ASC`,
      [req.clubId]
    );
    res.json({ ok: true, ligas: rows });
  } catch (err) {
    console.error('Error en GET /club/ligas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
