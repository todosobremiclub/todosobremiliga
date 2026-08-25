const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Noticias de la plataforma (no de una Liga puntual), que administra el
// Super Admin y se muestran en la home pública (/sitio/index.html), junto
// al listado de Ligas. Mismo patrón que /liga/noticias pero sin liga_id ni
// segmentación (acá no hay una sola Liga "dueña" de la noticia).

// GET /admin/noticias — todas (cualquier estado)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM noticias_globales ORDER BY publicado_at DESC');
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET /admin/noticias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /admin/noticias — crear
router.post('/', async (req, res) => {
  const { titulo, contenido, imagen_url, destacada, estado } = req.body;
  const estadosValidos = ['borrador', 'publicada', 'archivada'];

  if (!titulo || !titulo.trim() || !contenido || !contenido.trim()) {
    return res.status(400).json({ ok: false, error: 'Faltan título y/o contenido' });
  }
  if (estado && !estadosValidos.includes(estado)) {
    return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
  }

  try {
    const { rows } = await query(
      `INSERT INTO noticias_globales (titulo, contenido, imagen_url, destacada, estado, autor_id)
       VALUES ($1, $2, $3, COALESCE($4, FALSE), COALESCE($5, 'publicada'), $6)
       RETURNING *`,
      [titulo.trim(), contenido.trim(), imagen_url || null, destacada === true, estado || null, req.usuario.id]
    );
    res.status(201).json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en POST /admin/noticias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /admin/noticias/:noticiaId — editar
router.put('/:noticiaId', async (req, res) => {
  const { titulo, contenido, imagen_url, destacada } = req.body;
  try {
    const { rows } = await query(
      `UPDATE noticias_globales SET
         titulo = COALESCE($1, titulo),
         contenido = COALESCE($2, contenido),
         imagen_url = COALESCE($3, imagen_url),
         destacada = COALESCE($4, destacada)
       WHERE id = $5
       RETURNING *`,
      [titulo || null, contenido || null, imagen_url || null,
       typeof destacada === 'boolean' ? destacada : null, req.params.noticiaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Noticia no encontrada' });
    res.json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en PUT /admin/noticias/:noticiaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /admin/noticias/:noticiaId/estado — borrador / publicada / archivada
router.patch('/:noticiaId/estado', async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['borrador', 'publicada', 'archivada'];
  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
  }
  try {
    const { rows } = await query(
      'UPDATE noticias_globales SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, req.params.noticiaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Noticia no encontrada' });
    res.json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /admin/noticias/:noticiaId/estado:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
