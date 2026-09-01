const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { slugify } = require('../utils/slugify');

// Todas las rutas de este archivo ya están protegidas con requireAuth +
// requireRole('super_admin') desde donde se montan en app.js.

const TIPOS_VALIDOS = ['productiva', 'demo'];
const ESTADOS_DEMO_VALIDOS = ['avanzado', 'pendiente', 'sin_respuesta', 'baja'];

// GET /admin/ligas?tipo=productiva|demo&q=texto — listado con filtros y
// cantidad de clubes cargados en cada Liga.
router.get('/', async (req, res) => {
  const { tipo, q } = req.query;

  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ ok: false, error: `Tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` });
  }

  const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
  const porPagina = Math.min(25, Math.max(1, parseInt(req.query.por_pagina, 10) || 25));
  const offset = (pagina - 1) * porPagina;

  try {
    const totalResult = await query(
      `SELECT COUNT(*)::int AS total FROM ligas l
       WHERE ($1::varchar IS NULL OR l.tipo = $1)
         AND ($2::text IS NULL OR l.nombre ILIKE '%' || $2 || '%')`,
      [tipo || null, q || null]
    );
    const { rows } = await query(
      `SELECT l.id, l.nombre, l.slug, l.logo_url, l.direccion, l.ciudad, l.provincia, l.telefono, l.email_contacto,
              l.color_primario, l.color_secundario, l.color_acento, l.activo, l.tipo, l.estado_demo,
              l.facebook_url, l.instagram_url, l.youtube_url,
              l.max_clubes, l.permite_usuarios_club,
              l.creado_at,
              COUNT(cl.club_id) AS cantidad_clubes
       FROM ligas l
       LEFT JOIN club_liga cl ON cl.liga_id = l.id
       WHERE ($1::varchar IS NULL OR l.tipo = $1)
         AND ($2::text IS NULL OR l.nombre ILIKE '%' || $2 || '%')
       GROUP BY l.id
       ORDER BY l.nombre ASC
       LIMIT $3 OFFSET $4`,
      [tipo || null, q || null, porPagina, offset]
    );
    res.json({ ok: true, ligas: rows, total: totalResult.rows[0].total, pagina, por_pagina: porPagina });
  } catch (err) {
    console.error('Error en GET /admin/ligas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /admin/ligas/:id — detalle de una Liga (para la vista de solo lectura)
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT l.*, COUNT(cl.club_id) AS cantidad_clubes
       FROM ligas l
       LEFT JOIN club_liga cl ON cl.liga_id = l.id
       WHERE l.id = $1
       GROUP BY l.id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en GET /admin/ligas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /admin/ligas — alta de una nueva Liga
// El slug SIEMPRE se genera automáticamente a partir del nombre (no se le
// pide al Super Admin que lo piense).
router.post('/', async (req, res) => {
  const {
    nombre, logo_url, direccion, ciudad, provincia, telefono, email_contacto,
    color_primario, color_secundario, color_acento, tipo, estado_demo,
    facebook_url, instagram_url, youtube_url, max_clubes, permite_usuarios_club
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre de la Liga es obligatorio' });
  }
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ ok: false, error: `Tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` });
  }
  if (estado_demo && !ESTADOS_DEMO_VALIDOS.includes(estado_demo)) {
    return res.status(400).json({ ok: false, error: `Estado DEMO inválido. Válidos: ${ESTADOS_DEMO_VALIDOS.join(', ')}` });
  }
  if (max_clubes !== undefined && max_clubes !== null && max_clubes !== '' && (!Number.isInteger(max_clubes) || max_clubes < 0)) {
    return res.status(400).json({ ok: false, error: 'El máximo de clubes tiene que ser un número entero de 0 o más (dejalo vacío para "sin límite")' });
  }

  const slugBase = slugify(nombre);

  try {
    // El slug es único: si ya existe, le agregamos un sufijo numérico.
    let slugFinal = slugBase;
    let intento = 1;
    while (true) {
      const existe = await query('SELECT 1 FROM ligas WHERE slug = $1', [slugFinal]);
      if (!existe.rows[0]) break;
      intento += 1;
      slugFinal = `${slugBase}-${intento}`;
    }

    const { rows } = await query(
      `INSERT INTO ligas (nombre, slug, logo_url, direccion, ciudad, provincia, telefono, email_contacto,
                           color_primario, color_secundario, color_acento, tipo, estado_demo,
                           facebook_url, instagram_url, youtube_url, max_clubes, permite_usuarios_club)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, 'productiva'), $13, $14, $15, $16, $17, COALESCE($18, TRUE))
       RETURNING *`,
      [nombre.trim(), slugFinal, logo_url || null, direccion || null, ciudad || null, provincia || null,
       telefono || null, email_contacto || null, color_primario || null, color_secundario || null,
       color_acento || null, tipo || null, estado_demo || null,
       facebook_url || null, instagram_url || null, youtube_url || null,
       (max_clubes === '' || max_clubes === undefined) ? null : max_clubes,
       permite_usuarios_club === undefined ? null : permite_usuarios_club]
    );
    res.status(201).json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en POST /admin/ligas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /admin/ligas/:id — edición de una Liga existente
// El slug se recalcula solo si cambió el nombre.
router.put('/:id', async (req, res) => {
  const {
    nombre, logo_url, direccion, ciudad, provincia, telefono, email_contacto,
    color_primario, color_secundario, color_acento, tipo, estado_demo,
    facebook_url, instagram_url, youtube_url, max_clubes, permite_usuarios_club
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre de la Liga es obligatorio' });
  }
  if (tipo && !TIPOS_VALIDOS.includes(tipo)) {
    return res.status(400).json({ ok: false, error: `Tipo inválido. Válidos: ${TIPOS_VALIDOS.join(', ')}` });
  }
  if (estado_demo && !ESTADOS_DEMO_VALIDOS.includes(estado_demo)) {
    return res.status(400).json({ ok: false, error: `Estado DEMO inválido. Válidos: ${ESTADOS_DEMO_VALIDOS.join(', ')}` });
  }
  if (max_clubes !== undefined && max_clubes !== null && max_clubes !== '' && (!Number.isInteger(max_clubes) || max_clubes < 0)) {
    return res.status(400).json({ ok: false, error: 'El máximo de clubes tiene que ser un número entero de 0 o más (dejalo vacío para "sin límite")' });
  }

  try {
    const actual = await query('SELECT nombre, slug FROM ligas WHERE id = $1', [req.params.id]);
    if (!actual.rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });

    let slugFinal = actual.rows[0].slug;
    if (nombre.trim() !== actual.rows[0].nombre) {
      const slugBase = slugify(nombre);
      slugFinal = slugBase;
      let intento = 1;
      while (true) {
        const existe = await query('SELECT 1 FROM ligas WHERE slug = $1 AND id != $2', [slugFinal, req.params.id]);
        if (!existe.rows[0]) break;
        intento += 1;
        slugFinal = `${slugBase}-${intento}`;
      }
    }

    const { rows } = await query(
      `UPDATE ligas SET
         nombre = $1, slug = $2, logo_url = $3, direccion = $4, ciudad = $5, provincia = $6, telefono = $7,
         email_contacto = $8, color_primario = $9, color_secundario = $10, color_acento = $11,
         tipo = COALESCE($12, tipo), estado_demo = $13,
         facebook_url = $14, instagram_url = $15, youtube_url = $16,
         max_clubes = $17, permite_usuarios_club = COALESCE($18, permite_usuarios_club),
         actualizado_at = NOW()
       WHERE id = $19
       RETURNING *`,
      [nombre.trim(), slugFinal, logo_url || null, direccion || null, ciudad || null, provincia || null,
       telefono || null, email_contacto || null, color_primario || null, color_secundario || null,
       color_acento || null, tipo || null, estado_demo || null,
       facebook_url || null, instagram_url || null, youtube_url || null,
       (max_clubes === '' || max_clubes === undefined) ? null : max_clubes,
       permite_usuarios_club === undefined ? null : permite_usuarios_club, req.params.id]
    );
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en PUT /admin/ligas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /admin/ligas/:id/activo — activar o desactivar una Liga
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

// PATCH /admin/ligas/:id/estado-demo — cambiar el estado de una Liga DEMO
router.patch('/:id/estado-demo', async (req, res) => {
  const { estado_demo } = req.body;
  if (!estado_demo || !ESTADOS_DEMO_VALIDOS.includes(estado_demo)) {
    return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${ESTADOS_DEMO_VALIDOS.join(', ')}` });
  }
  try {
    const { rows } = await query(
      `UPDATE ligas SET estado_demo = $1, actualizado_at = NOW()
       WHERE id = $2 AND tipo = 'demo'
       RETURNING *`,
      [estado_demo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga DEMO no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /admin/ligas/:id/estado-demo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /admin/ligas/:id — elimina la Liga y todo lo que cuelga de ella
// (clubes NO se borran: son una entidad global, solo se borra su relación
// con esta Liga vía la cascada de club_liga).
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM ligas WHERE id = $1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /admin/ligas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
