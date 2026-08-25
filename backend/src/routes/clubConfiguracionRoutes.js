const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Configuración propia del Club: listas de "Actividades" (ej: Fútbol,
// Vóley, Handball) y "Categorías de socio" (ej: Infantil, Cadete, Mayor)
// que después aparecen como desplegable tanto al cargar un jugador a mano
// (Panel Club) como en el formulario público de autorregistro de socios
// (QR/link). Todas las rutas usan req.clubId (calculado por resolveClubId).

// GET /club/configuracion/mi-club — el propio club_id (resuelto por
// resolveClubId a partir de la sesión), para que el frontend pueda armar el
// link público de autorregistro de socios sin tener que andar exponiéndolo
// en otro lado.
router.get('/mi-club', async (req, res) => {
  res.json({ ok: true, club_id: req.clubId });
});

// ===== ACTIVIDADES =====

// GET /club/configuracion/actividades
router.get('/actividades', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM club_actividades WHERE club_id = $1 ORDER BY nombre ASC',
      [req.clubId]
    );
    res.json({ ok: true, actividades: rows });
  } catch (err) {
    console.error('Error en GET /club/configuracion/actividades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/configuracion/actividades
router.post('/actividades', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO club_actividades (club_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.clubId, nombre.trim()]
    );
    res.status(201).json({ ok: true, actividad: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe una actividad llamada "${nombre}"` });
    }
    console.error('Error en POST /club/configuracion/actividades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /club/configuracion/actividades/:id/activo
router.patch('/actividades/:id/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      'UPDATE club_actividades SET activo = $1 WHERE id = $2 AND club_id = $3 RETURNING *',
      [activo, req.params.id, req.clubId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Actividad no encontrada en tu club' });
    res.json({ ok: true, actividad: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /club/configuracion/actividades/:id/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /club/configuracion/actividades/:id
router.delete('/actividades/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM club_actividades WHERE id = $1 AND club_id = $2',
      [req.params.id, req.clubId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Actividad no encontrada en tu club' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /club/configuracion/actividades/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== CATEGORÍAS DE SOCIO =====

// GET /club/configuracion/categorias
router.get('/categorias', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM club_categorias_socio WHERE club_id = $1 ORDER BY nombre ASC',
      [req.clubId]
    );
    res.json({ ok: true, categorias: rows });
  } catch (err) {
    console.error('Error en GET /club/configuracion/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/configuracion/categorias
router.post('/categorias', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  }
  try {
    const { rows } = await query(
      'INSERT INTO club_categorias_socio (club_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.clubId, nombre.trim()]
    );
    res.status(201).json({ ok: true, categoria: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe una categoría llamada "${nombre}"` });
    }
    console.error('Error en POST /club/configuracion/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /club/configuracion/categorias/:id/activo
router.patch('/categorias/:id/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      'UPDATE club_categorias_socio SET activo = $1 WHERE id = $2 AND club_id = $3 RETURNING *',
      [activo, req.params.id, req.clubId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu club' });
    res.json({ ok: true, categoria: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /club/configuracion/categorias/:id/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /club/configuracion/categorias/:id
router.delete('/categorias/:id', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM club_categorias_socio WHERE id = $1 AND club_id = $2',
      [req.params.id, req.clubId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu club' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /club/configuracion/categorias/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
