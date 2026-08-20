-- Agrega el estado 'historico' a los torneos: permite marcar un torneo viejo
-- como archivado (se sigue viendo todo su historial — fixture, tabla,
-- goleadores, etc. — pero deja de aparecer como torneo "activo" del día a
-- día). Por ahora es solo un tilde disponible desde el popup de Categorías
-- de cada torneo; el uso concreto (ej. filtrarlo de listados activos) se
-- termina de definir más adelante.
ALTER TABLE torneos DROP CONSTRAINT IF EXISTS torneos_estado_check;
ALTER TABLE torneos ADD CONSTRAINT torneos_estado_check
  CHECK (estado IN ('planificado', 'en_curso', 'finalizado', 'suspendido', 'historico'));
