const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { recalcularTablaPosiciones } = require('../utils/tablaPosiciones');

// Chequea que la categoría pertenezca a un torneo de MI liga. Devuelve
// {torneo, categoria} o null.
async function buscarCategoriaDeMiLiga(torneoId, categoriaId, ligaId) {
  const { rows } = await query(
    `SELECT t.*, c.id AS categoria_id, c.nombre AS categoria_nombre
     FROM torneos t
     JOIN categorias c ON c.torneo_id = t.id
     WHERE t.id = $1 AND c.id = $2 AND t.liga_id = $3`,
    [torneoId, categoriaId, ligaId]
  );
  return rows[0] || null;
}

// ===== EQUIPOS_TORNEO (inscripción de un club a una categoría) =====

// GET /liga/torneos/:torneoId/categorias/:categoriaId/equipos
router.get('/:torneoId/categorias/:categoriaId/equipos', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `SELECT et.*, c.nombre AS club_nombre, c.logo_url AS club_logo_url
       FROM equipos_torneo et
       JOIN clubes c ON c.id = et.club_id
       WHERE et.torneo_id = $1 AND et.categoria_id = $2
       ORDER BY c.nombre ASC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, equipos: rows });
  } catch (err) {
    console.error('Error en GET equipos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/torneos/:torneoId/categorias/:categoriaId/equipos — inscribir un club
// (el club_id tiene que ser uno de los clubes ya cargados en MI liga)
router.post('/:torneoId/categorias/:categoriaId/equipos', async (req, res) => {
  const { club_id, grupo } = req.body;
  if (!club_id) {
    return res.status(400).json({ ok: false, error: 'Falta club_id' });
  }
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const clubEnMiLiga = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [club_id, req.ligaId]
    );
    if (!clubEnMiLiga.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Ese club no participa en tu Liga' });
    }

    const { rows } = await query(
      `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, grupo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.torneoId, req.params.categoriaId, club_id, grupo || null]
    );
    res.status(201).json({ ok: true, equipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ese club ya está inscripto en esta categoría' });
    }
    console.error('Error en POST equipos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== PARTIDOS (fixture) =====

// GET /liga/torneos/:torneoId/categorias/:categoriaId/partidos
router.get('/:torneoId/categorias/:categoriaId/partidos', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `SELECT p.*, cl.nombre AS club_local_nombre, cv.nombre AS club_visitante_nombre
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, partidos: rows });
  } catch (err) {
    console.error('Error en GET partidos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/torneos/:torneoId/categorias/:categoriaId/partidos — programar un partido
router.post('/:torneoId/categorias/:categoriaId/partidos', async (req, res) => {
  const { equipo_local_id, equipo_visitante_id, fecha, hora, sede, jornada } = req.body;

  if (!equipo_local_id || !equipo_visitante_id) {
    return res.status(400).json({ ok: false, error: 'Faltan equipo_local_id y/o equipo_visitante_id' });
  }
  if (equipo_local_id === equipo_visitante_id) {
    return res.status(400).json({ ok: false, error: 'Un equipo no puede jugar contra sí mismo' });
  }

  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `INSERT INTO partidos (torneo_id, categoria_id, equipo_local_id, equipo_visitante_id, fecha, hora, sede, jornada)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.params.torneoId, req.params.categoriaId, equipo_local_id, equipo_visitante_id,
       fecha || null, hora || null, sede || null, jornada || null]
    );
    res.status(201).json({ ok: true, partido: rows[0] });
  } catch (err) {
    console.error('Error en POST partidos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId/resultado
// Cargar (o corregir) el resultado de un partido. Dispara el recálculo
// automático de la tabla de posiciones de esa categoría.
router.put('/:torneoId/categorias/:categoriaId/partidos/:partidoId/resultado', async (req, res) => {
  const { resultado_local, resultado_visitante, detalle_resultado, observaciones } = req.body;

  if (resultado_local == null || resultado_visitante == null) {
    return res.status(400).json({ ok: false, error: 'Faltan resultado_local y/o resultado_visitante' });
  }

  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `UPDATE partidos SET
         resultado_local = $1, resultado_visitante = $2,
         detalle_resultado = COALESCE($3, detalle_resultado),
         observaciones = COALESCE($4, observaciones),
         estado = 'jugado',
         actualizado_at = NOW()
       WHERE id = $5 AND torneo_id = $6 AND categoria_id = $7
       RETURNING *`,
      [resultado_local, resultado_visitante,
       detalle_resultado ? JSON.stringify(detalle_resultado) : null,
       observaciones || null,
       req.params.partidoId, req.params.torneoId, req.params.categoriaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    await recalcularTablaPosiciones(req.params.torneoId, req.params.categoriaId);

    res.json({ ok: true, partido: rows[0] });
  } catch (err) {
    console.error('Error en PUT resultado:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== TABLA DE POSICIONES =====

// GET /liga/torneos/:torneoId/categorias/:categoriaId/tabla
router.get('/:torneoId/categorias/:categoriaId/tabla', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `SELECT tp.*, c.nombre AS club_nombre, c.logo_url AS club_logo_url
       FROM tabla_posiciones tp
       JOIN equipos_torneo et ON et.id = tp.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE tp.torneo_id = $1 AND tp.categoria_id = $2
       ORDER BY tp.puntos DESC, tp.diferencia DESC, tp.a_favor DESC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, tabla: rows });
  } catch (err) {
    console.error('Error en GET tabla:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
