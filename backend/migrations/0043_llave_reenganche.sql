-- ============================================================================
-- Nuevo formato de torneo: "Eliminación directa con reenganche".
--
-- A diferencia del formato "Eliminación directa" ya existente, este formato:
--
--   1. No exige que la cantidad de equipos dé una potencia de 2 (2/4/8/16/
--      32/64) en ninguna ronda: admite cualquier cantidad. Si en una ronda
--      queda un equipo sin rival (cantidad impar), ese equipo pasa "libre" a
--      la ronda siguiente sin jugar (sorteado al azar entre los que quedan
--      desparejos).
--   2. Solo en la Fase 1 (la primera ronda), la Liga puede "reenganchar" a
--      mano a un equipo que perdió su partido, para que de todos modos
--      avance a la Fase 2 como si hubiera ganado. De la Fase 2 en adelante
--      no existe el reenganche: el pase libre por cantidad impar es siempre
--      al azar.
--   3. Al armar la Fase 2, se evita cruzar de nuevo a dos equipos que ya se
--      enfrentaron en la Fase 1 (esto incluye a un reenganchado contra el
--      mismo equipo que lo eliminó). De la Fase 2 en adelante no hace falta
--      seguir evitando repeticiones.
--
-- Los partidos de este formato se guardan en `partidos` igual que la llave
-- de "Eliminación directa"/"Grupos + Playoffs" (usando `fase` y
-- `orden_llave`, ver migración 0029), pero con fase = 'reenganche' fija en
-- TODAS sus rondas -- acá el número de ronda vive en `jornada` (1, 2, 3...),
-- no en el nombre de la fase, porque con cantidades arbitrarias de equipos
-- no siempre hay un nombre clásico (cuartos/octavos) que le quede justo.
--
-- El pase libre (por sorteo) y el reenganche (por decisión de la Liga)
-- avanzan a un equipo SIN que exista un partido real -- no se pueden
-- representar con una fila de `partidos` porque equipo_visitante_id es NOT
-- NULL. Se registran en esta tabla nueva: `llave_avances.jornada` es la
-- ronda a la que ese equipo avanza directo (sin jugarla). Al armar una
-- ronda, sus participantes son los ganadores de los partidos de la ronda
-- anterior MÁS los equipos que figuren acá con jornada = esa ronda.
-- ============================================================================

ALTER TABLE torneos DROP CONSTRAINT IF EXISTS torneos_formato_juego_check;
ALTER TABLE torneos ADD CONSTRAINT torneos_formato_juego_check
  CHECK (formato_juego IN ('todos_contra_todos', 'grupos_playoffs', 'liguilla_ida_vuelta', 'eliminacion_directa', 'apertura_clausura', 'eliminacion_reenganche'));

ALTER TABLE partidos DROP CONSTRAINT IF EXISTS partidos_fase_check;
ALTER TABLE partidos ADD CONSTRAINT partidos_fase_check
  CHECK (fase IN ('grupos', 'treintaidosavos', 'dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final', 'reenganche'));

CREATE TABLE llave_avances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id         UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  categoria_id      UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  subcategoria_id   UUID REFERENCES categoria_subcategorias(id) ON DELETE CASCADE,
  equipo_torneo_id  UUID NOT NULL REFERENCES equipos_torneo(id) ON DELETE CASCADE,
  jornada           INTEGER NOT NULL,      -- ronda de la llave a la que avanza sin jugar
  motivo            VARCHAR(20) NOT NULL CHECK (motivo IN ('libre', 'reenganche')),
  partido_origen_id UUID REFERENCES partidos(id) ON DELETE SET NULL, -- si es 'reenganche', el partido de Fase 1 que perdió
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_llave_avances_ronda ON llave_avances (torneo_id, categoria_id, jornada);
