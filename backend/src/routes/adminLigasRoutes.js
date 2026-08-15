const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { slugify } = require('../utils/slugify');

// Todas las rutas de este archivo ya están protegidas con requireAuth +
// requireRole('super_admin') desde donde se montan en app.js.

// GET /admin/ligas — listado completo (incluye inactivas, para que el Super
// Admin pueda reactivarlas si hace falta)
router.get('/', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, slug, logo_url, direccion, telefono, email_contacto,
              color_primario, color_secundario, activo, creado_at
       FROM ligas
       ORDER BY nombre ASC`
    );
    res.json({ ok: true, ligas: rows });
  } catch (err) {
    console.error('Error en GET /admin/ligas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /admin/ligas/:id — detalle de una liga
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM ligas WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en GET /admin/ligas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /admin/ligas — alta de una nueva Liga
router.post('/', async (req, res) => {
  const {
    nombre, slug, logo_url, direccion, telefono,
    email_contacto, color_primario, color_secundario
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre de la Liga es obligatorio' });
  }

  const slugFinal = (slug && slug.trim()) ? slugify(slug) : slugify(nombre);

  try {
    const { rows } = await query(
      `INSERT INTO ligas (nombre, slug, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [nombre.trim(), slugFinal, logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null]
    );
    res.status(201).json({ ok: true, liga: rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation (slug repetido)
      return res.status(409).json({ ok: false, error: `Ya existe una Liga con el slug "${slugFinal}"` });
    }
    console.error('Error en POST /admin/ligas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /admin/ligas/:id — edición de una Liga existente
router.put('/:id', async (req, res) => {
  const {
    nombre, slug, logo_url, direccion, telefono,
    email_contacto, color_primario, color_secundario
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre de la Liga es obligatorio' });
  }

  const slugFinal = (slug && slug.trim()) ? slugify(slug) : slugify(nombre);

  try {
    const { rows } = await query(
      `UPDATE ligas SET
         nombre = $1, slug = $2, logo_url = $3, direccion = $4, telefono = $5,
         email_contacto = $6, color_primario = $7, color_secundario = $8,
         actualizado_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [nombre.trim(), slugFinal, logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe una Liga con el slug "${slugFinal}"` });
    }
    console.error('Error en PUT /admin/ligas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /admin/ligas/:id/activo — activar o desactivar una Liga
// (no se borra nunca una Liga de la base, solo se desactiva)
router.patch('/:id/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      'UPDATE ligas SET activo = $1, actualizado_at = NOW() WHERE id = $2 RETURNING *',
      [activo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /admin/ligas/:id/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
