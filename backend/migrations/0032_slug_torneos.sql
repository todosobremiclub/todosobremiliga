-- ============================================================================
-- Slug de Torneo, para armar URLs "lindas" en el sitio público
-- (www.todosobremiliga.com.ar/<slug-liga>/<slug-torneo>) en vez de
-- /sitio/torneo.html?id=... — mismo criterio que ya tiene `ligas.slug`, pero
-- único por Liga (dos Ligas distintas SÍ pueden tener un torneo con el mismo
-- slug, ej. "torneo-apertura" en cada una).
-- ============================================================================
ALTER TABLE torneos ADD COLUMN slug VARCHAR(160);

-- Backfill: genera un slug a partir del nombre para los torneos que ya
-- existen (los nuevos lo generan solos desde la app, igual que `ligas.slug`).
-- Si dos torneos de la misma Liga generan el mismo slug base (nombres
-- iguales o muy parecidos), se les agrega un sufijo numérico para que quede
-- único.
WITH base AS (
  SELECT id, liga_id, creado_at,
    trim(both '-' from regexp_replace(
      translate(lower(nombre),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'),
      '[^a-z0-9]+', '-', 'g'
    )) AS slug_base
  FROM torneos
),
numerado AS (
  SELECT id, liga_id,
    CASE WHEN slug_base = '' THEN 'torneo' ELSE slug_base END AS slug_base,
    ROW_NUMBER() OVER (PARTITION BY liga_id, CASE WHEN slug_base = '' THEN 'torneo' ELSE slug_base END ORDER BY creado_at ASC, id ASC) AS n
  FROM base
)
UPDATE torneos t
SET slug = CASE WHEN numerado.n = 1 THEN numerado.slug_base ELSE numerado.slug_base || '-' || numerado.n END
FROM numerado
WHERE t.id = numerado.id;

ALTER TABLE torneos ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX idx_torneos_liga_slug ON torneos (liga_id, slug);
