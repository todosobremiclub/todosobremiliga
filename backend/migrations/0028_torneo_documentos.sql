-- ============================================================================
-- Reglamento / documentos de un Torneo (PDF o Word), a cargo de la Liga.
-- Mismo mecanismo que club_documentos: el archivo se guarda directo en la
-- base como base64 (columna archivo_url TEXT), sin servidor de archivos
-- aparte. Se valida en el backend que el tipo sea PDF o Word.
-- ============================================================================
CREATE TABLE torneo_documentos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id       UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  nombre          VARCHAR(200) NOT NULL,
  archivo_url     TEXT NOT NULL,
  subido_por_id   UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_torneo_documentos_torneo ON torneo_documentos (torneo_id);
