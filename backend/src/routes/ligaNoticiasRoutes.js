const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/noticias — todas las noticias de mi Liga (cualquier estado),
// con los nombres de club/torneo/división de la segmentación (si tiene)
// para poder mostrarlos en el listado del Panel.
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.*, cl.nombre AS segmento_club_nombre,
              t.nombre AS segmento_torneo_nombre, cat.nombre AS segmento_categoria_nombre
       FROM noticias n
       LEFT JOIN clubes cl ON cl.id = n.segmento_club_id
       LEFT JOIN torneos t ON t.id = n.segmento_torneo_id
       LEFT JOIN categorias cat ON cat.id = n.segmento_categoria_id
       WHERE n.liga_id = $1
       ORDER BY n.publicado_at DESC`,
      [req.ligaId]
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET /liga/noticias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Valida que el link de YouTube (opcional) sea realmente de YouTube, antes
// de guardarlo. Acepta cualquier formato de link de YouTube (watch?v=,
// youtu.be/, /embed/, /shorts/): la conversión al formato embed se hace en
// el frontend público al mostrarlo, acá solo filtramos que no sea "cualquier
// cosa" pegada en el campo.
function esLinkDeYoutubeValido(url) {
  if (!url) return true;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com';
  } catch (err) {
    return false;
  }
}

// Valida los datos de segmentación ("Mostrar a") de una noticia. Devuelve
// un mensaje de error (string) si algo no es válido, o null si está OK.
async function validarSegmentoNoticia(ligaId, segmento) {
  const tiposValidos = ['todos', 'club', 'ciudad', 'provincia', 'torneo'];
  if (segmento.segmento_tipo && !tiposValidos.includes(segmento.segmento_tipo)) {
    return `Tipo de segmento inválido. Válidos: ${tiposValidos.join(', ')}`;
  }
  if (segmento.segmento_tipo === 'club') {
    if (!segmento.segmento_club_id) return 'Falta elegir el club';
    const ok = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [segmento.segmento_club_id, ligaId]
    );
    if (!ok.rows[0]) return 'Ese club no participa en tu Liga';
  }
  if (segmento.segmento_tipo === 'ciudad' && !(Array.isArray(segmento.segmento_ciudades) && segmento.segmento_ciudades.length)) {
    return 'Falta elegir al menos una ciudad';
  }
  if (segmento.segmento_tipo === 'provincia' && !(Array.isArray(segmento.segmento_provincias) && segmento.segmento_provincias.length)) {
    return 'Falta elegir al menos una provincia';
  }
  if (segmento.segmento_tipo === 'torneo') {
    if (!segmento.segmento_torneo_id) return 'Falta elegir el torneo';
    const okTorneo = await query('SELECT 1 FROM torneos WHERE id = $1 AND liga_id = $2', [segmento.segmento_torneo_id, ligaId]);
    if (!okTorneo.rows[0]) return 'Ese torneo no pertenece a tu Liga';
    if (segmento.segmento_categoria_id) {
      const okCategoria = await query(
        'SELECT 1 FROM categorias WHERE id = $1 AND torneo_id = $2',
        [segmento.segmento_categoria_id, segmento.segmento_torneo_id]
      );
      if (!okCategoria.rows[0]) return 'Esa división no pertenece al torneo elegido';
    }
  }
  return null;
}

// POST /liga/noticias — crear una noticia
router.post('/', async (req, res) => {
  const {
    titulo, contenido, imagen_url, video_youtube_url, destacada, estado,
    segmento_tipo, segmento_club_id, segmento_ciudades, segmento_provincias,
    segmento_torneo_id, segmento_categoria_id
  } = req.body;
  const estadosValidos = ['borrador', 'publicada', 'archivada'];

  if (!titulo || !titulo.trim() || !contenido || !contenido.trim()) {
    return res.status(400).json({ ok: false, error: 'Faltan título y/o contenido' });
  }
  if (estado && !estadosValidos.includes(estado)) {
    return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
  }
  if (!esLinkDeYoutubeValido(video_youtube_url)) {
    return res.status(400).json({ ok: false, error: 'El link de video tiene que ser de YouTube' });
  }

  try {
    const errorSegmento = await validarSegmentoNoticia(req.ligaId, req.body);
    if (errorSegmento) return res.status(400).json({ ok: false, error: errorSegmento });

    const tipo = segmento_tipo || 'todos';
    const { rows } = await query(
      `INSERT INTO noticias (
         liga_id, titulo, contenido, imagen_url, video_youtube_url, destacada, estado, autor_id,
         segmento_tipo, segmento_club_id, segmento_ciudades, segmento_provincias,
         segmento_torneo_id, segmento_categoria_id
       )
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE), COALESCE($7, 'publicada'), $8,
               $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [req.ligaId, titulo.trim(), contenido.trim(), imagen_url || null, video_youtube_url || null,
       destacada === true, estado || null, req.usuario.id,
       tipo,
       tipo === 'club' ? segmento_club_id : null,
       tipo === 'ciudad' ? segmento_ciudades : null,
       tipo === 'provincia' ? segmento_provincias : null,
       tipo === 'torneo' ? segmento_torneo_id : null,
       tipo === 'torneo' ? (segmento_categoria_id || null) : null]
    );
    res.status(201).json({ ok: true, noticia: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/noticias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/noticias/:noticiaId — editar
router.put('/:noticiaId', async (req, res) => {
  const {
    titulo, contenido, imagen_url, video_youtube_url, destacada,
    segmento_tipo, segmento_club_id, segmento_ciudades, segmento_provincias,
    segmento_torneo_id, segmento_categoria_id
  } = req.body;
  if (!esLinkDeYoutubeValido(video_youtube_url)) {
    return res.status(400).json({ ok: false, error: 'El link de video tiene que ser de YouTube' });
  }
  try {
    if (segmento_tipo) {
      const errorSegmento = await validarSegmentoNoticia(req.ligaId, req.body);
      if (errorSegmento) return res.status(400).json({ ok: false, error: errorSegmento });
    }

    const { rows } = await query(
      `UPDATE noticias SET
         titulo = COALESCE($1, titulo),
         contenido = COALESCE($2, contenido),
         imagen_url = COALESCE($3, imagen_url),
         video_youtube_url = COALESCE($4, video_youtube_url),
         destacada = COALESCE($5, destacada),
         segmento_tipo = COALESCE($6, segmento_tipo),
         segmento_club_id = CASE WHEN $6 = 'club' THEN $7::uuid WHEN $6 IS NOT NULL THEN NULL ELSE segmento_club_id END,
         segmento_ciudades = CASE WHEN $6 = 'ciudad' THEN $8::text[] WHEN $6 IS NOT NULL THEN NULL ELSE segmento_ciudades END,
         segmento_provincias = CASE WHEN $6 = 'provincia' THEN $9::text[] WHEN $6 IS NOT NULL THEN NULL ELSE segmento_provincias END,
         segmento_torneo_id = CASE WHEN $6 = 'torneo' THEN $10::uuid WHEN $6 IS NOT NULL THEN NULL ELSE segmento_torneo_id END,
         segmento_categoria_id = CASE WHEN $6 = 'torneo' THEN $11::uuid WHEN $6 IS NOT NULL THEN NULL ELSE segmento_categoria_id END
       WHERE id = $12 AND liga_id = $13
       RETURNING *`,
      [titulo || null, contenido || null, imagen_url || null, video_youtube_url || null,
       typeof destacada === 'boolean' ? destacada : null,
       segmento_tipo || null, segmento_club_id || null, segmento_ciudades || null,
       segmento_provincias || null, segmento_torneo_id || null, segmento_categoria_id || null,
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
