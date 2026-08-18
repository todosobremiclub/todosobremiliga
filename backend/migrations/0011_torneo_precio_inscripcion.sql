-- ============================================================================
-- 0011: Precio de inscripción del Torneo — costo fijo que paga un club por
-- anotarse a jugar ese torneo (distinto del precio "por partido" de las
-- categorías de torneo/modalidades, que ya existía desde la 0009).
-- ============================================================================

ALTER TABLE torneos ADD COLUMN precio_inscripcion NUMERIC(12,2);
