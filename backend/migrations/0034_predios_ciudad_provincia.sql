-- ============================================================================
-- Ciudad y Provincia de un Predio propio de la Liga, para completar la
-- Dirección que ya tenía (migración 0012) y poder mostrar la ubicación
-- completa de la cancha en el Fixture cuando el Torneo juega en predios
-- propios de la Liga (torneos.cancha_juego = 'propias_liga').
-- ============================================================================
ALTER TABLE predios_liga ADD COLUMN ciudad VARCHAR(100);
ALTER TABLE predios_liga ADD COLUMN provincia VARCHAR(100);
