-- ============================================================================
-- Check opcional en la cancha principal de un club: si es reglamentaria
-- (40x20). Se usa para poder filtrar clubes que cumplen esa medida estándar
-- sin depender del texto libre que ya tiene el campo "tamanio".
-- ============================================================================
ALTER TABLE clubes_canchas ADD COLUMN cancha_reglamentaria BOOLEAN NOT NULL DEFAULT FALSE;
