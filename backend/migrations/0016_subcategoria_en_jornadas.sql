-- Permite que la descripción de una jornada/fecha del fixture sea
-- independiente por subcategoría dentro de una misma categoría (ej: la
-- categoría "Baby Fútbol A" con subcategorías 2018/2019/2020 puede tener
-- fixtures y jornadas totalmente distintos entre subcategorías). Antes la
-- jornada era única por categoría entera, lo que chocaba si dos
-- subcategorías tenían su propia "jornada 1" con descripciones distintas.
ALTER TABLE fixture_jornadas ADD COLUMN subcategoria_id UUID REFERENCES categoria_subcategorias(id) ON DELETE CASCADE;
ALTER TABLE fixture_jornadas DROP CONSTRAINT IF EXISTS fixture_jornadas_torneo_id_categoria_id_jornada_key;
