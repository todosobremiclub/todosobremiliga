const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/noticias — todas las noticias de mi Liga (cualquier estado)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM noticias WHERE liga_id = $1 ORDER BY publicado_at DESC',
      [req.ligaId]
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET /liga/noticias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/noticias — crear una noticia
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
      `INSERT INTO noticias (liga_id, titulo, contenido, imagen_url, destacada, estado, autor_id)
       VALUES ($1, $2, $3, $4, COALESCE($5, FALSE), COALESCE($6, 'publicada'), $7)
       RETURNING *`,
      [req.ligaId, titulo.trim(), contenido.trim(), imagen_url || null,
       destacada === true, estado || null, req.usuario.id]
    );
    res.status(201).json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/noticias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/noticias/:noticiaId — editar
router.put('/:noticiaId', async (req, res) => {
  const { titulo, contenido, imagen_url, destacada } = req.body;
  try {
    const { rows } = await query(
      `UPDATE noticias SET
         titulo = COALESCE($1, titulo),
         contenido = COALESCE($2, contenido),
         imagen_url = COALESCE($3, imagen_url),
         destacada = COALESCE($4, destacada)
       WHERE id = $5 AND liga_id = $6
       RETURNING *`,
      [titulo || null, contenido || null, imagen_url || null,
       typeof destacada === 'boolean' ? destacada : null,
       req.params.noticiaId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Noticia no encontrada en tu Liga' });
    res.json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/noticias/:noticiaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/noticias/:noticiaId/estado — borrador / publicada / archivada
router.patch('/:noticiaId/estado', async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['borrador', 'publicada', 'archivada'];
  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
  }
  try {
    const { rows } = await query(
      'UPDATE noticias SET estado = $1 WHERE id = $2 AND liga_id = $3 RETURNING *',
      [estado, req.params.noticiaId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Noticia no encontrada en tu Liga' });
    res.json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /liga/noticias/:noticiaId/estado:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
