-- ============================================================================
-- 0031: Noticias Globales (Super Admin)
-- Noticias de la plataforma en sí (no de una Liga puntual) que se muestran
-- en la home pública (/sitio/index.html), junto al listado de Ligas.
-- Estructura idéntica a `noticias` pero sin liga_id ni segmentación, porque
-- acá no hay una Liga "dueña" de la noticia.
-- ============================================================================

CREATE TABLE noticias_globales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo        VARCHAR(200) NOT NULL,
  contenido     TEXT NOT NULL,
  imagen_url    TEXT,
  destacada     BOOLEAN NOT NULL DEFAULT FALSE,
  estado        VARCHAR(20) NOT NULL DEFAULT 'publicada' CHECK (estado IN ('borrador', 'publicada', 'archivada')),
  autor_id      UUID REFERENCES usuarios(id),
  publicado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_noticias_globales_estado ON noticias_globales (estado, publicado_at DESC);
