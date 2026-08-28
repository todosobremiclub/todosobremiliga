-- ============================================================================
-- 0037: Exención de pago por partido — permite marcar, partido por partido,
-- que solo uno de los dos equipos debe el cargo "por partido" (ej: el
-- visitante no paga por acuerdo entre clubes). Por defecto (NULL) pagan
-- ambos, como hasta ahora.
-- ============================================================================

ALTER TABLE partidos
  ADD COLUMN exencion_pago TEXT CHECK (exencion_pago IN ('solo_local', 'solo_visitante'));

COMMENT ON COLUMN partidos.exencion_pago IS
  'NULL = pagan ambos equipos (default). ''solo_local'' = el visitante no genera cargo por partido. ''solo_visitante'' = el local no genera cargo por partido.';
