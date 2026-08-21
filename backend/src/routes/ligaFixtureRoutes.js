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

    // subcategoria_id es opcional: si viene, filtra solo los equipos de esa
    // subcategoría puntual (usado por la pantalla de "Gestionar equipos"
    // cuando se entra desde una subcategoría); si no viene, trae TODOS los
    // equipos de la categoría (vista general).
    const params = [req.params.torneoId, req.params.categoriaId];
    let filtroSub = '';
    if (req.query.subcategoria_id) {
      params.push(req.query.subcategoria_id);
      filtroSub = ` AND et.subcategoria_id = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT et.*, c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
              sub.nombre AS subcategoria_nombre
       FROM equipos_torneo et
       JOIN clubes c ON c.id = et.club_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = et.subcategoria_id
       WHERE et.torneo_id = $1 AND et.categoria_id = $2${filtroSub}
       ORDER BY c.nombre ASC`,
      params
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

// DELETE /liga/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoId —
// da de baja a un club de la categoría. Se borran en cascada sus partidos y
// su fila de tabla de posiciones (el resto del fixture no se re-numera).
router.delete('/:torneoId/categorias/:categoriaId/equipos/:equipoId', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    const { rowCount } = await query(
      'DELETE FROM equipos_torneo WHERE id = $1 AND torneo_id = $2 AND categoria_id = $3',
      [req.params.equipoId, req.params.torneoId, req.params.categoriaId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Equipo no encontrado en esa categoría' });

    // Los partidos y la fila de tabla del equipo borrado ya se fueron en
    // cascada; recalculamos para que los rivales que le habían ganado/perdido
    // no arrastren esos resultados en su tabla.
    await recalcularTablaPosiciones(req.params.torneoId, req.params.categoriaId);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE equipo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== PARTIDOS (fixture) =====

// GET /liga/torneos/:torneoId/categorias/:categoriaId/partidos
router.get('/:torneoId/categorias/:categoriaId/partidos', async (req, res) => {
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    // Si la categoría tiene subcategorías, el fixture es siempre por
    // subcategoría (los equipos ya pertenecen a una sola); subcategoria_id
    // llega en la query string y filtra vía el equipo local (ambos equipos
    // de un partido son siempre de la misma subcategoría).
    const subcategoriaId = req.query.subcategoria_id || null;

    const { rows } = await query(
      `SELECT p.*, cl.id AS club_local_id, cv.id AS club_visitante_id,
              cl.nombre AS club_local_nombre, cv.nombre AS club_visitante_nombre,
              cl.color_primario AS club_local_color, cv.color_primario AS club_visitante_color,
              cl.logo_url AS club_local_logo_url, cv.logo_url AS club_visitante_logo_url,
              COALESCE(ccSel.direccion, ccl.direccion, cl.direccion) AS club_local_direccion,
              COALESCE(ccSel.tipo_techo, ccl.tipo_techo) AS club_local_cancha_techo,
              COALESCE(ccSel.tamanio, ccl.tamanio) AS club_local_cancha_tamanio,
              COALESCE(ccSel.piso, ccl.piso) AS club_local_cancha_piso,
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
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND el.subcategoria_id IS NOT DISTINCT FROM $3::uuid
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
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
      'SELECT jornada, descripcion FROM fixture_jornadas WHERE torneo_id = $1 AND categoria_id = $2 AND subcategoria_id IS NOT DISTINCT FROM $3::uuid',
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
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
  const { descripcion, subcategoria_id } = req.body;
  const jornada = Number(req.params.jornada);
  const subcategoriaId = subcategoria_id || null;
  if (!Number.isInteger(jornada)) return res.status(400).json({ ok: false, error: 'Jornada inválida' });
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    // Borra la fila existente de esta (categoría, subcategoría, jornada) y,
    // si corresponde, la vuelve a insertar — más simple que un ON CONFLICT
    // sobre la combinación con subcategoria_id (que puede ser NULL).
    await query(
      'DELETE FROM fixture_jornadas WHERE torneo_id = $1 AND categoria_id = $2 AND jornada = $3 AND subcategoria_id IS NOT DISTINCT FROM $4::uuid',
      [req.params.torneoId, req.params.categoriaId, jornada, subcategoriaId]
    );

    if (!descripcion || !descripcion.trim()) {
      return res.json({ ok: true, jornada: { jornada, descripcion: null } });
    }

    const { rows } = await query(
      `INSERT INTO fixture_jornadas (torneo_id, categoria_id, subcategoria_id, jornada, descripcion)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING jornada, descripcion`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId, jornada, descripcion.trim()]
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

    // Los dos equipos tienen que ser de la misma subcategoría (o ninguno
    // tener subcategoría, si la categoría no las usa) — un equipo de "2018"
    // no puede jugar contra uno de "2019".
    const equiposCheck = await query(
      'SELECT id, subcategoria_id FROM equipos_torneo WHERE id = ANY($1::uuid[]) AND torneo_id = $2 AND categoria_id = $3',
      [[equipo_local_id, equipo_visitante_id], req.params.torneoId, req.params.categoriaId]
    );
    if (equiposCheck.rows.length !== 2) {
      return res.status(400).json({ ok: false, error: 'Alguno de los equipos elegidos no pertenece a esta categoría' });
    }
    const subcategoriasEquipos = new Set(equiposCheck.rows.map((r) => r.subcategoria_id || null));
    if (subcategoriasEquipos.size > 1) {
      return res.status(400).json({ ok: false, error: 'Los dos equipos tienen que ser de la misma subcategoría' });
    }

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
  const { ida_vuelta, subcategoria_id } = req.body;
  const subcategoriaId = subcategoria_id || null;
  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    // Todo lo de acá abajo se restringe a los equipos de la subcategoría
    // indicada (o a los que no tienen subcategoría, si la categoría no las
    // usa) — así un fixture "Baby Fútbol A" con subcategorías 2018/2019/2020
    // genera un round-robin propio para cada una, sin mezclar equipos.
    const existentes = await query(
      `SELECT COUNT(*)::int AS cantidad FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND el.subcategoria_id IS NOT DISTINCT FROM $3::uuid`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
    );
    if (existentes.rows[0].cantidad > 0) {
      return res.status(409).json({
        ok: false,
        error: 'Ya hay un fixture cargado para esta categoría/subcategoría. Borralo primero (botón "Vaciar fixture") si querés generar uno nuevo.'
      });
    }

    const equiposResult = await query(
      'SELECT id FROM equipos_torneo WHERE torneo_id = $1 AND categoria_id = $2 AND activo = TRUE AND subcategoria_id IS NOT DISTINCT FROM $3::uuid',
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
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

// Compara los club_id de varias "unidades" (categorías o subcategorías) que
// se van a espejar entre sí: para que tenga sentido armar el MISMO fixture
// en todas, tienen que tener cargados exactamente los mismos clubes.
// Devuelve un mensaje de error si no coinciden, o null si están OK.
function validarClubesIguales(unidades) {
  const [primera, ...resto] = unidades;
  const clubesPrimera = new Set(primera.equipos.map((e) => e.club_id));
  for (const unidad of resto) {
    const clubesUnidad = new Set(unidad.equipos.map((e) => e.club_id));
    if (clubesUnidad.size !== clubesPrimera.size || [...clubesPrimera].some((id) => !clubesUnidad.has(id))) {
      return `"${primera.nombre}" y "${unidad.nombre}" no tienen exactamente los mismos clubes inscriptos. Para generar un fixture espejado, todas las unidades elegidas tienen que tener cargados los mismos equipos.`;
    }
  }
  return null;
}

// POST /liga/torneos/:torneoId/fixture/generar-espejado — genera el MISMO
// fixture (los mismos enfrentamientos entre clubes, jornada por jornada) en
// varias categorías o subcategorías a la vez. Pensado para torneos donde el
// mismo grupo de clubes juega en paralelo en cada una — ej: "Baby Fútbol"
// con categorías 2018/2019/2020 (mismos equipos en las tres), o una Zona con
// subcategorías 2018/2019 adentro (mismos equipos de esa zona en las dos).
// Body: { nivel: 'categorias' | 'subcategorias', categoria_id (obligatorio
// si nivel es 'subcategorias'), ida_vuelta }
router.post('/:torneoId/fixture/generar-espejado', async (req, res) => {
  const { nivel, categoria_id, ida_vuelta } = req.body;
  if (!['categorias', 'subcategorias'].includes(nivel)) {
    return res.status(400).json({ ok: false, error: "Falta indicar nivel: 'categorias' o 'subcategorias'" });
  }
  try {
    const torneoResult = await query('SELECT * FROM torneos WHERE id = $1 AND liga_id = $2', [req.params.torneoId, req.ligaId]);
    const torneo = torneoResult.rows[0];
    if (!torneo) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    // Arma la lista de "unidades" a espejar: cada una con su categoria_id, su
    // subcategoria_id (o null) y sus equipos ({id, club_id}) ya inscriptos.
    const unidades = [];
    if (nivel === 'categorias') {
      // Sólo entran las categorías SIN subcategorías (las que tienen se
      // espejan a nivel subcategoría, con el otro modo) — mezclar ambas
      // llevaría a duplicar o pisar la lógica de espejado.
      const categoriasResult = await query(
        `SELECT c.id, c.nombre FROM categorias c
         WHERE c.torneo_id = $1 AND NOT EXISTS (SELECT 1 FROM categoria_subcategorias cs WHERE cs.categoria_id = c.id)
         ORDER BY c.orden ASC, c.nombre ASC`,
        [req.params.torneoId]
      );
      if (categoriasResult.rows.length < 2) {
        return res.status(400).json({ ok: false, error: 'Necesitás al menos 2 categorías (sin subcategorías) en este torneo para espejar el fixture entre ellas' });
      }
      for (const cat of categoriasResult.rows) {
        const equiposResult = await query(
          'SELECT id, club_id FROM equipos_torneo WHERE torneo_id = $1 AND categoria_id = $2 AND activo = TRUE AND subcategoria_id IS NULL',
          [req.params.torneoId, cat.id]
        );
        unidades.push({ nombre: cat.nombre, categoria_id: cat.id, subcategoria_id: null, equipos: equiposResult.rows });
      }
    } else {
      if (!categoria_id) return res.status(400).json({ ok: false, error: 'Falta categoria_id' });
      const categoriaOk = await query('SELECT id, nombre FROM categorias WHERE id = $1 AND torneo_id = $2', [categoria_id, req.params.torneoId]);
      if (!categoriaOk.rows[0]) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en este torneo' });

      const subcategoriasResult = await query(
        'SELECT id, nombre FROM categoria_subcategorias WHERE categoria_id = $1 ORDER BY orden ASC, nombre ASC',
        [categoria_id]
      );
      if (subcategoriasResult.rows.length < 2) {
        return res.status(400).json({ ok: false, error: 'Esta categoría necesita al menos 2 subcategorías para espejar el fixture entre ellas' });
      }
      for (const sub of subcategoriasResult.rows) {
        const equiposResult = await query(
          'SELECT id, club_id FROM equipos_torneo WHERE torneo_id = $1 AND categoria_id = $2 AND subcategoria_id = $3 AND activo = TRUE',
          [req.params.torneoId, categoria_id, sub.id]
        );
        unidades.push({ nombre: sub.nombre, categoria_id, subcategoria_id: sub.id, equipos: equiposResult.rows });
      }
    }

    const sinEquiposSuficientes = unidades.find((u) => u.equipos.length < 2);
    if (sinEquiposSuficientes) {
      return res.status(400).json({
        ok: false,
        error: `"${sinEquiposSuficientes.nombre}" tiene menos de 2 equipos inscriptos. Todas las unidades a espejar necesitan al menos 2 equipos.`
      });
    }

    const errorClubes = validarClubesIguales(unidades);
    if (errorClubes) return res.status(400).json({ ok: false, error: errorClubes });

    // Ninguna de las unidades puede tener ya un fixture cargado (mismo
    // chequeo que la generación individual, pero repetido por cada una).
    for (const unidad of unidades) {
      const existentes = await query(
        `SELECT COUNT(*)::int AS cantidad FROM partidos p
         JOIN equipos_torneo el ON el.id = p.equipo_local_id
         WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND el.subcategoria_id IS NOT DISTINCT FROM $3::uuid`,
        [req.params.torneoId, unidad.categoria_id, unidad.subcategoria_id]
      );
      if (existentes.rows[0].cantidad > 0) {
        return res.status(409).json({
          ok: false,
          error: `"${unidad.nombre}" ya tiene un fixture cargado. Vaciá el fixture de todas las unidades elegidas antes de generar uno nuevo espejado.`
        });
      }
    }

    // El sorteo se hace UNA sola vez, en base a los club_id (que son los
    // mismos en todas las unidades ya validado arriba); después se aplica
    // tal cual a cada unidad, traduciendo cada club_id al equipo_torneo_id
    // que le corresponde en esa categoría/subcategoría puntual.
    const clubIds = unidades[0].equipos.map((e) => e.club_id);
    const esAperturaClausura = torneo.formato_juego === 'apertura_clausura';
    const idaVuelta = esAperturaClausura ? true : (ida_vuelta != null ? !!ida_vuelta : torneo.formato_juego === 'liguilla_ida_vuelta');
    const rondas = generarRoundRobin(clubIds, idaVuelta);
    const mitadRondas = esAperturaClausura ? rondas.length / 2 : null;

    let cantidadCreados = 0;
    for (const unidad of unidades) {
      const equipoIdPorClub = new Map(unidad.equipos.map((e) => [e.club_id, e.id]));
      for (let i = 0; i < rondas.length; i++) {
        const jornada = i + 1;
        const ronda = esAperturaClausura ? (i < mitadRondas ? 'apertura' : 'clausura') : null;
        for (const [clubLocalId, clubVisitanteId] of rondas[i]) {
          await query(
            `INSERT INTO partidos (torneo_id, categoria_id, equipo_local_id, equipo_visitante_id, jornada, ronda)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.params.torneoId, unidad.categoria_id, equipoIdPorClub.get(clubLocalId), equipoIdPorClub.get(clubVisitanteId), jornada, ronda]
          );
          cantidadCreados += 1;
        }
      }
    }

    res.status(201).json({
      ok: true,
      partidos_creados: cantidadCreados,
      jornadas: rondas.length,
      unidades: unidades.length,
      ida_vuelta: idaVuelta
    });
  } catch (err) {
    console.error('Error en POST fixture/generar-espejado:', err);
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

    const subcategoriaId = req.query.subcategoria_id || null;
    const { rows } = await query(
      `DELETE FROM partidos p USING equipos_torneo el
       WHERE p.equipo_local_id = el.id AND p.torneo_id = $1 AND p.categoria_id = $2 AND p.estado != 'jugado'
         AND el.subcategoria_id IS NOT DISTINCT FROM $3::uuid
       RETURNING p.id`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
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
  let { resultado_local, resultado_visitante } = req.body;
  const { detalle_resultado, observaciones, estadisticas_jugadores, no_presento_local, no_presento_visitante } = req.body;
  const ausenteLocal = !!no_presento_local;
  const ausenteVisitante = !!no_presento_visitante;

  // El resultado manual solo es obligatorio cuando el partido se jugó
  // normalmente. Si se tildó que alguno (o los dos) no se presentó, el
  // marcador se completa solo más abajo.
  if (!ausenteLocal && !ausenteVisitante && (resultado_local == null || resultado_visitante == null)) {
    return res.status(400).json({ ok: false, error: 'Faltan resultado_local y/o resultado_visitante' });
  }

  try {
    const contexto = await buscarCategoriaDeMiLiga(req.params.torneoId, req.params.categoriaId, req.ligaId);
    if (!contexto) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en tu Liga' });

    if (ausenteLocal && ausenteVisitante) {
      // Ningún equipo se presentó: los dos pierden el partido, sin usar
      // ningún marcador (el 0 a 0 es solo para tener algo que mostrar).
      resultado_local = 0;
      resultado_visitante = 0;
    } else if (ausenteLocal) {
      resultado_local = contexto.goles_walkover_perdedor;
      resultado_visitante = contexto.goles_walkover_ganador;
    } else if (ausenteVisitante) {
      resultado_local = contexto.goles_walkover_ganador;
      resultado_visitante = contexto.goles_walkover_perdedor;
    }

    const { rows } = await query(
      `UPDATE partidos SET
         resultado_local = $1, resultado_visitante = $2,
         detalle_resultado = COALESCE($3, detalle_resultado),
         observaciones = COALESCE($4, observaciones),
         no_presento_local = $5, no_presento_visitante = $6,
         estado = 'jugado',
         actualizado_at = NOW()
       WHERE id = $7 AND torneo_id = $8 AND categoria_id = $9
       RETURNING *`,
      [resultado_local, resultado_visitante,
       detalle_resultado ? JSON.stringify(detalle_resultado) : null,
       observaciones || null, ausenteLocal, ausenteVisitante,
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

    const subcategoriaId = req.query.subcategoria_id || null;
    // ronda: 'general' (default, todo el torneo) o 'apertura'/'clausura' para
    // torneos con ese formato — mismo criterio que la tabla de posiciones.
    const ronda = ['general', 'apertura', 'clausura'].includes(req.query.ronda) ? req.query.ronda : 'general';
    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre, SUM(e.goles)::int AS goles
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND et.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND ($4 = 'general' OR p.ronda = $4)
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.goles) > 0
       ORDER BY goles DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId, ronda]
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

    const subcategoriaId = req.query.subcategoria_id || null;
    const ronda = ['general', 'apertura', 'clausura'].includes(req.query.ronda) ? req.query.ronda : 'general';
    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre,
              SUM(e.tarjetas_amarillas)::int AS tarjetas_amarillas, SUM(e.tarjetas_rojas)::int AS tarjetas_rojas
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND et.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND ($4 = 'general' OR p.ronda = $4)
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.tarjetas_amarillas) > 0 OR SUM(e.tarjetas_rojas) > 0
       ORDER BY tarjetas_rojas DESC, tarjetas_amarillas DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId, ronda]
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
    const subcategoriaId = req.query.subcategoria_id || null;
    // LEFT JOIN desde equipos_torneo (no desde tabla_posiciones): así todos
    // los equipos inscriptos aparecen en la tabla desde el primer momento,
    // en 0, aunque todavía no se haya cargado ningún resultado (antes solo
    // aparecían los equipos que YA tenían una fila calculada en
    // tabla_posiciones, así que una categoría sin partidos jugados no
    // mostraba tabla). El orden A-Z de club queda como desempate final, que
    // es justamente lo que se ve cuando todos los equipos están en 0.
    const { rows } = await query(
      `SELECT et.id AS equipo_torneo_id, c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
              COALESCE(tp.partidos_jugados, 0) AS partidos_jugados,
              COALESCE(tp.ganados, 0) AS ganados,
              COALESCE(tp.empatados, 0) AS empatados,
              COALESCE(tp.perdidos, 0) AS perdidos,
              COALESCE(tp.a_favor, 0) AS a_favor,
              COALESCE(tp.en_contra, 0) AS en_contra,
              COALESCE(tp.diferencia, 0) AS diferencia,
              COALESCE(tp.puntos, 0) AS puntos,
              COALESCE(u5.resultados, ARRAY[]::text[]) AS ultimos5
       FROM equipos_torneo et
       JOIN clubes c ON c.id = et.club_id
       LEFT JOIN tabla_posiciones tp
         ON tp.equipo_torneo_id = et.id AND tp.torneo_id = et.torneo_id AND tp.categoria_id = et.categoria_id AND tp.ronda = $3
       LEFT JOIN LATERAL (
         SELECT array_agg(resultado ORDER BY orden_fecha DESC, orden_jornada DESC) AS resultados
         FROM (
           SELECT
             CASE
               WHEN (p.equipo_local_id = et.id AND p.resultado_local > p.resultado_visitante)
                 OR (p.equipo_visitante_id = et.id AND p.resultado_visitante > p.resultado_local)
               THEN 'V'
               WHEN p.resultado_local = p.resultado_visitante THEN 'E'
               ELSE 'P'
             END AS resultado,
             p.fecha AS orden_fecha,
             p.jornada AS orden_jornada
           FROM partidos p
           WHERE (p.equipo_local_id = et.id OR p.equipo_visitante_id = et.id)
             AND p.resultado_local IS NOT NULL AND p.resultado_visitante IS NOT NULL
           ORDER BY p.fecha DESC NULLS LAST, p.jornada DESC NULLS LAST
           LIMIT 5
         ) ultimos
       ) u5 ON true
       WHERE et.torneo_id = $1 AND et.categoria_id = $2 AND et.subcategoria_id IS NOT DISTINCT FROM $4::uuid
       ORDER BY COALESCE(tp.puntos, 0) DESC, COALESCE(tp.diferencia, 0) DESC, COALESCE(tp.a_favor, 0) DESC, c.nombre ASC`,
      [req.params.torneoId, req.params.categoriaId, ronda, subcategoriaId]
    );
    res.json({ ok: true, tabla: rows, formato_juego: contexto.formato_juego });
  } catch (err) {
    console.error('Error en GET tabla:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
