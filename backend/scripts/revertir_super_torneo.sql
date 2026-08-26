-- ============================================================================
-- REVERTIR "Super Torneo" — deshace todo lo cargado por
-- scripts/crear_super_torneo.sql (Torneo "Super Torneo" con 26 Zonas, 182
-- categorías, 1400 equipos, ~9400 partidos con resultados, 14.000
-- jugadores/fichajes y sus goleadores/tarjetas).
--
-- Es seguro correrlo aunque no hayas ejecutado el script: si no encuentra
-- nada, no borra nada.
--
-- CÓMO USARLO EN DBEAVER: ejecutar TODO el archivo de una sola vez con
-- "Execute SQL Script" (Alt+X) — no línea por línea. Incluye BEGIN/COMMIT.
-- ============================================================================

BEGIN;

-- Los jugadores creados para los fichajes de Super Torneo no se borran
-- solos al eliminar el Torneo (jugadores.club_id no depende de torneo_id),
-- así que los borramos a mano primero. Esto arrastra en cascada sus
-- fichajes y sus filas de goleadores/tarjetas (partido_estadisticas_jugador
-- referencia jugadores con ON DELETE CASCADE).
DELETE FROM jugadores
WHERE id IN (
  SELECT jugador_id FROM fichajes
  WHERE torneo_id = (SELECT id FROM torneos WHERE nombre = 'Super Torneo')
);

-- El Torneo "Super Torneo" (arrastra en cascada sus categorías/Zonas,
-- subcategorías/años, equipos_torneo, partidos, tabla_posiciones y
-- partido_estadisticas_jugador que hayan quedado).
DELETE FROM torneos WHERE nombre = 'Super Torneo';

-- Chequeo final (debería devolver 0 filas)
SELECT
  (SELECT COUNT(*) FROM torneos WHERE nombre = 'Super Torneo') AS torneo_restos,
  (SELECT COUNT(*) FROM categorias WHERE nombre LIKE 'Zona %') AS zonas_restos;

COMMIT;
-- Si preferís deshacer todo en vez de confirmar, ejecutá ROLLBACK; en lugar de la línea COMMIT; de arriba.
