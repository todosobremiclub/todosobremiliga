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

// Chequea si ya existe otro torneo con el mismo nombre (comparación
// insensible a mayúsculas/espacios) DENTRO de mi Liga.
async function nombreTorneoYaExisteEnLiga(nombre, ligaId, excluirTorneoId) {
  const { rows } = await query(
    `SELECT 1 FROM torneos
     WHERE liga_id = $1 AND LOWER(TRIM(nombre)) = LOWER(TRIM($2))
       AND ($3::uuid IS NULL OR id != $3::uuid)
     LIMIT 1`,
    [ligaId, nombre, excluirTorneoId || null]
  );
  return !!rows[0];
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
    sistema_puntaje, config_extra, fecha_inicio, fecha_fin, cancha_juego
  } = req.body;

  const deportesValidos = ['futbol', 'voley', 'handball', 'basquet', 'futsal', 'otro'];
  const formatosValidos = ['todos_contra_todos', 'grupos_playoffs', 'liguilla_ida_vuelta', 'eliminacion_directa', 'apertura_clausura'];
  const canchasJuegoValidas = ['propias_liga', 'clubes'];

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del torneo es obligatorio' });
  }
  if (!deporte || !deportesValidos.includes(deporte)) {
    return res.status(400).json({ ok: false, error: `Deporte inválido. Válidos: ${deportesValidos.join(', ')}` });
  }
  if (formato_juego && !formatosValidos.includes(formato_juego)) {
    return res.status(400).json({ ok: false, error: `Formato inválido. Válidos: ${formatosValidos.join(', ')}` });
  }
  if (cancha_juego && !canchasJuegoValidas.includes(cancha_juego)) {
    return res.status(400).json({ ok: false, error: `Cancha de juego inválida. Válidas: ${canchasJuegoValidas.join(', ')}` });
  }

  try {
    if (await nombreTorneoYaExisteEnLiga(nombre, req.ligaId)) {
      return res.status(409).json({ ok: false, error: 'Ya existe un torneo con ese nombre en tu Liga' });
    }
    const { rows } = await query(
      `INSERT INTO torneos (liga_id, nombre, deporte, temporada, formato_juego, sistema_puntaje, config_extra, fecha_inicio, fecha_fin, cancha_juego)
       VALUES ($1, $2, $3, $4, COALESCE($5, 'todos_contra_todos'), COALESCE($6, '{}'::jsonb), COALESCE($7, '{}'::jsonb), $8, $9, COALESCE($10, 'clubes'))
       RETURNING *`,
      [req.ligaId, nombre.trim(), deporte, temporada || null, formato_juego || null,
       sistema_puntaje ? JSON.stringify(sistema_puntaje) : null,
       config_extra ? JSON.stringify(config_extra) : null,
       fecha_inicio || null, fecha_fin || null, cancha_juego || null]
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
    sistema_puntaje, config_extra, fecha_inicio, fecha_fin, cancha_juego
  } = req.body;

  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    if (nombre && await nombreTorneoYaExisteEnLiga(nombre, req.ligaId, req.params.torneoId)) {
      return res.status(409).json({ ok: false, error: 'Ya existe un torneo con ese nombre en tu Liga' });
    }

    const { rows } = await query(
      `UPDATE torneos SET
         nombre = COALESCE($1, nombre),
         deporte = COALESCE($2, deporte),
         temporada = COALESCE($3, temporada),
         formato_juego = COALESCE($4, formato_juego),
         sistema_puntaje = COALESCE($5, sistema_puntaje),
         config_extra = COALESCE($6, config_extra),
         fecha_inicio = COALESCE($7, fecha_inicio),
         fecha_fin = COALESCE($8, fecha_fin),
         cancha_juego = COALESCE($9, cancha_juego)
       WHERE id = $10
       RETURNING *`,
      [nombre || null, deporte || null, temporada || null, formato_juego || null,
       sistema_puntaje ? JSON.stringify(sistema_puntaje) : null,
       config_extra ? JSON.stringify(config_extra) : null,
       fecha_inicio || null, fecha_fin || null, cancha_juego || null,
       req.params.torneoId]
    );
    res.json({ ok: true, torneo: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/torneos/:torneoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/torneos/:torneoId — borra el torneo y, en cascada, sus
// categorías, subcategorías, equipos inscriptos, partidos y estadísticas.
router.delete('/:torneoId', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    await query('DELETE FROM torneos WHERE id = $1', [req.params.torneoId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/torneos/:torneoId:', err);
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

// GET /liga/torneos/:torneoId/categorias — incluye, para cada categoría, sus
// subcategorías (si tiene). El front usa esto para saber si una categoría se
// gestiona "pelada" o a través de sus subcategorías.
router.get('/:torneoId/categorias', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const categoriasResult = await query(
      'SELECT * FROM categorias WHERE torneo_id = $1 ORDER BY orden ASC, nombre ASC',
      [req.params.torneoId]
    );
    const subcategoriasResult = await query(
      `SELECT cs.* FROM categoria_subcategorias cs
       JOIN categorias c ON c.id = cs.categoria_id
       WHERE c.torneo_id = $1 ORDER BY cs.orden ASC, cs.nombre ASC`,
      [req.params.torneoId]
    );
    const categorias = categoriasResult.rows.map((c) => ({
      ...c,
      subcategorias: subcategoriasResult.rows.filter((s) => s.categoria_id === c.id)
    }));
    res.json({ ok: true, categorias });
  } catch (err) {
    console.error('Error en GET /liga/torneos/:torneoId/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/torneos/:torneoId/categorias — alta de una categoría
router.post('/:torneoId/categorias', async (req, res) => {
  const { nombre, genero, edad_minima, edad_maxima, orden, precio_inscripcion } = req.body;
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
      `INSERT INTO categorias (torneo_id, nombre, genero, edad_minima, edad_maxima, orden, precio_inscripcion)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), $7)
       RETURNING *`,
      [req.params.torneoId, nombre.trim(), genero || null, edad_minima || null, edad_maxima || null, orden ?? null,
       precio_inscripcion != null && precio_inscripcion !== '' ? precio_inscripcion : null]
    );
    res.status(201).json({ ok: true, categoria: { ...rows[0], subcategorias: [] } });
  } catch (err) {
    console.error('Error en POST /liga/torneos/:torneoId/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId — edición
router.put('/:torneoId/categorias/:categoriaId', async (req, res) => {
  const { nombre, genero, edad_minima, edad_maxima, orden, precio_inscripcion } = req.body;
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rows } = await query(
      `UPDATE categorias SET
         nombre = COALESCE($1, nombre),
         genero = COALESCE($2, genero),
         edad_minima = COALESCE($3, edad_minima),
         edad_maxima = COALESCE($4, edad_maxima),
         orden = COALESCE($5, orden),
         precio_inscripcion = $6
       WHERE id = $7 AND torneo_id = $8
       RETURNING *`,
      [nombre || null, genero || null, edad_minima || null, edad_maxima || null, orden ?? null,
       precio_inscripcion != null && precio_inscripcion !== '' ? precio_inscripcion : null,
       req.params.categoriaId, req.params.torneoId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en ese torneo' });
    res.json({ ok: true, categoria: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/torneos/:torneoId/categorias/:categoriaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/torneos/:torneoId/categorias/:categoriaId — borra la
// categoría y, en cascada, sus subcategorías, equipos inscriptos, partidos y
// estadísticas.
router.delete('/:torneoId/categorias/:categoriaId', async (req, res) => {
  try {
    const torneo = await buscarTorneoDeMiLiga(req.params.torneoId, req.ligaId);
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    const { rowCount } = await query(
      'DELETE FROM categorias WHERE id = $1 AND torneo_id = $2',
      [req.params.categoriaId, req.params.torneoId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en ese torneo' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/torneos/:torneoId/categorias/:categoriaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Chequea que una categoría exista y pertenezca a un torneo de mi liga.
async function buscarCategoriaDeMiLiga(categoriaId, torneoId, ligaId) {
  const { rows } = await query(
    `SELECT c.* FROM categorias c
     JOIN torneos t ON t.id = c.torneo_id
     WHERE c.id = $1 AND c.torneo_id = $2 AND t.liga_id = $3`,
    [categoriaId, torneoId, ligaId]
  );
  return rows[0] || null;
}

// ===== SUBCATEGORÍAS (anidadas dentro de una categoría) =====
// Nivel extra y opcional de clasificación. Ej: la categoría "Fútbol Femenino"
// del torneo "Copa Lamba" puede tener las subcategorías "Primera" y "Reserva".
// Cuando una categoría tiene subcategorías cargadas, el club se inscribe a
// nivel subcategoría (no directamente a la categoría) — ver
// ligaClubesRoutes.js (participaciones).

// POST /liga/torneos/:torneoId/categorias/:categoriaId/subcategorias
router.post('/:torneoId/categorias/:categoriaId/subcategorias', async (req, res) => {
  const { nombre, orden, precio_inscripcion } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre de la subcategoría es obligatorio' });
  }
  try {
    const categoria = await buscarCategoriaDeMiLiga(req.params.categoriaId, req.params.torneoId, req.ligaId);
    if (!categoria) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en ese torneo' });

    const { rows } = await query(
      `INSERT INTO categoria_subcategorias (categoria_id, nombre, orden, precio_inscripcion)
       VALUES ($1, $2, COALESCE($3, 0), $4)
       RETURNING *`,
      [req.params.categoriaId, nombre.trim(), orden ?? null,
       precio_inscripcion != null && precio_inscripcion !== '' ? precio_inscripcion : null]
    );
    res.status(201).json({ ok: true, subcategoria: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe una subcategoría con ese nombre en esta categoría' });
    }
    console.error('Error en POST subcategorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId/subcategorias/:subcategoriaId
router.put('/:torneoId/categorias/:categoriaId/subcategorias/:subcategoriaId', async (req, res) => {
  const { nombre, orden, precio_inscripcion } = req.body;
  try {
    const categoria = await buscarCategoriaDeMiLiga(req.params.categoriaId, req.params.torneoId, req.ligaId);
    if (!categoria) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en ese torneo' });

    const { rows } = await query(
      `UPDATE categoria_subcategorias SET
         nombre = COALESCE($1, nombre),
         orden = COALESCE($2, orden),
         precio_inscripcion = $3
       WHERE id = $4 AND categoria_id = $5
       RETURNING *`,
      [nombre && nombre.trim() ? nombre.trim() : null, orden ?? null,
       precio_inscripcion != null && precio_inscripcion !== '' ? precio_inscripcion : null,
       req.params.subcategoriaId, req.params.categoriaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Subcategoría no encontrada en esa categoría' });
    res.json({ ok: true, subcategoria: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe una subcategoría con ese nombre en esta categoría' });
    }
    console.error('Error en PUT subcategorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/torneos/:torneoId/categorias/:categoriaId/subcategorias/:subcategoriaId
// Borrar una subcategoría borra en cascada los equipos (y sus partidos/tabla)
// que estuvieran inscriptos puntualmente en ella.
router.delete('/:torneoId/categorias/:categoriaId/subcategorias/:subcategoriaId', async (req, res) => {
  try {
    const categoria = await buscarCategoriaDeMiLiga(req.params.categoriaId, req.params.torneoId, req.ligaId);
    if (!categoria) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en ese torneo' });

    const { rowCount } = await query(
      'DELETE FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2',
      [req.params.subcategoriaId, req.params.categoriaId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Subcategoría no encontrada en esa categoría' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE subcategorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
