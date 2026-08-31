-- Sanción manual de un jugador, a cargo del administrador de la Liga.
--
-- Se guarda en el FICHAJE (no en el jugador) a propósito: el jugador es una
-- entidad del Club que puede estar fichado en varias Ligas/Torneos a la vez
-- (ver tabla jugadores), y una sanción la decide UNA Liga puntual sobre SU
-- competencia -- no tiene que afectarlo en otra Liga donde juegue con el
-- mismo club. Es un simple on/off manual (sin fecha ni conteo de partidos,
-- ver decisión del roadmap): el propio administrador lo desmarca cuando
-- corresponda.
ALTER TABLE fichajes
  ADD COLUMN sancionado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN sancionado_motivo TEXT;
