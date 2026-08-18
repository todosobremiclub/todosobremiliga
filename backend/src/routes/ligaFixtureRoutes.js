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
      `SELECT p.*, cl.id AS club_local_id, cv.id AS club_visitante_id,
              cl.nombre AS club_local_nombre, cv.nombre AS club_visitante_nombre,
              cl.color_primario AS club_local_color, cv.color_primario AS club_visitante_color,
              cl.logo_url AS club_local_logo_url, cv.logo_url AS club_visitante_logo_url,
              cl.direccion AS club_local_direccion,
              COALESCE(ccSel.tipo_techo, ccl.tipo_techo) AS club_local_cancha_techo,
              COALESCE(ccSel.tamanio, ccl.tamanio) AS club_local_cancha_tamanio,
              COALESCE(tcSel.nombre, tcl.nombre) AS club_local_cancha_tipo_nombre,
              COALESCE(ccSel.nombre, ccl.nombre) AS club_local_cancha_nombre,
              pr.nombre AS predio_nombre, cp.nombre AS cancha_predio_nombre,
              cp.tipo_techo AS cancha_predio_techo, cp.tamanio AS cancha_predio_tamanio,
              tcp.nombre AS cancha_predio_tipo_nombre
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       LEFT JOIN clubes_canchas ccl ON ccl.club_id = cl.id AND ccl.es_principal = TRUE
       LEFT JOIN tipos_cancha tcl ON tcl.id = ccl.tipo_cancha_id
       LEFT JOIN clubes_canchas ccSel ON ccSel.id = p.cancha_club_id
       LEFT JOIN tipos_cancha tcSel ON tcSel.id = ccSel.tipo_cancha_id
       LEFT JOIN canchas_predio cp ON cp.id = p.cancha_predio_id
       LEFT JOIN predios_liga pr ON pr.id = cp.predio_id
       LEFT JOIN tipos_cancha tcp ON tcp.id = cp.tipo_cancha_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId]
    );

    const arbitrosResult = rows.length
      ? await query(
          `SELECT pa.partido_id, a.id, a.nombre, a.apellido, a.tipo
           FROM partido_arbitros pa
           JOIN arbitros_liga a ON a.id = pa.arbitro_id
           WHERE pa.partido_id = ANY($1::uuid[])
           ORDER BY a.apellido ASC, a.nombre ASC`,
          [rows.map((p) => p.id)]
        )
      : { rows: [] };
    const partidos = rows.map((p) => ({
      ...p,
      arbitros: arbitrosResult.rows.filter((a) => a.partido_id === p.id).map((a) => ({ id: a.id, nombre: a.nombre, apellido: a.apellido, tipo: a.tipo }))
    }));

    const jornadasResult = await query(
      'SELECT jornada, descripcion FROM fixture_jornadas WHERE torneo_id = $1 AND categoria_id = $2',
      [req.params.torneoId, req.params.categoriaId]
    );

    res.json({ ok: true, partidos, cancha_juego: contexto.cancha_juego, jornadas: jornadasResult.rows });
  } catch (err) {
    console.error('Error en GET partidos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId/jornadas/:jornada —
// guarda (o borra, si viene vacía) la descripción de una fecha del fixture
// (ej: "Sábado 8 de Agosto" o "Semana del 1 al 8").
router.put('/:torneoId/categorias/:categoriaId/jornadas/:jornada', async (req, res) => {
  const { descripcion } = req.body;
  const jornada = Number(req.params.jornada);
  if (!Number.isInteger(jornada)) return res.status(400).json({ ok: false, error: 'Jornada inválida' });
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    if (!descripcion || !descripcion.trim()) {
      await query('DELETE FROM fixture_jornadas WHERE torneo_id = $1 AND categoria_id = $2 AND jornada = $3', [req.params.torneoId, req.params.categoriaId, jornada]);
      return res.json({ ok: true, jornada: { jornada, descripcion: null } });
    }

    const { rows } = await query(
      `INSERT INTO fixture_jornadas (torneo_id, categoria_id, jornada, descripcion)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (torneo_id, categoria_id, jornada) DO UPDATE SET descripcion = EXCLUDED.descripcion
       RETURNING jornada, descripcion`,
      [req.params.torneoId, req.params.categoriaId, jornada, descripcion.trim()]
    );
    res.json({ ok: true, jornada: rows[0] });
  } catch (err) {
    console.error('Error en PUT jornada descripcion:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId/arbitros
// — reemplaza por completo el/los árbitro(s) asignados a un partido
// (body: { arbitro_ids: [] }), tomados del listado de Configuración → Árbitros.
router.put('/:torneoId/categorias/:categoriaId/partidos/:partidoId/arbitros', async (req, res) => {
  const { arbitro_ids } = req.body;
  if (!Array.isArray(arbitro_ids)) {
    return res.status(400).json({ ok: false, error: 'Falta arbitro_ids (array)' });
  }
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const partidoOk = await query(
      'SELECT 1 FROM partidos WHERE id = $1 AND torneo_id = $2 AND categoria_id = $3',
      [req.params.partidoId, req.params.torneoId, req.params.categoriaId]
    );
    if (!partidoOk.rows[0]) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    const validosResult = arbitro_ids.length
      ? await query('SELECT id FROM arbitros_liga WHERE liga_id = $1 AND id = ANY($2::uuid[])', [req.ligaId, arbitro_ids])
      : { rows: [] };
    const idsValidos = validosResult.rows.map((r) => r.id);

    await query('DELETE FROM partido_arbitros WHERE partido_id = $1', [req.params.partidoId]);
    for (const arbitroId of idsValidos) {
      await query('INSERT INTO partido_arbitros (partido_id, arbitro_id) VALUES ($1, $2)', [req.params.partidoId, arbitroId]);
    }
    res.json({ ok: true, guardados: idsValidos.length });
  } catch (err) {
    console.error('Error en PUT partido arbitros:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId —
// edición rápida de fecha/hora y de dónde se juega (cancha propia de la Liga
// o, si el torneo es "canchas de los clubes", simplemente la sede en texto).
router.patch('/:torneoId/categorias/:categoriaId/partidos/:partidoId', async (req, res) => {
  const { fecha, hora, sede, cancha_predio_id, cancha_club_id } = req.body;
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    if (cancha_predio_id) {
      const canchaOk = await query(
        `SELECT 1 FROM canchas_predio cp JOIN predios_liga pr ON pr.id = cp.predio_id
         WHERE cp.id = $1 AND pr.liga_id = $2`,
        [cancha_predio_id, req.ligaId]
      );
      if (!canchaOk.rows[0]) return res.status(400).json({ ok: false, error: 'Esa cancha no pertenece a tu Liga' });
    }

    if (cancha_club_id) {
      // La cancha elegida tiene que ser del club LOCAL de este mismo partido.
      const canchaOk = await query(
        `SELECT 1 FROM clubes_canchas cc
         JOIN equipos_torneo et ON et.club_id = cc.club_id
         JOIN partidos p ON p.equipo_local_id = et.id
         WHERE cc.id = $1 AND p.id = $2`,
        [cancha_club_id, req.params.partidoId]
      );
      if (!canchaOk.rows[0]) return res.status(400).json({ ok: false, error: 'Esa cancha no pertenece al club local de este partido' });
    }

    const { rows } = await query(
      `UPDATE partidos SET
         fecha = $1, hora = $2, sede = COALESCE($3, sede), cancha_predio_id = $4,
         cancha_club_id = $5, actualizado_at = NOW()
       WHERE id = $6 AND torneo_id = $7 AND categoria_id = $8
       RETURNING *`,
      [fecha || null, hora || null, sede, cancha_predio_id || null, cancha_club_id || null,
       req.params.partidoId, req.params.torneoId, req.params.categoriaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });
    res.json({ ok: true, partido: rows[0] });
  } catch (err) {
    console.error('Error en PATCH partido:', err);
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

    // "Apertura y Clausura" SIEMPRE genera las dos ruedas (apertura + clausura
    // invirtiendo localía), etiquetando cada partido con su ronda para poder
    // armar las 3 tablas (apertura / clausura / general) por separado.
    const esAperturaClausura = contexto.formato_juego === 'apertura_clausura';
    const idaVuelta = esAperturaClausura ? true : (ida_vuelta != null ? !!ida_vuelta : contexto.formato_juego === 'liguilla_ida_vuelta');
    const rondas = generarRoundRobin(equipoIds, idaVuelta);
    const mitadRondas = esAperturaClausura ? rondas.length / 2 : null;

    let cantidadCreados = 0;
    for (let i = 0; i < rondas.length; i++) {
      const jornada = i + 1;
      const ronda = esAperturaClausura ? (i < mitadRondas ? 'apertura' : 'clausura') : null;
      for (const [localId, visitanteId] of rondas[i]) {
        await query(
          `INSERT INTO partidos (torneo_id, categoria_id, equipo_local_id, equipo_visitante_id, jornada, ronda)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.params.torneoId, req.params.categoriaId, localId, visitanteId, jornada, ronda]
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

    // ronda: 'general' (default), o 'apertura'/'clausura' para torneos con
    // formato "Apertura y Clausura".
    const ronda = ['general', 'apertura', 'clausura'].includes(req.query.ronda) ? req.query.ronda : 'general';
    const { rows } = await query(
      `SELECT tp.*, c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario
       FROM tabla_posiciones tp
       JOIN equipos_torneo et ON et.id = tp.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE tp.torneo_id = $1 AND tp.categoria_id = $2 AND tp.ronda = $3
       ORDER BY tp.puntos DESC, tp.diferencia DESC, tp.a_favor DESC`,
      [req.params.torneoId, req.params.categoriaId, ronda]
    );
    res.json({ ok: true, tabla: rows, formato_juego: contexto.formato_juego });
  } catch (err) {
    console.error('Error en GET tabla:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
