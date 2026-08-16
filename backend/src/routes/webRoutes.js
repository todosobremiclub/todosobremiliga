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
router.get('/torneos/:torneoId/categorias/:categoriaId/tabla', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT tp.partidos_jugados, tp.ganados, tp.empatados, tp.perdidos,
              tp.a_favor, tp.en_contra, tp.diferencia, tp.puntos,
              c.nombre AS club_nombre, c.logo_url AS club_logo_url
       FROM tabla_posiciones tp
       JOIN equipos_torneo et ON et.id = tp.equipo_torneo_id
       JOIN clubes c ON c.id = et.club_id
       JOIN torneos t ON t.id = tp.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       WHERE tp.torneo_id = $1 AND tp.categoria_id = $2 AND l.activo = TRUE AND l.tipo = 'productiva'
       ORDER BY tp.puntos DESC, tp.diferencia DESC, tp.a_favor DESC`,
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
              cl.nombre AS club_local_nombre, cl.logo_url AS club_local_logo_url,
              cv.nombre AS club_visitante_nombre, cv.logo_url AS club_visitante_logo_url
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
