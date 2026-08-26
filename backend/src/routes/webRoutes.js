const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas de este archivo son PÚBLICAS (sin login) — son las que va
// a consumir el sitio web público de cada Liga. Por eso siempre se filtra
// por `ligas.activo = TRUE`: una Liga desactivada no debe mostrar nada acá.

// GET /web/ligas — listado público de Ligas activas
router.get('/ligas', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, slug, logo_url, direccion, color_primario, color_secundario
       FROM ligas WHERE activo = TRUE AND tipo = 'productiva' ORDER BY nombre ASC`
    );
    res.json({ ok: true, ligas: rows });
  } catch (err) {
    console.error('Error en GET /web/ligas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/noticias-globales — noticias de la plataforma (Super Admin),
// publicadas, para la home pública (/sitio/index.html).
router.get('/noticias-globales', async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM noticias_globales WHERE estado = 'publicada'
       ORDER BY destacada DESC, publicado_at DESC`
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET /web/noticias-globales:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug — detalle público de una Liga
router.get('/ligas/:slug', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, slug, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario,
              facebook_url, instagram_url, youtube_url
       FROM ligas WHERE slug = $1 AND activo = TRUE AND tipo = 'productiva'`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en GET /web/ligas/:slug:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId — datos básicos de un Torneo + su Liga (nombre,
// slug, colores) — usado por la página pública del Torneo/División/Equipo
// para pintar el breadcrumb hacia la Liga real y aplicar sus colores.
router.get('/torneos/:torneoId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.nombre, t.slug, t.deporte, t.temporada, t.estado, t.logo_url, t.cancha_juego,
              l.id AS liga_id, l.nombre AS liga_nombre, l.slug AS liga_slug,
              l.color_primario, l.color_secundario, l.logo_url AS liga_logo_url,
              l.facebook_url, l.instagram_url, l.youtube_url
       FROM torneos t
       JOIN ligas l ON l.id = t.liga_id
       WHERE t.id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.torneoId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    res.json({ ok: true, torneo: rows[0] });
  } catch (err) {
    console.error('Error en GET torneo publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/torneos/:torneoSlug — resuelve un Torneo por su slug
// DENTRO de una Liga (por su slug) a sus datos + id real. Es lo que usa la
// URL "linda" del sitio público (www.todosobremiliga.com.ar/<liga>/<torneo>)
// para saber a qué torneo corresponde, ya que esa URL no lleva el id.
router.get('/ligas/:slug/torneos/:torneoSlug', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.nombre, t.slug, t.deporte, t.temporada, t.estado, t.logo_url, t.cancha_juego,
              l.id AS liga_id, l.nombre AS liga_nombre, l.slug AS liga_slug,
              l.color_primario, l.color_secundario, l.logo_url AS liga_logo_url,
              l.facebook_url, l.instagram_url, l.youtube_url
       FROM torneos t
       JOIN ligas l ON l.id = t.liga_id
       WHERE l.slug = $1 AND t.slug = $2 AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.slug, req.params.torneoSlug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    res.json({ ok: true, torneo: rows[0] });
  } catch (err) {
    console.error('Error en GET torneo publico por slugs:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/torneos — torneos públicos de una Liga
router.get('/ligas/:slug/torneos', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.nombre, t.slug, t.deporte, t.temporada, t.formato_juego, t.estado, t.fecha_inicio, t.fecha_fin, t.logo_url
       FROM torneos t
       JOIN ligas l ON l.id = t.liga_id
       WHERE l.slug = $1 AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY t.creado_at DESC`,
      [req.params.slug]
    );
    res.json({ ok: true, torneos: rows });
  } catch (err) {
    console.error('Error en GET /web/ligas/:slug/torneos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias — divisiones públicas de un torneo,
// incluyendo sus categorías (si tiene): el sitio público usa esto para
// saber si una división se ve "pelada" (tabla/fixture directo) o hay que
// elegir antes una categoría (mismo criterio que el Panel de Liga).
router.get('/torneos/:torneoId/categorias', async (req, res) => {
  try {
    const categoriasResult = await query(
      `SELECT c.*
       FROM categorias c
       JOIN torneos t ON t.id = c.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE c.torneo_id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY c.orden ASC, c.nombre ASC`,
      [req.params.torneoId]
    );
    if (!categoriasResult.rows.length) return res.json({ ok: true, categorias: [] });

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
    console.error('Error en GET /web/torneos/:torneoId/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/tabla-general — tabla general pública para
// torneos con varias divisiones y/o categorías: suma en una sola tabla
// por club los puntos de todas las unidades (división sin categorías, o
// cada categoría) marcadas con "suma_tabla_general" (mismo criterio que
// la tabla general del Panel de Liga).
router.get('/torneos/:torneoId/tabla-general', async (req, res) => {
  try {
    const { rows } = await query(
      `WITH unidades AS (
         SELECT c.id AS categoria_id, cs.id AS subcategoria_id
         FROM categorias c
         JOIN torneos t ON t.id = c.torneo_id
         JOIN ligas l ON l.id = t.liga_id
         LEFT JOIN categoria_subcategorias cs ON cs.categoria_id = c.id
         WHERE c.torneo_id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'
           AND (
             (cs.id IS NOT NULL AND cs.suma_tabla_general = TRUE)
             OR (cs.id IS NULL AND c.suma_tabla_general = TRUE)
           )
       )
       SELECT et.club_id, cl.nombre AS club_nombre, cl.logo_url AS club_logo_url, cl.color_primario AS club_color_primario,
              SUM(tp.partidos_jugados)::int AS partidos_jugados,
              SUM(tp.ganados)::int AS ganados,
              SUM(tp.empatados)::int AS empatados,
              SUM(tp.perdidos)::int AS perdidos,
              SUM(tp.a_favor)::int AS a_favor,
              SUM(tp.en_contra)::int AS en_contra,
              SUM(tp.diferencia)::int AS diferencia,
              SUM(tp.puntos)::int AS puntos,
              COUNT(DISTINCT tp.categoria_id)::int AS categorias_sumadas
       FROM tabla_posiciones tp
       JOIN equipos_torneo et ON et.id = tp.equipo_torneo_id
       JOIN clubes cl ON cl.id = et.club_id
       JOIN unidades u ON u.categoria_id = tp.categoria_id AND u.subcategoria_id IS NOT DISTINCT FROM et.subcategoria_id
       WHERE tp.torneo_id = $1 AND tp.ronda = 'general'
       GROUP BY et.club_id, cl.nombre, cl.logo_url, cl.color_primario
       ORDER BY puntos DESC, diferencia DESC, club_nombre ASC`,
      [req.params.torneoId]
    );
    res.json({ ok: true, tabla: rows });
  } catch (err) {
    console.error('Error en GET /web/torneos/:torneoId/tabla-general:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/tabla-general — tabla
// general pública de UNA categoría/División puntual (ej: "División A" de un
// torneo "Super Liga" con Divisiones A-Z): suma en una sola tabla por club
// los puntos de todas las subcategorías de esa categoría (ej: 2013 a 2019)
// marcadas con "suma_tabla_general", sin mezclarse con las demás Divisiones
// del mismo torneo. Si la categoría no tiene subcategorías cargadas, usa
// directamente su propia tabla (sin sumar nada, ya que hay una sola unidad).
router.get('/torneos/:torneoId/categorias/:categoriaId/tabla-general', async (req, res) => {
  try {
    const { rows } = await query(
      `WITH unidades AS (
         SELECT c.id AS categoria_id, cs.id AS subcategoria_id
         FROM categorias c
         JOIN torneos t ON t.id = c.torneo_id
         JOIN ligas l ON l.id = t.liga_id
         LEFT JOIN categoria_subcategorias cs ON cs.categoria_id = c.id
         WHERE c.id = $2 AND c.torneo_id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'
           AND (
             (cs.id IS NOT NULL AND cs.suma_tabla_general = TRUE)
             OR (cs.id IS NULL AND c.suma_tabla_general = TRUE)
           )
       )
       SELECT et.club_id, cl.nombre AS club_nombre, cl.logo_url AS club_logo_url, cl.color_primario AS club_color_primario,
              SUM(tp.partidos_jugados)::int AS partidos_jugados,
              SUM(tp.ganados)::int AS ganados,
              SUM(tp.empatados)::int AS empatados,
              SUM(tp.perdidos)::int AS perdidos,
              SUM(tp.a_favor)::int AS a_favor,
              SUM(tp.en_contra)::int AS en_contra,
              SUM(tp.diferencia)::int AS diferencia,
              SUM(tp.puntos)::int AS puntos,
              COUNT(*)::int AS subcategorias_sumadas
       FROM tabla_posiciones tp
       JOIN equipos_torneo et ON et.id = tp.equipo_torneo_id
       JOIN clubes cl ON cl.id = et.club_id
       JOIN unidades u ON u.categoria_id = tp.categoria_id AND u.subcategoria_id IS NOT DISTINCT FROM et.subcategoria_id
       WHERE tp.torneo_id = $1 AND tp.categoria_id = $2 AND tp.ronda = 'general'
       GROUP BY et.club_id, cl.nombre, cl.logo_url, cl.color_primario
       ORDER BY puntos DESC, diferencia DESC, club_nombre ASC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, tabla: rows });
  } catch (err) {
    console.error('Error en GET /web/torneos/:torneoId/categorias/:categoriaId/tabla-general:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/tabla — tabla de posiciones pública
// LEFT JOIN desde equipos_torneo (no desde tabla_posiciones): así se ven todos
// los equipos inscriptos desde el primer momento, en 0, aunque todavía no se
// haya jugado ningún partido (mismo criterio que la tabla del Panel de Liga).
router.get('/torneos/:torneoId/categorias/:categoriaId/tabla', async (req, res) => {
  try {
    const subcategoriaId = req.query.subcategoria_id || null;
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
       JOIN torneos t ON t.id = et.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       LEFT JOIN tabla_posiciones tp
         ON tp.equipo_torneo_id = et.id AND tp.torneo_id = et.torneo_id AND tp.categoria_id = et.categoria_id AND tp.ronda = 'general'
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
       WHERE et.torneo_id = $1 AND et.categoria_id = $2 AND et.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY COALESCE(tp.puntos, 0) DESC, COALESCE(tp.diferencia, 0) DESC, COALESCE(tp.a_favor, 0) DESC, c.nombre ASC`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
    );
    res.json({ ok: true, tabla: rows });
  } catch (err) {
    console.error('Error en GET tabla publica:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/fixture — fixture y
// resultados públicos, con los mismos datos de cancha (dirección del club
// local, o predio/cancha propia de la Liga con si es techada o al aire
// libre) que ya usa el Panel de Liga, más la descripción de cada fecha
// (jornada) para poder agruparlas en el sitio público igual que el panel.
router.get('/torneos/:torneoId/categorias/:categoriaId/fixture', async (req, res) => {
  try {
    const subcategoriaId = req.query.subcategoria_id || null;

    const torneoResult = await query(
      `SELECT t.cancha_juego FROM torneos t
       JOIN ligas l ON l.id = t.liga_id
       WHERE t.id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.torneoId]
    );
    if (!torneoResult.rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });

    const { rows } = await query(
      `SELECT p.id, p.fecha, p.hora, p.sede, p.jornada, p.estado,
              p.resultado_local, p.resultado_visitante, p.detalle_resultado,
              p.no_presento_local, p.no_presento_visitante,
              el.id AS equipo_local_torneo_id, ev.id AS equipo_visitante_torneo_id,
              cl.nombre AS club_local_nombre, cl.logo_url AS club_local_logo_url, cl.color_primario AS club_local_color,
              cv.nombre AS club_visitante_nombre, cv.logo_url AS club_visitante_logo_url, cv.color_primario AS club_visitante_color,
              COALESCE(ccSel.direccion, ccl.direccion, cl.direccion) AS club_local_direccion,
              COALESCE(ccSel.tipo_techo, ccl.tipo_techo) AS club_local_cancha_techo,
              COALESCE(ccSel.nombre, ccl.nombre) AS club_local_cancha_nombre,
              pr.nombre AS predio_nombre, pr.direccion AS predio_direccion,
              pr.ciudad AS predio_ciudad, pr.provincia AS predio_provincia,
              cp.nombre AS cancha_predio_nombre, cp.tipo_techo AS cancha_predio_techo
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       LEFT JOIN clubes_canchas ccl ON ccl.club_id = cl.id AND ccl.es_principal = TRUE
       LEFT JOIN clubes_canchas ccSel ON ccSel.id = p.cancha_club_id
       LEFT JOIN canchas_predio cp ON cp.id = p.cancha_predio_id
       LEFT JOIN predios_liga pr ON pr.id = cp.predio_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND el.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST, p.hora ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
    );

    const jornadasResult = await query(
      `SELECT jornada, descripcion FROM fixture_jornadas
       WHERE torneo_id = $1 AND categoria_id = $2 AND subcategoria_id IS NOT DISTINCT FROM $3::uuid`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
    );

    res.json({ ok: true, partidos: rows, cancha_juego: torneoResult.rows[0].cancha_juego, jornadas: jornadasResult.rows });
  } catch (err) {
    console.error('Error en GET fixture publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/fixture-general —
// fixture consolidado de la pestaña "General" pública: TODOS los partidos
// de la división, de TODAS sus subcategorías juntas (sin filtrar por una
// sola), con el nombre de la subcategoría de cada partido para agruparlos
// visualmente por jornada.
router.get('/torneos/:torneoId/categorias/:categoriaId/fixture-general', async (req, res) => {
  try {
    const torneoResult = await query(
      `SELECT t.cancha_juego, t.sistema_puntaje FROM torneos t
       JOIN ligas l ON l.id = t.liga_id
       WHERE t.id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.torneoId]
    );
    if (!torneoResult.rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });

    const { rows } = await query(
      `SELECT p.id, p.fecha, p.hora, p.sede, p.jornada, p.estado,
              p.resultado_local, p.resultado_visitante, p.detalle_resultado,
              p.no_presento_local, p.no_presento_visitante,
              el.id AS equipo_local_torneo_id, ev.id AS equipo_visitante_torneo_id,
              cl.id AS club_local_id, cl.nombre AS club_local_nombre, cl.logo_url AS club_local_logo_url, cl.color_primario AS club_local_color,
              cv.id AS club_visitante_id, cv.nombre AS club_visitante_nombre, cv.logo_url AS club_visitante_logo_url, cv.color_primario AS club_visitante_color,
              COALESCE(ccSel.direccion, ccl.direccion, cl.direccion) AS club_local_direccion,
              COALESCE(ccSel.tipo_techo, ccl.tipo_techo) AS club_local_cancha_techo,
              COALESCE(ccSel.nombre, ccl.nombre) AS club_local_cancha_nombre,
              pr.nombre AS predio_nombre, pr.direccion AS predio_direccion,
              pr.ciudad AS predio_ciudad, pr.provincia AS predio_provincia,
              cp.nombre AS cancha_predio_nombre, cp.tipo_techo AS cancha_predio_techo,
              cs.id AS subcategoria_id, cs.nombre AS subcategoria_nombre, cs.orden AS subcategoria_orden
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       LEFT JOIN categoria_subcategorias cs ON cs.id = el.subcategoria_id
       LEFT JOIN clubes_canchas ccl ON ccl.club_id = cl.id AND ccl.es_principal = TRUE
       LEFT JOIN clubes_canchas ccSel ON ccSel.id = p.cancha_club_id
       LEFT JOIN canchas_predio cp ON cp.id = p.cancha_predio_id
       LEFT JOIN predios_liga pr ON pr.id = cp.predio_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2
         AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST, cs.orden ASC NULLS LAST, p.hora ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId]
    );

    const jornadasResult = await query(
      `SELECT jornada, MAX(descripcion) AS descripcion
       FROM fixture_jornadas WHERE torneo_id = $1 AND categoria_id = $2
       GROUP BY jornada`,
      [req.params.torneoId, req.params.categoriaId]
    );

    res.json({ ok: true, partidos: rows, cancha_juego: torneoResult.rows[0].cancha_juego, sistema_puntaje: torneoResult.rows[0].sistema_puntaje, jornadas: jornadasResult.rows });
  } catch (err) {
    console.error('Error en GET fixture-general publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId —
// detalle público de UN partido puntual (para el popup del fixture): datos
// grandes del partido + goleadores/tarjetas de ESE partido si se cargaron.
router.get('/torneos/:torneoId/categorias/:categoriaId/partidos/:partidoId', async (req, res) => {
  try {
    const partidoResult = await query(
      `SELECT p.id, p.fecha, p.hora, p.sede, p.jornada, p.estado,
              p.resultado_local, p.resultado_visitante, p.detalle_resultado, p.observaciones,
              p.no_presento_local, p.no_presento_visitante,
              el.id AS equipo_local_torneo_id, ev.id AS equipo_visitante_torneo_id,
              cl.nombre AS club_local_nombre, cl.logo_url AS club_local_logo_url, cl.color_primario AS club_local_color,
              cv.nombre AS club_visitante_nombre, cv.logo_url AS club_visitante_logo_url, cv.color_primario AS club_visitante_color,
              COALESCE(ccSel.direccion, ccl.direccion, cl.direccion) AS club_local_direccion,
              COALESCE(ccSel.tipo_techo, ccl.tipo_techo) AS club_local_cancha_techo,
              COALESCE(ccSel.nombre, ccl.nombre) AS club_local_cancha_nombre,
              pr.nombre AS predio_nombre, pr.direccion AS predio_direccion,
              pr.ciudad AS predio_ciudad, pr.provincia AS predio_provincia,
              cp.nombre AS cancha_predio_nombre, cp.tipo_techo AS cancha_predio_techo
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       LEFT JOIN clubes_canchas ccl ON ccl.club_id = cl.id AND ccl.es_principal = TRUE
       LEFT JOIN clubes_canchas ccSel ON ccSel.id = p.cancha_club_id
       LEFT JOIN canchas_predio cp ON cp.id = p.cancha_predio_id
       LEFT JOIN predios_liga pr ON pr.id = cp.predio_id
       WHERE p.id = $1 AND p.torneo_id = $2 AND p.categoria_id = $3
         AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.partidoId, req.params.torneoId, req.params.categoriaId]
    );
    const partido = partidoResult.rows[0];
    if (!partido) return res.status(404).json({ ok: false, error: 'Partido no encontrado' });

    const { rows: estadisticas } = await query(
      `SELECT j.nombre, j.apellido, c.nombre AS club_nombre, e.equipo_torneo_id,
              e.goles, e.tarjetas_amarillas, e.tarjetas_rojas
       FROM partido_estadisticas_jugador e
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       WHERE e.partido_id = $1 AND (e.goles > 0 OR e.tarjetas_amarillas > 0 OR e.tarjetas_rojas > 0)
       ORDER BY c.nombre ASC, j.apellido ASC`,
      [req.params.partidoId]
    );

    res.json({ ok: true, partido, estadisticas });
  } catch (err) {
    console.error('Error en GET detalle de partido publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoTorneoId — ficha
// pública de un equipo (club + torneo + división + liga), para armar el
// encabezado de la página pública del equipo.
router.get('/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoTorneoId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT et.id AS equipo_torneo_id, et.club_id,
              c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
              t.id AS torneo_id, t.nombre AS torneo_nombre,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre,
              l.nombre AS liga_nombre, l.slug AS liga_slug, l.logo_url AS liga_logo_url,
              l.color_primario, l.color_secundario,
              l.facebook_url, l.instagram_url, l.youtube_url
       FROM equipos_torneo et
       JOIN clubes c ON c.id = et.club_id
       JOIN torneos t ON t.id = et.torneo_id
       JOIN categorias cat ON cat.id = et.categoria_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE et.id = $1 AND et.torneo_id = $2 AND et.categoria_id = $3
         AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.equipoTorneoId, req.params.torneoId, req.params.categoriaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Equipo no encontrado' });
    res.json({ ok: true, equipo: rows[0] });
  } catch (err) {
    console.error('Error en GET equipo publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoTorneoId/fixture
// — fixture y resultados públicos de UN equipo puntual (próximos partidos y
// resultados anteriores), para su página pública de equipo.
router.get('/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoTorneoId/fixture', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.fecha, p.hora, p.sede, p.jornada, p.estado,
              p.resultado_local, p.resultado_visitante, p.detalle_resultado,
              p.no_presento_local, p.no_presento_visitante,
              p.equipo_local_id, p.equipo_visitante_id,
              cl.nombre AS club_local_nombre, cl.logo_url AS club_local_logo_url, cl.color_primario AS club_local_color,
              cv.nombre AS club_visitante_nombre, cv.logo_url AS club_visitante_logo_url, cv.color_primario AS club_visitante_color
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2
         AND (p.equipo_local_id = $3 OR p.equipo_visitante_id = $3)
         AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST, p.hora ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId, req.params.equipoTorneoId]
    );
    res.json({ ok: true, partidos: rows });
  } catch (err) {
    console.error('Error en GET fixture publico de equipo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/clubes/:clubId/jugadores — plantel público de un Club (sin datos
// sensibles como DNI): nombre, posición, número, edad y foto.
router.get('/clubes/:clubId/jugadores', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT j.id, j.nombre, j.apellido, j.posicion, j.numero_camiseta,
              j.fecha_nacimiento, j.anio_nacimiento, j.foto_url, c.logo_url AS club_logo_url
       FROM jugadores j
       JOIN clubes c ON c.id = j.club_id
       WHERE j.club_id = $1 AND j.activo = TRUE
       ORDER BY j.apellido ASC, j.nombre ASC`,
      [req.params.clubId]
    );
    res.json({ ok: true, jugadores: rows });
  } catch (err) {
    console.error('Error en GET plantel publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/goleadores — tabla pública de goleadores
router.get('/torneos/:torneoId/categorias/:categoriaId/goleadores', async (req, res) => {
  try {
    const subcategoriaId = req.query.subcategoria_id || null;
    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre, SUM(e.goles)::int AS goles
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND et.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND l.activo = TRUE AND l.tipo = 'productiva'
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.goles) > 0
       ORDER BY goles DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
    );
    res.json({ ok: true, goleadores: rows });
  } catch (err) {
    console.error('Error en GET goleadores publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/tarjetas — tabla pública de tarjetas
router.get('/torneos/:torneoId/categorias/:categoriaId/tarjetas', async (req, res) => {
  try {
    const subcategoriaId = req.query.subcategoria_id || null;
    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre,
              SUM(e.tarjetas_amarillas)::int AS tarjetas_amarillas, SUM(e.tarjetas_rojas)::int AS tarjetas_rojas
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND et.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND l.activo = TRUE AND l.tipo = 'productiva'
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.tarjetas_amarillas) > 0 OR SUM(e.tarjetas_rojas) > 0
       ORDER BY tarjetas_rojas DESC, tarjetas_amarillas DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId, subcategoriaId]
    );
    res.json({ ok: true, tarjetas: rows });
  } catch (err) {
    console.error('Error en GET tarjetas publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/clubes/buscar?q=... — buscador público de clubes
// dentro de una Liga (solo clubes con al menos un equipo inscripto en algún
// torneo de esa Liga), para el buscador de la página pública de la Liga.
router.get('/ligas/:slug/clubes/buscar', async (req, res) => {
  const texto = (req.query.q || '').trim();
  try {
    const { rows } = await query(
      `SELECT DISTINCT c.id, c.nombre, c.logo_url, c.color_primario
       FROM clubes c
       JOIN equipos_torneo et ON et.club_id = c.id
       JOIN torneos t ON t.id = et.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE l.slug = $1 AND l.activo = TRUE AND l.tipo = 'productiva'
         AND ($2 = '' OR c.nombre ILIKE '%' || $2 || '%')
       ORDER BY c.nombre ASC
       LIMIT 20`,
      [req.params.slug, texto]
    );
    res.json({ ok: true, clubes: rows });
  } catch (err) {
    console.error('Error en GET buscador de clubes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/clubes/:clubId — perfil público de un Club dentro de
// una Liga: datos básicos, todas sus participaciones (torneo/división o
// categoría) con su posición actual en la tabla, y el próximo partido de
// cada una. Pensado para la página pública de perfil de club.
router.get('/ligas/:slug/clubes/:clubId', async (req, res) => {
  try {
    const clubResult = await query(
      `SELECT c.id, c.nombre, c.logo_url, c.color_primario, c.direccion, c.ciudad, c.provincia
       FROM clubes c
       JOIN club_liga cl ON cl.club_id = c.id
       JOIN ligas l ON l.id = cl.liga_id
       WHERE c.id = $1 AND l.slug = $2 AND l.activo = TRUE AND l.tipo = 'productiva'`,
      [req.params.clubId, req.params.slug]
    );
    if (!clubResult.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en esta Liga' });

    // Una división (categoría/Zona) con categorías (subcategorías, ej. años)
    // adentro se muestra como UNA sola tarjeta con la TABLA GENERAL de esa
    // Zona (sumando todas sus categorías marcadas "suma a tabla general"),
    // no una tarjeta por cada año — mismo criterio que ya usa la pestaña
    // "General" de la página del Torneo. Una división SIN categorías
    // (formato simple, sin años adentro) sigue mostrando su propia tabla,
    // como antes.
    const { rows: participaciones } = await query(
      `WITH mis_equipos AS (
         SELECT et.id AS equipo_torneo_id, et.torneo_id, et.categoria_id, et.subcategoria_id
         FROM equipos_torneo et
         JOIN torneos t ON t.id = et.torneo_id
         JOIN ligas l ON l.id = t.liga_id
         WHERE et.club_id = $1 AND l.slug = $2 AND l.activo = TRUE AND l.tipo = 'productiva'
       ),

       -- ----- Divisiones SIN categorías (subcategoria_id NULL): una tarjeta
       -- por división, igual que antes. -----
       ranking_simple AS (
         SELECT et.id AS equipo_torneo_id,
                RANK() OVER (
                  PARTITION BY et.torneo_id, et.categoria_id
                  ORDER BY COALESCE(tp.puntos, 0) DESC, COALESCE(tp.diferencia, 0) DESC, COALESCE(tp.a_favor, 0) DESC
                ) AS puesto,
                COUNT(*) OVER (PARTITION BY et.torneo_id, et.categoria_id) AS total_equipos,
                COALESCE(tp.puntos, 0) AS puntos, COALESCE(tp.partidos_jugados, 0) AS partidos_jugados,
                COALESCE(tp.ganados, 0) AS ganados, COALESCE(tp.empatados, 0) AS empatados,
                COALESCE(tp.perdidos, 0) AS perdidos, COALESCE(tp.diferencia, 0) AS diferencia
         FROM equipos_torneo et
         JOIN mis_equipos me
           ON me.torneo_id = et.torneo_id AND me.categoria_id = et.categoria_id AND me.subcategoria_id IS NULL
         LEFT JOIN tabla_posiciones tp
           ON tp.equipo_torneo_id = et.id AND tp.torneo_id = et.torneo_id AND tp.categoria_id = et.categoria_id AND tp.ronda = 'general'
         WHERE et.subcategoria_id IS NULL
       ),
       filas_simples AS (
         SELECT me.equipo_torneo_id, me.torneo_id, me.categoria_id, NULL::uuid AS subcategoria_id, NULL::text AS subcategoria_nombre,
                r.puesto, r.total_equipos, r.puntos, r.partidos_jugados, r.ganados, r.empatados, r.perdidos, r.diferencia,
                ARRAY[me.equipo_torneo_id] AS equipo_ids_proximo
         FROM mis_equipos me
         JOIN ranking_simple r ON r.equipo_torneo_id = me.equipo_torneo_id
         WHERE me.subcategoria_id IS NULL
       ),

       -- ----- Divisiones CON categorías: una tarjeta por Zona con la TABLA
       -- GENERAL (suma de sus categorías marcadas "suma a tabla general").
       -- Se calcula para TODOS los clubes de esa Zona (no sólo el mío) para
       -- poder rankear mi puesto entre todos. -----
       mis_zonas_generales AS (
         SELECT DISTINCT torneo_id, categoria_id FROM mis_equipos WHERE subcategoria_id IS NOT NULL
       ),
       stats_generales AS (
         SELECT z.torneo_id, z.categoria_id, et.club_id,
                SUM(tp.partidos_jugados)::int AS partidos_jugados,
                SUM(tp.ganados)::int AS ganados,
                SUM(tp.empatados)::int AS empatados,
                SUM(tp.perdidos)::int AS perdidos,
                SUM(tp.a_favor)::int AS a_favor,
                SUM(tp.en_contra)::int AS en_contra,
                SUM(tp.diferencia)::int AS diferencia,
                SUM(tp.puntos)::int AS puntos,
                array_agg(et.id) AS equipo_ids
         FROM mis_zonas_generales z
         JOIN equipos_torneo et ON et.torneo_id = z.torneo_id AND et.categoria_id = z.categoria_id
         JOIN categoria_subcategorias cs ON cs.id = et.subcategoria_id AND cs.suma_tabla_general = TRUE
         JOIN tabla_posiciones tp
           ON tp.equipo_torneo_id = et.id AND tp.torneo_id = et.torneo_id AND tp.categoria_id = et.categoria_id AND tp.ronda = 'general'
         GROUP BY z.torneo_id, z.categoria_id, et.club_id
       ),
       ranking_general AS (
         SELECT *,
                RANK() OVER (PARTITION BY torneo_id, categoria_id ORDER BY puntos DESC, diferencia DESC, a_favor DESC) AS puesto,
                COUNT(*) OVER (PARTITION BY torneo_id, categoria_id) AS total_equipos
         FROM stats_generales
       ),
       filas_generales AS (
         SELECT NULL::uuid AS equipo_torneo_id, g.torneo_id, g.categoria_id, NULL::uuid AS subcategoria_id, 'General'::text AS subcategoria_nombre,
                g.puesto, g.total_equipos, g.puntos, g.partidos_jugados, g.ganados, g.empatados, g.perdidos, g.diferencia,
                g.equipo_ids AS equipo_ids_proximo
         FROM ranking_general g
         WHERE g.club_id = $1
       ),

       filas AS (
         SELECT * FROM filas_simples
         UNION ALL
         SELECT * FROM filas_generales
       )

       SELECT f.equipo_torneo_id, f.torneo_id, t.nombre AS torneo_nombre, t.logo_url AS torneo_logo_url, t.estado AS torneo_estado,
              f.categoria_id, c.nombre AS categoria_nombre, f.subcategoria_id, f.subcategoria_nombre,
              f.puesto, f.total_equipos, f.puntos, f.partidos_jugados, f.ganados, f.empatados, f.perdidos, f.diferencia,
              prox.fecha AS proximo_fecha, prox.hora AS proximo_hora, prox.rival_nombre, prox.rival_logo_url, prox.lv AS proximo_lv
       FROM filas f
       JOIN torneos t ON t.id = f.torneo_id
       JOIN categorias c ON c.id = f.categoria_id
       LEFT JOIN LATERAL (
         SELECT pa.fecha, pa.hora,
                CASE WHEN pa.equipo_local_id = ANY(f.equipo_ids_proximo) THEN 'V' ELSE 'L' END AS lv,
                CASE WHEN pa.equipo_local_id = ANY(f.equipo_ids_proximo) THEN cv.nombre ELSE cl.nombre END AS rival_nombre,
                CASE WHEN pa.equipo_local_id = ANY(f.equipo_ids_proximo) THEN cv.logo_url ELSE cl.logo_url END AS rival_logo_url
         FROM partidos pa
         JOIN equipos_torneo el ON el.id = pa.equipo_local_id
         JOIN equipos_torneo ev ON ev.id = pa.equipo_visitante_id
         JOIN clubes cl ON cl.id = el.club_id
         JOIN clubes cv ON cv.id = ev.club_id
         WHERE (pa.equipo_local_id = ANY(f.equipo_ids_proximo) OR pa.equipo_visitante_id = ANY(f.equipo_ids_proximo))
           AND (pa.resultado_local IS NULL OR pa.resultado_visitante IS NULL)
         ORDER BY pa.fecha ASC NULLS LAST, pa.jornada ASC NULLS LAST
         LIMIT 1
       ) prox ON true
       ORDER BY t.nombre ASC, c.nombre ASC, f.subcategoria_nombre ASC NULLS FIRST`,
      [req.params.clubId, req.params.slug]
    );

    res.json({ ok: true, club: clubResult.rows[0], participaciones });
  } catch (err) {
    console.error('Error en GET perfil publico de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/postulacion — datos básicos de la Liga para pintar el
// formulario público de "postulate como Club" (QR o link).
router.get('/ligas/:slug/postulacion', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, slug, logo_url, color_primario, color_secundario
       FROM ligas WHERE slug = $1 AND activo = TRUE AND tipo = 'productiva'`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });
    res.json({ ok: true, liga: rows[0] });
  } catch (err) {
    console.error('Error en GET postulacion (info liga):', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /web/ligas/:slug/postulaciones — un Club se postula para participar de
// la Liga. Queda "pendiente" hasta que la Liga lo acepte o rechace desde su
// Panel (pestaña Postulaciones).
router.post('/ligas/:slug/postulaciones', async (req, res) => {
  const {
    nombre, cuit, direccion, ciudad, provincia, telefono,
    email_contacto, logo_url, color_primario, color_secundario,
    cancha_tipo_techo, cancha_tamanio, cancha_piso
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del club es obligatorio' });
  }

  try {
    const ligaResult = await query(
      `SELECT id FROM ligas WHERE slug = $1 AND activo = TRUE AND tipo = 'productiva'`,
      [req.params.slug]
    );
    if (!ligaResult.rows[0]) return res.status(404).json({ ok: false, error: 'Liga no encontrada' });

    const { rows } = await query(
      `INSERT INTO postulaciones_club
         (liga_id, nombre, cuit, direccion, ciudad, provincia, telefono, email_contacto, logo_url, color_primario, color_secundario,
          cancha_tipo_techo, cancha_tamanio, cancha_piso)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [ligaResult.rows[0].id, nombre.trim(), cuit || null, direccion || null, ciudad || null,
       provincia || null, telefono || null, email_contacto || null, logo_url || null,
       color_primario || null, color_secundario || null,
       (cancha_tipo_techo === 'techada' ? 'techada' : 'aire_libre'), cancha_tamanio || null, cancha_piso || null]
    );
    res.status(201).json({ ok: true, postulacion: rows[0] });
  } catch (err) {
    console.error('Error en POST postulaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== AUTORREGISTRO DE SOCIOS (público, QR/link que comparte el Club) =====

// GET /web/clubes/:clubId/socio-registro — datos del Club (para pintar el
// formulario: nombre, logo, colores) más las Actividades y Categorías de
// socio ACTIVAS que configuró, para armar los desplegables.
router.get('/clubes/:clubId/socio-registro', async (req, res) => {
  try {
    const clubResult = await query(
      `SELECT id, nombre, logo_url, color_primario, color_secundario
       FROM clubes WHERE id = $1 AND activo = TRUE`,
      [req.params.clubId]
    );
    if (!clubResult.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado' });

    const actividadesResult = await query(
      'SELECT id, nombre FROM club_actividades WHERE club_id = $1 AND activo = TRUE ORDER BY nombre ASC',
      [req.params.clubId]
    );
    const categoriasResult = await query(
      'SELECT id, nombre FROM club_categorias_socio WHERE club_id = $1 AND activo = TRUE ORDER BY nombre ASC',
      [req.params.clubId]
    );

    res.json({ ok: true, club: clubResult.rows[0], actividades: actividadesResult.rows, categorias: categoriasResult.rows });
  } catch (err) {
    console.error('Error en GET socio-registro (info club):', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /web/clubes/:clubId/socios — un socio se autorregistra desde el
// formulario público. Queda "pendiente" en solicitudes_socio hasta que el
// club_admin lo apruebe (recién ahí se crea el jugador) o lo rechace.
router.post('/clubes/:clubId/socios', async (req, res) => {
  const { nombre, apellido, dni, fecha_nacimiento, telefono, email, foto_url, actividad_id, categoria_socio_id } = req.body;

  if (!nombre || !nombre.trim() || !apellido || !apellido.trim() || !dni || !dni.trim()) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (nombre, apellido, DNI)' });
  }

  try {
    const clubResult = await query('SELECT id FROM clubes WHERE id = $1 AND activo = TRUE', [req.params.clubId]);
    if (!clubResult.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado' });

    // Si se eligió Actividad/Categoría, tienen que ser de ESTE club (y estar
    // activas) — evita que alguien arme un request a mano con un id de otro
    // club.
    if (actividad_id) {
      const ok = await query('SELECT 1 FROM club_actividades WHERE id = $1 AND club_id = $2 AND activo = TRUE', [actividad_id, req.params.clubId]);
      if (!ok.rows[0]) return res.status(400).json({ ok: false, error: 'La actividad elegida no es válida' });
    }
    if (categoria_socio_id) {
      const ok = await query('SELECT 1 FROM club_categorias_socio WHERE id = $1 AND club_id = $2 AND activo = TRUE', [categoria_socio_id, req.params.clubId]);
      if (!ok.rows[0]) return res.status(400).json({ ok: false, error: 'La categoría elegida no es válida' });
    }

    const { rows } = await query(
      `INSERT INTO solicitudes_socio
         (club_id, nombre, apellido, dni, fecha_nacimiento, telefono, email, foto_url, actividad_id, categoria_socio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, nombre, apellido, creado_at`,
      [req.params.clubId, nombre.trim(), apellido.trim(), dni.trim(), fecha_nacimiento || null,
       telefono || null, email || null, foto_url || null, actividad_id || null, categoria_socio_id || null]
    );
    res.status(201).json({ ok: true, solicitud: rows[0] });
  } catch (err) {
    console.error('Error en POST socios (autorregistro):', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/noticias — noticias públicas (publicadas) de una Liga
// que son para "todos": las segmentadas (por club/ciudad/provincia/torneo)
// no se muestran en la home general, sólo en la página pública de ese club
// o torneo en particular.
router.get('/ligas/:slug/noticias', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.id, n.titulo, n.contenido, n.imagen_url, n.destacada, n.publicado_at
       FROM noticias n
       JOIN ligas l ON l.id = n.liga_id
       WHERE l.slug = $1 AND l.activo = TRUE AND l.tipo = 'productiva' AND n.estado = 'publicada'
         AND n.segmento_tipo = 'todos'
       ORDER BY n.destacada DESC, n.publicado_at DESC`,
      [req.params.slug]
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET noticias publicas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/ligas/:slug/clubes/:clubId/noticias — noticias segmentadas que le
// corresponden a un Club puntual: las que la Liga apuntó directamente a ese
// club, a su ciudad, a su provincia, o a un torneo/división en el que el
// club participa. Las noticias "todos" ya se ven en la home de la Liga, así
// que acá no se repiten.
router.get('/ligas/:slug/clubes/:clubId/noticias', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.id, n.titulo, n.contenido, n.imagen_url, n.destacada, n.publicado_at
       FROM noticias n
       JOIN ligas l ON l.id = n.liga_id
       LEFT JOIN clubes c ON c.id = $2
       WHERE l.slug = $1 AND l.activo = TRUE AND l.tipo = 'productiva' AND n.estado = 'publicada'
         AND (
           (n.segmento_tipo = 'club' AND n.segmento_club_id = $2)
           OR (n.segmento_tipo = 'ciudad' AND c.ciudad IS NOT NULL AND c.ciudad = ANY(n.segmento_ciudades))
           OR (n.segmento_tipo = 'provincia' AND c.provincia IS NOT NULL AND c.provincia = ANY(n.segmento_provincias))
           OR (n.segmento_tipo = 'torneo' AND EXISTS (
                 SELECT 1 FROM equipos_torneo et
                 WHERE et.club_id = $2 AND et.torneo_id = n.segmento_torneo_id
                   AND (n.segmento_categoria_id IS NULL OR et.categoria_id = n.segmento_categoria_id)
               ))
         )
       ORDER BY n.destacada DESC, n.publicado_at DESC`,
      [req.params.slug, req.params.clubId]
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET noticias publicas de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/noticias — noticias segmentadas por ese torneo
// (opcionalmente acotadas a una división puntual vía ?categoria_id=).
router.get('/torneos/:torneoId/noticias', async (req, res) => {
  try {
    const categoriaId = req.query.categoria_id || null;
    const { rows } = await query(
      `SELECT n.id, n.titulo, n.contenido, n.imagen_url, n.destacada, n.publicado_at
       FROM noticias n
       JOIN ligas l ON l.id = n.liga_id
       WHERE l.activo = TRUE AND l.tipo = 'productiva' AND n.estado = 'publicada'
         AND n.segmento_tipo = 'torneo' AND n.segmento_torneo_id = $1
         AND (n.segmento_categoria_id IS NULL OR $2::uuid IS NULL OR n.segmento_categoria_id = $2)
       ORDER BY n.destacada DESC, n.publicado_at DESC`,
      [req.params.torneoId, categoriaId]
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET noticias publicas de torneo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
