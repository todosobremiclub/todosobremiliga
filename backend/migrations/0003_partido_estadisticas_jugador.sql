-- ============================================================================
-- Estadísticas por jugador por partido (goleadores + tarjetas).
-- Enfoque "carga simple por jugador": al cargar el resultado de un partido,
-- se cargan también los goles y tarjetas de cada jugador en ESE partido.
-- Los totales de goleadores/tarjetas por torneo/categoría se calculan sumando
-- estas filas (no se guarda un acumulado aparte, se sacan por SUM() al vuelo).
-- ============================================================================
CREATE TABLE partido_estadisticas_jugador (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id            UUID NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  jugador_id            UUID NOT NULL REFERENCES jugadores(id) ON DELETE CASCADE,
  equipo_torneo_id      UUID NOT NULL REFERENCES equipos_torneo(id) ON DELETE CASCADE,
  goles                 INTEGER NOT NULL DEFAULT 0,
  tarjetas_amarillas    INTEGER NOT NULL DEFAULT 0,
  tarjetas_rojas        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (partido_id, jugador_id)
);

CREATE INDEX idx_partido_estadisticas_partido ON partido_estadisticas_jugador (partido_id);
CREATE INDEX idx_partido_estadisticas_jugador ON partido_estadisticas_jugador (jugador_id);
