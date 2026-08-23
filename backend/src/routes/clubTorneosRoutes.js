const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).
//
// Este archivo existe para la pestaña "Mis Torneos" del Panel de Club: le
// muestra al club en qué Liga/Torneo/División/Categoría está inscripto (vía
// equipos_torneo), cuántos jugadores tiene fichados (aprobados) en cada una,
// y los datos necesarios para armar los links a las páginas públicas de
// Tabla, Fixture, Goleadores y Tarjetas de cada torneo.

// GET /club/torneos — participaciones activas de mi club en todas sus Ligas
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT et.id AS equipo_torneo_id,
              l.id AS liga_id, l.nombre AS liga_nombre, l.slug AS liga_slug,
              t.id AS torneo_id, t.nombre AS torneo_nombre, t.deporte AS torneo_deporte,
              t.estado AS torneo_estado,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre,
              sub.id AS subcategoria_id, sub.nombre AS subcategoria_nombre,
              (
                SELECT COUNT(*)::int FROM fichajes f
                WHERE f.club_id = et.club_id
                  AND f.torneo_id = et.torneo_id
                  AND f.categoria_id = et.categoria_id
                  AND f.estado = 'aprobado'
                  AND (f.subcategoria_id IS NOT DISTINCT FROM et.subcategoria_id)
              ) AS jugadores_fichados,
              (
                SELECT json_agg(json_build_object(
                  'jugador_id', j.id, 'nombre', j.nombre, 'apellido', j.apellido, 'dni', j.dni
                ) ORDER BY j.apellido, j.nombre)
                FROM fichajes f
                JOIN jugadores j ON j.id = f.jugador_id
                WHERE f.club_id = et.club_id
                  AND f.torneo_id = et.torneo_id
                  AND f.categoria_id = et.categoria_id
                  AND f.estado = 'aprobado'
                  AND (f.subcategoria_id IS NOT DISTINCT FROM et.subcategoria_id)
              ) AS jugadores
       FROM equipos_torneo et
       JOIN torneos t ON t.id = et.torneo_id
       JOIN ligas l ON l.id = t.liga_id
       JOIN categorias cat ON cat.id = et.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = et.subcategoria_id
       WHERE et.club_id = $1 AND et.activo = TRUE
       ORDER BY l.nombre ASC, t.nombre ASC, cat.nombre ASC, sub.nombre ASC NULLS FIRST`,
      [req.clubId]
    );
    res.json({ ok: true, torneos: rows });
  } catch (err) {
    console.error('Error en GET /club/torneos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
