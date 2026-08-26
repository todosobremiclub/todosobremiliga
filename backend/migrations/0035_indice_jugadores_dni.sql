-- ============================================================================
-- 0035: índice sobre jugadores.dni (sin liga_id/club_id) para acelerar la
-- detección de "mismo DNI fichado en otro lado" en el listado de Fichajes
-- (src/routes/ligaFichajesRoutes.js), que ahora se calcula sólo para los
-- DNIs de la página visible en vez de para toda la Liga.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_jugadores_dni ON jugadores (dni);
