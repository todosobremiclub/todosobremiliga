const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).
// Documentos del propio Club: los puede ver y subir el club_admin, y también
// los puede ver/subir la Liga desde su Panel (ver ligaClubesRoutes.js). No
// está atado a una Liga en particular — es la documentación del Club.

// GET /club/documentos
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM club_documentos WHERE club_id = $1 ORDER BY creado_at DESC',
      [req.clubId]
    );
    res.json({ ok: true, documentos: rows });
  } catch (err) {
    console.error('Error en GET /club/documentos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/documentos — el club_admin sube un documento de su propio club
router.post('/', async (req, res) => {
  const { nombre, archivo_url } = req.body;
  if (!nombre || !nombre.trim() || !archivo_url) {
    return res.status(400).json({ ok: false, error: 'Faltan nombre y/o archivo' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO club_documentos (club_id, nombre, archivo_url, subido_por_rol, subido_por_id)
       VALUES ($1, $2, $3, 'club', $4)
       RETURNING *`,
      [req.clubId, nombre.trim(), archivo_url, req.usuario.id]
    );
    res.status(201).json({ ok: true, documento: rows[0] });
  } catch (err) {
    console.error('Error en POST /club/documentos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /club/documentos/:documentoId — el club solo puede borrar los que subió él mismo
// (los que subió la Liga se administran desde el Panel Liga).
router.delete('/:documentoId', async (req, res) => {
  try {
    const { rowCount } = await query(
      `DELETE FROM club_documentos WHERE id = $1 AND club_id = $2 AND subido_por_rol = 'club'`,
      [req.params.documentoId, req.clubId]
    );
    if (!rowCount) {
      return res.status(404).json({ ok: false, error: 'Documento no encontrado, o fue subido por la Liga' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /club/documentos/:documentoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
