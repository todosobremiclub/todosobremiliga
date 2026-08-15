const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// Chequea que un torneo exista y pertenezca a mi liga. Devuelve el torneo o
// null. Se usa antes de tocar categorías de ese torneo.
async function buscarTorneoDeMiLiga(torneoId, ligaId) {
  const { rows } = await query(
    'SELECT * FROM torneos WHERE id = $1 AND liga_id = $2',
    [torneoId, ligaId]
  );
  return rows[0] || null;
}

// ===== TORNEOS =====

// GET /liga/torneos — listado de torneos de mi liga
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM torneos WHERE liga_id = $1 ORDER BY creado_at DESC',
      [req.ligaId]
    );
    res.json({ ok: true, torneos: rows });
  } catch (err) {
    console.error('Error en GET /liga/torneos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/torneos/:torneoId — detalle
router.get('/:torneoId', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });
    res.json({ ok: true, torneo });
  } catch (err) {
    console.error('Error en GET /liga/torneos/:torneoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/torneos — alta de un torneo nuevo
// Acá es donde se define el deporte, el formato de juego y el sistema de
// puntaje (JSON libre) — la parte "multi-deporte" del diseño.
router.post('/', async (req, res) => {
  const {
    nombre, deporte, temporada, formato_juego,
    sistema_puntaje, config_extra, fecha_inicio, fecha_fin
  } = req.body;

  const deportesValidos = ['futbol', 'voley', 'handball', 'basquet', 'futsal', 'otro'];
  const formatosValidos = ['todos_contra_todos', 'grupos_playoffs', 'liguilla_ida_vuelta', 'eliminacion_directa'];

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del torneo es obligatorio' });
  }
  if (!deporte || !deportesValidos.includes(deporte)) {
    return res.status(400).json({ ok: false, error: `Deporte inválido. Válidos: ${deportesValidos.join(', ')}` });
  }
  if (formato_juego && !formatosValidos.includes(formato_juego)) {
    return res.status(400).json({ ok: false, error: `Formato inválido. Válidos: ${formatosValidos.join(', ')}` });
  }

  try {
    const { rows } = await query(
      `INSERT INTO torneos (liga_id, nombre, deporte, temporada, formato_juego, sistema_puntaje, config_extra, fecha_inicio, fecha_fin)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'todos_contra_todos'), COALESCE($6, '{}'::jsonb), COALESCE($7, '{}'::jsonb), $8, $9)
       RETURNING *`,
      [req.ligaId, nombre.trim(), deporte, temporada || null, formato_juego || null,
       sistema_puntaje ? JSON.stringify(sistema_puntaje) : null,
       config_extra ? JSON.stringify(config_extra) : null,
       fecha_inicio || null, fecha_fin || null]
    );
    res.status(201).json({ ok: true, torneo: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/torneos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId — edición
router.put('/:torneoId', async (req, res) => {
  const {
    nombre, deporte, temporada, formato_juego,
    sistema_puntaje, config_extra, fecha_inicio, fecha_fin
  } = req.body;

  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `UPDATE torneos SET
         nombre = COALESCE($1, nombre),
         deporte = COALESCE($2, deporte),
         temporada = COALESCE($3, temporada),
         formato_juego = COALESCE($4, formato_juego),
         sistema_puntaje = COALESCE($5, sistema_puntaje),
         config_extra = COALESCE($6, config_extra),
         fecha_inicio = COALESCE($7, fecha_inicio),
         fecha_fin = COALESCE($8, fecha_fin)
       WHERE id = $9
       RETURNING *`,
      [nombre || null, deporte || null, temporada || null, formato_juego || null,
       sistema_puntaje ? JSON.stringify(sistema_puntaje) : null,
       config_extra ? JSON.stringify(config_extra) : null,
       fecha_inicio || null, fecha_fin || null, req.params.torneoId]
    );
    res.json({ ok: true, torneo: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/torneos/:torneoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/torneos/:torneoId/estado — planificado -> en_curso -> finalizado (o suspendido)
router.patch('/:torneoId/estado', async (req, res) => {
  const { estado } = req.body;
  const estadosValidos = ['planificado', 'en_curso', 'finalizado', 'suspendido'];
  if (!estado || !estadosValidos.includes(estado)) {
    return res.status(400).json({ ok: false, error: `Estado inválido. Válidos: ${estadosValidos.join(', ')}` });
  }
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      'UPDATE torneos SET estado = $1 WHERE id = $2 RETURNING *',
      [estado, req.params.torneoId]
    );
    res.json({ ok: true, torneo: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /liga/torneos/:torneoId/estado:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== CATEGORÍAS (anidadas dentro de un torneo) =====

// GET /liga/torneos/:torneoId/categorias
router.get('/:torneoId/categorias', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      'SELECT * FROM categorias WHERE torneo_id = $1 ORDER BY orden ASC, nombre ASC',
      [req.params.torneoId]
    );
    res.json({ ok: true, categorias: rows });
  } catch (err) {
    console.error('Error en GET /liga/torneos/:torneoId/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/torneos/:torneoId/categorias — alta de una categoría
router.post('/:torneoId/categorias', async (req, res) => {
  const { nombre, genero, edad_minima, edad_maxima, orden } = req.body;
  const generosValidos = ['masculino', 'femenino', 'mixto'];

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre de la categoría es obligatorio' });
  }
  if (genero && !generosValidos.includes(genero)) {
    return res.status(400).json({ ok: false, error: `Género inválido. Válidos: ${generosValidos.join(', ')}` });
  }

  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `INSERT INTO categorias (torneo_id, nombre, genero, edad_minima, edad_maxima, orden)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0))
       RETURNING *`,
      [req.params.torneoId, nombre.trim(), genero || null, edad_minima || null, edad_maxima || null, orden ?? null]
    );
    res.status(201).json({ ok: true, categoria: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/torneos/:torneoId/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId — edición
router.put('/:torneoId/categorias/:categoriaId', async (req, res) => {
  const { nombre, genero, edad_minima, edad_maxima, orden } = req.body;
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `UPDATE categorias SET
         nombre = COALESCE($1, nombre),
         genero = COALESCE($2, genero),
         edad_minima = COALESCE($3, edad_minima),
         edad_maxima = COALESCE($4, edad_maxima),
         orden = COALESCE($5, orden)
       WHERE id = $6 AND torneo_id = $7
       RETURNING *`,
      [nombre || null, genero || null, edad_minima || null, edad_maxima || null, orden ?? null,
       req.params.categoriaId, req.params.torneoId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en ese torneo' });
    res.json({ ok: true, categoria: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/torneos/:torneoId/categorias/:categoriaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
