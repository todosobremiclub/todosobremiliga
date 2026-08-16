const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).
// Solo lectura: los datos de marca (nombre, logo, colores) los define el
// Super Admin. Esto le sirve al Panel Liga para pintar su propio header con
// los colores reales de la Liga.

// GET /liga/perfil — datos de MI Liga
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, slug, logo_url, direccion, telefono, email_contacto,
              color_primario, color_secundario, color_acento
       FROM ligas WHERE id = $1`,
      [req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en GET /liga/perfil:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
