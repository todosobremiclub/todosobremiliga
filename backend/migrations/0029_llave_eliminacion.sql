-- ============================================================================
-- Soporte para el formato "Grupos + Playoffs": fase de grupos + llave de
-- eliminación directa armada automáticamente según cuántos equipos
-- clasifiquen (dieciseisavos/octavos/cuartos/semifinal/final).
--
-- `fase` identifica a qué instancia pertenece cada partido:
--   'grupos'          -> partidos de la fase de grupos (todos contra todos
--                        DENTRO de cada grupo, usa equipos_torneo.grupo)
--   'treintaidosavos', 'dieciseisavos', 'octavos', 'cuartos', 'semifinal',
--   'final'           -> instancias de la llave de eliminación directa,
--                        elegida automáticamente según la cantidad de
--                        equipos clasificados.
-- Queda NULL para partidos de los demás formatos (todos contra todos,
-- liguilla ida y vuelta, apertura y clausura, eliminación directa simple),
-- que no usan este concepto.
--
-- `orden_llave` guarda la posición del partido DENTRO de su ronda de la
-- llave (0, 1, 2, ...), en el mismo orden en que se sorteó el cruce. Se usa
-- para saber qué dos partidos de una ronda arman el próximo cruce (el
-- ganador del partido en posición 0 juega contra el ganador del de posición
-- 1, y así siguiendo) — no se puede usar el orden del id porque es un UUID
-- sin relación con el orden de carga.
-- ============================================================================

ALTER TABLE partidos ADD COLUMN fase VARCHAR(20)
  CHECK (fase IN ('grupos', 'treintaidosavos', 'dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final'));

ALTER TABLE partidos ADD COLUMN orden_llave INTEGER;

CREATE INDEX idx_partidos_fase ON partidos (torneo_id, categoria_id, fase);
