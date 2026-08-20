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

// GET /web/ligas/:slug — detalle público de una Liga
router.get('/ligas/:slug', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, nombre, slug, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario
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

// GET /web/ligas/:slug/torneos — torneos públicos de una Liga
router.get('/ligas/:slug/torneos', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT t.id, t.nombre, t.deporte, t.temporada, t.formato_juego, t.estado, t.fecha_inicio, t.fecha_fin
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

// GET /web/torneos/:torneoId/categorias — categorías públicas de un torneo
router.get('/torneos/:torneoId/categorias', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.*
       FROM categorias c
       JOIN torneos t ON t.id = c.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE c.torneo_id = $1 AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY c.orden ASC, c.nombre ASC`,
      [req.params.torneoId]
    );
    res.json({ ok: true, categorias: rows });
  } catch (err) {
    console.error('Error en GET /web/torneos/:torneoId/categorias:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/tabla — tabla de posiciones pública
// LEFT JOIN desde equipos_torneo (no desde tabla_posiciones): así se ven todos
// los equipos inscriptos desde el primer momento, en 0, aunque todavía no se
// haya jugado ningún partido (mismo criterio que la tabla del Panel de Liga).
router.get('/torneos/:torneoId/categorias/:categoriaId/tabla', async (req, res) => {
  try {
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
       WHERE et.torneo_id = $1 AND et.categoria_id = $2 AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY COALESCE(tp.puntos, 0) DESC, COALESCE(tp.diferencia, 0) DESC, COALESCE(tp.a_favor, 0) DESC, c.nombre ASC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, tabla: rows });
  } catch (err) {
    console.error('Error en GET tabla publica:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/fixture — fixture y resultados públicos
router.get('/torneos/:torneoId/categorias/:categoriaId/fixture', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.fecha, p.hora, p.sede, p.jornada, p.estado,
              p.resultado_local, p.resultado_visitante, p.detalle_resultado,
              el.id AS equipo_local_torneo_id, ev.id AS equipo_visitante_torneo_id,
              cl.nombre AS club_local_nombre, cl.logo_url AS club_local_logo_url, cl.color_primario AS club_local_color,
              cv.nombre AS club_visitante_nombre, cv.logo_url AS club_visitante_logo_url, cv.color_primario AS club_visitante_color
       FROM partidos p
       JOIN equipos_torneo el ON el.id = p.equipo_local_id
       JOIN equipos_torneo ev ON ev.id = p.equipo_visitante_id
       JOIN clubes cl ON cl.id = el.club_id
       JOIN clubes cv ON cv.id = ev.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, partidos: rows });
  } catch (err) {
    console.error('Error en GET fixture publico:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /web/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoTorneoId — ficha
// pública de un equipo (club + torneo + categoría + liga), para armar el
// encabezado de la página pública del equipo.
router.get('/torneos/:torneoId/categorias/:categoriaId/equipos/:equipoTorneoId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT et.id AS equipo_torneo_id, et.club_id,
              c.nombre AS club_nombre, c.logo_url AS club_logo_url, c.color_primario AS club_color_primario,
              t.id AS torneo_id, t.nombre AS torneo_nombre,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre,
              l.nombre AS liga_nombre, l.slug AS liga_slug
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
       ORDER BY p.jornada ASC NULLS LAST, p.fecha ASC NULLS LAST`,
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
    const { rows } = await query(
      `SELECT j.id AS jugador_id, j.nombre, j.apellido, c.nombre AS club_nombre, SUM(e.goles)::int AS goles
       FROM partido_estadisticas_jugador e
       JOIN partidos p ON p.id = e.partido_id
       JOIN jugadores j ON j.id = e.jugador_id
       JOIN equipos_torneo et ON et.id = e.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND l.activo = TRUE AND l.tipo = 'productiva'
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.goles) > 0
       ORDER BY goles DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId]
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
       WHERE p.torneo_id = $1 AND p.categoria_id = $2 AND l.activo = TRUE AND l.tipo = 'productiva'
       GROUP BY j.id, j.nombre, j.apellido, c.nombre
       HAVING SUM(e.tarjetas_amarillas) > 0 OR SUM(e.tarjetas_rojas) > 0
       ORDER BY tarjetas_rojas DESC, tarjetas_amarillas DESC, j.apellido ASC`,
      [req.params.torneoId, req.params.categoriaId]
    );
    res.json({ ok: true, tarjetas: rows });
  } catch (err) {
    console.error('Error en GET tarjetas publico:', err);
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

// GET /web/ligas/:slug/noticias — noticias públicas (publicadas) de una Liga
router.get('/ligas/:slug/noticias', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT n.id, n.titulo, n.contenido, n.imagen_url, n.destacada, n.publicado_at
       FROM noticias n
       JOIN ligas l ON l.id = n.liga_id
       WHERE l.slug = $1 AND l.activo = TRUE AND l.tipo = 'productiva' AND n.estado = 'publicada'
       ORDER BY n.destacada DESC, n.publicado_at DESC`,
      [req.params.slug]
    );
    res.json({ ok: true, noticias: rows });
  } catch (err) {
    console.error('Error en GET noticias publicas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
