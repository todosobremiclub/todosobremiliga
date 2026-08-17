-- ============================================================================
-- Documentos de un Club: cualquier archivo (base64), lo puede subir tanto la
-- Liga como el propio Club (campo subido_por_rol). No está atado a una Liga
-- en particular: es la documentación general del Club (igual que el Club es
-- una entidad global que puede jugar en más de una Liga).
-- ============================================================================
CREATE TABLE club_documentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre          VARCHAR(200) NOT NULL,
  archivo_url     TEXT NOT NULL,
  subido_por_rol  VARCHAR(20) NOT NULL CHECK (subido_por_rol IN ('liga', 'club')),
  subido_por_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_documentos_club ON club_documentos (club_id);

-- ============================================================================
-- Comentarios (notas internas) de la Liga sobre un Club. A diferencia de los
-- documentos, esto SÍ está atado a una Liga puntual: son notas privadas de
-- ESA Liga sobre ese Club, el Club nunca las ve.
-- ============================================================================
CREATE TABLE club_comentarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id         UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  liga_id         UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  autor_nombre    VARCHAR(150),
  comentario      TEXT NOT NULL,
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_comentarios_club_liga ON club_comentarios (club_id, liga_id);

-- ============================================================================
-- Subcategoría opcional dentro de una Categoría de un Torneo: un nivel extra
-- de clasificación, libre y opcional (ej: la categoría "Sub 15" podría tener
-- una subcategoría propia sin que esto tenga que ver con zonas de fixture).
-- ============================================================================
ALTER TABLE categorias ADD COLUMN subcategoria VARCHAR(100);
