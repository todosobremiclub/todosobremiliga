-- ============================================================================
-- Canchas de un Club. Un club siempre tiene al menos una cancha "principal"
-- (creada junto con el club), y puede tener canchas secundarias adicionales.
-- ============================================================================
CREATE TABLE clubes_canchas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre        VARCHAR(100),
  tipo_techo    VARCHAR(20) NOT NULL DEFAULT 'aire_libre' CHECK (tipo_techo IN ('techada', 'aire_libre')),
  tamanio       VARCHAR(50),
  piso          VARCHAR(50),
  es_principal  BOOLEAN NOT NULL DEFAULT FALSE,
  orden         INTEGER NOT NULL DEFAULT 0,
  creado_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clubes_canchas_club ON clubes_canchas (club_id);

-- La postulación pública pide los mismos datos de la cancha principal
-- (techada/aire libre, tamaño, piso) para que al aceptar la postulación se
-- pueda crear esa cancha principal del club automáticamente.
ALTER TABLE postulaciones_club ADD COLUMN cancha_tipo_techo VARCHAR(20);
ALTER TABLE postulaciones_club ADD COLUMN cancha_tamanio VARCHAR(50);
ALTER TABLE postulaciones_club ADD COLUMN cancha_piso VARCHAR(50);
