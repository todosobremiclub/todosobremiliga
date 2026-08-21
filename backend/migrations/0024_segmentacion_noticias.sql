-- Segmentación de Noticias: por defecto una noticia es para "todos" (se
-- muestra en la home pública de la Liga). Opcionalmente se puede acotar a
-- un club puntual, a una o varias ciudades/provincias, o a un torneo (y
-- opcionalmente una categoría de ese torneo) — en esos casos se muestra en
-- la página pública del club o del torneo correspondiente, en vez de la
-- home general de la Liga.
ALTER TABLE noticias ADD COLUMN segmento_tipo TEXT NOT NULL DEFAULT 'todos'
  CHECK (segmento_tipo IN ('todos', 'club', 'ciudad', 'provincia', 'torneo'));
ALTER TABLE noticias ADD COLUMN segmento_club_id UUID REFERENCES clubes(id);
ALTER TABLE noticias ADD COLUMN segmento_ciudades TEXT[];
ALTER TABLE noticias ADD COLUMN segmento_provincias TEXT[];
ALTER TABLE noticias ADD COLUMN segmento_torneo_id UUID REFERENCES torneos(id);
ALTER TABLE noticias ADD COLUMN segmento_categoria_id UUID REFERENCES categorias(id);
