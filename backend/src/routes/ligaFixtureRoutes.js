const express = require('express');
const router = express.Router();

const { query } = require('../db');
const { recalcularTablaPosiciones } = require('../utils/tablaPosiciones');
const { generarRoundRobin } = require('../utils/fixtureGenerator');

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
      `SELECT et.*, c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
              sub.nombre AS subcategoria_nombre
       FROM equipos_torneo et
       JOIN clubes c ON c.id = et.club_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = et.subcategoria_id
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
// (el club_id tiene que ser uno de los clubes ya cargados en MI liga). Si la
// categoría tiene subcategorías cargadas, es obligatorio indicar a cuál de
// ellas se inscribe (el club NO puede quedar en la categoría "pelada").
router.post('/:torneoId/categorias/:categoriaId/equipos', async (req, res) => {
  const { club_id, subcategoria_id, grupo } = req.body;
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

    const subcategorias = await query(
      'SELECT id FROM categoria_subcategorias WHERE categoria_id = $1',
      [req.params.categoriaId]
    );
    let subcategoriaIdFinal = null;
    if (subcategorias.rows.length) {
      if (!subcategoria_id || !subcategorias.rows.some((s) => s.id === subcategoria_id)) {
        return res.status(400).json({ ok: false, error: 'Esta categoría tiene subcategorías: elegí una para inscribir al club' });
      }
      subcategoriaIdFinal = subcategoria_id;
    }

    // Dentro de un mismo torneo, un club no puede quedar inscripto en dos
    // categorías DISTINTAS (sí puede tener equipo en varias subcategorías de
    // la MISMA categoría, ej: Primera y Reserva).
    const otraCategoria = await query(
      `SELECT c.nombre AS categoria_nombre FROM equipos_torneo et
       JOIN categorias c ON c.id = et.categoria_id
       WHERE et.torneo_id = $1 AND et.club_id = $2 AND et.categoria_id != $3
       LIMIT 1`,
      [req.params.torneoId, club_id, req.params.categoriaId]
    );
    if (otraCategoria.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: `Ese club ya está inscripto en este torneo en la categoría "${otraCategoria.rows[0].categoria_nombre}". Un club no puede jugar en dos categorías distintas del mismo torneo.`
      });
    }

    const { rows } = await query(
      `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, subcategoria_id, grupo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.params.torneoId, req.params.categoriaId, club_id, subcategoriaIdFinal, grupo || null]
    );
    res.status(201).json({ ok: true, equipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ese club ya está inscripto en esta categoría/subcategoría' });
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
      `SELECT p.*, cl.nombre AS club_local_nombre, cv.nombre AS club_visitante_nombre,
              cl.color_primario AS club_local_color, cv.color_primario AS club_visitante_color
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

    // Validación manual: que ninguno de los dos equipos ya tenga un partido
    // programado en esa misma jornada (evita que un equipo juegue "dos veces"
    // en la misma fecha por error de carga).
    if (jornada) {
      const conflicto = await query(
        `SELECT c.nombre AS club_nombre
         FROM partidos p
         JOIN equipos_torneo et ON et.id = (
           CASE WHEN p.equipo_local_id IN ($4, $5) THEN p.equipo_local_id ELSE p.equipo_visitante_id END
         )
         JOIN clubes c ON c.id = et.club_id
         WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND p.jornada = $3
           AND (p.equipo_local_id IN ($4, $5) OR p.equipo_visitante_id IN ($4, $5))
         LIMIT 1`,
        [req.params.torneoId, req.params.categoriaId, jornada, equipo_local_id, equipo_visitante_id]
      );
      if (conflicto.rows[0]) {
        return res.status(409).json({
          ok: false,
          error: `El equipo "${conflicto.rows[0].club_nombre}" ya tiene un partido programado en la jornada ${jornada}`
        });
      }
    }

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

// POST /liga/torneos/:torneoId/categorias/:categoriaId/fixture/generar
// Genera automáticamente el fixture "todos contra todos" (round-robin, método
// del círculo) para todos los equipos inscriptos y activos de la categoría.
// Rechaza si ya hay partidos cargados (hay que vaciar el fixture primero).
router.post('/:torneoId/categorias/:categoriaId/fixture/generar', async (req, res) => {
  const { ida_vuelta } = req.body;
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const existentes = await query(
      'SELECT COUNT(*)::int AS cantidad FROM partidos WHERE torneo_id = $1 AND categoria_id = $2',
      [req.params.torneoId, req.params.categoriaId]
    );
    if (existentes.rows[0].cantidad > 0) {
      return res.status(409).json({
        ok: false,
        error: 'Ya hay un fixture cargado para esta categoría. Borralo primero (botón "Vaciar fixture") si querés generar uno nuevo.'
      });
    }

    const equiposResult = await query(
      'SELECT id FROM equipos_torneo WHERE torneo_id = $1 AND categoria_id = $2 AND activo = TRUE',
      [req.params.torneoId, req.params.categoriaId]
    );
    const equipoIds = equiposResult.rows.map((e) => e.id);
    if (equipoIds.length < 2) {
      return res.status(400).json({ ok: false, error: 'Necesitás al menos 2 equipos inscriptos para generar un fixture' });
    }

    const idaVuelta = ida_vuelta != null ? !!ida_vuelta : contexto.formato_juego === 'liguilla_ida_vuelta';
    const rondas = generarRoundRobin(equipoIds, idaVuelta);

    let cantidadCreados = 0;
    for (let i = 0; i < rondas.length; i++) {
      const jornada = i + 1;
      for (const [localId, visitanteId] of rondas[i]) {
        await query(
          `INSERT INTO partidos (torneo_id, categoria_id, equipo_local_id, equipo_visitante_id, jornada)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.torneoId, req.params.categoriaId, localId, visitanteId, jornada]
        );
        cantidadCreados += 1;
      }
    }

    res.status(201).json({ ok: true, partidos_creados: cantidadCreados, jornadas: rondas.length, ida_vuelta: idaVuelta });
  } catch (err) {
    console.error('Error en POST fixture/generar:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/torneos/:torneoId/categorias/:categoriaId/fixture — vacía el
// fixture de esta categoría. Solo borra los partidos que TODAVÍA no se
// jugaron (los que ya tienen resultado cargado se conservan).
router.delete('/:torneoId/categorias/:categoriaId/fixture', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `DELETE FROM partidos WHERE torneo_id = $1 AND categoria_id = $2 AND estado != 'jugado' RETURNING id`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, borrados: rows.length });
  } catch (err) {
    console.error('Error en DELETE fixture:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId/jugadores
// Devuelve los jugadores activos de cada club (local/visitante) de ese
// partido, más las estadísticas ya cargadas (si las hay) — para armar el
// formulario de "goles y tarjetas por jugador" al cargar el resultado.
router.get('/:torneoId/categorias/:categoriaId/partidos/:partidoId/jugadores', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const partidoResult = await query(
      `SELECT p.*, cl.id AS club_local_id, cl.nombre AS club_local_nombre,
              cv.id AS club_visitante_id, cv.nombre AS club_visitante_nombre
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       WHERE p.id = $1 AND p.torneo_id = $2 AND p.categoria_id = $3`,
      [req.params.partidoId, req.params.torneoId, req.params.categoriaId]
    );
    const partido = partidoResult.rows[0];
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    const jugadoresLocal = await query(
      'SELECT id, nombre, apellido, numero_camiseta FROM jugadores WHERE club_id = $1 AND activo = TRUE ORDER BY apellido ASC',
      [partido.club_local_id]
    );
    const jugadoresVisitante = await query(
      'SELECT id, nombre, apellido, numero_camiseta FROM jugadores WHERE club_id = $1 AND activo = TRUE ORDER BY apellido ASC',
      [partido.club_visitante_id]
    );
    const estadisticas = await query(
      'SELECT * FROM partido_estadisticas_jugador WHERE partido_id = $1',
      [req.params.partidoId]
    );

    res.json({
      ok: true,
      equipo_local_id: partido.equipo_local_id,
      equipo_visitante_id: partido.equipo_visitante_id,
      jugadores_local: jugadoresLocal.rows,
      jugadores_visitante: jugadoresVisitante.rows,
      estadisticas: estadisticas.rows
    });
  } catch (err) {
    console.error('Error en GET jugadores de partido:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId/resultado
// Cargar (o corregir) el resultado de un partido. Dispara el recálculo
// automático de la tabla de posiciones de esa categoría. Opcionalmente
// recibe `estadisticas_jugadores`: [{jugador_id, equipo_torneo_id, goles,
// tarjetas_amarillas, tarjetas_rojas}] — reemplaza por completo las
// estadísticas cargadas para este partido (permite corregir la carga).
router.put('/:torneoId/categorias/:categoriaId/partidos/:partidoId/resultado', async (req, res) => {
  const { resultado_local, resultado_visitante, detalle_resultado, observaciones, estadisticas_jugadores } = req.body;

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
    const partido = rows[0];

    if (Array.isArray(estadisticas_jugadores)) {
      await query('DELETE FROM partido_estadisticas_jugador WHERE partido_id = $1', [req.params.partidoId]);
      for (const est of estadisticas_jugadores) {
        const goles = Number(est.goles) || 0;
        const amarillas = Number(est.tarjetas_amarillas) || 0;
        const rojas = Number(est.tarjetas_rojas) || 0;
        if (!est.jugador_id || !est.equipo_torneo_id) continue;
        if (goles === 0 && amarillas === 0 && rojas === 0) continue; // no vale la pena guardar filas vacías
        if (est.equipo_torneo_id !== partido.equipo_local_id && est.equipo_torneo_id !== partido.equipo_visitante_id) {
          continue; // equipo que no corresponde a este partido, se ignora
        }
        await query(
          `INSERT INTO partido_estadisticas_jugador (partido_id, jugador_id, equipo_torneo_id, goles, tarjetas_amarillas, tarjetas_rojas)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (partido_id, jugador_id) DO UPDATE SET
             equipo_torneo_id = EXCLUDED.equipo_torneo_id,
             goles = EXCLUDED.goles,
             tarjetas_amarillas = EXCLUDED.tarjetas_amarillas,
             tarjetas_rojas = EXCLUDED.tarjetas_rojas`,
          [req.params.partidoId, est.jugador_id, est.equipo_torneo_id, goles, amarillas, rojas]
        );
      }
    }

    await recalcularTablaPosiciones(req.params.torneoId, req.params.categoriaId);

    res.json({ ok: true, partido });
  } catch (err) {
    console.error('Error en PUT resultado:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== GOLEADORES Y TARJETAS =====

// GET /liga/torneos/:torneoId/categorias/:categoriaId/goleadores
router.get('/:torneoId/categorias/:categoriaId/goleadores', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre, SUM(e.goles)::int AS goles
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.goles) > 0
       ORDER BY goles DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, goleadores: rows });
  } catch (err) {
    console.error('Error en GET goleadores:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/torneos/:torneoId/categorias/:categoriaId/tarjetas
router.get('/:torneoId/categorias/:categoriaId/tarjetas', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre,
              SUM(e.tarjetas_amarillas)::int AS tarjetas_amarillas, SUM(e.tarjetas_rojas)::int AS tarjetas_rojas
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.tarjetas_amarillas) > 0 OR SUM(e.tarjetas_rojas) > 0
       ORDER BY tarjetas_rojas DESC, tarjetas_amarillas DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, tarjetas: rows });
  } catch (err) {
    console.error('Error en GET tarjetas:', err);
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
      `SELECT tp.*, c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario
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
