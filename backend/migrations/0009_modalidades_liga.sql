-- ============================================================================
-- 0009: "Categorías de torneo" configurables por Liga (ej: Futsal, Senior,
-- Leyendas), cada una con un precio fijo. Un club puede estar anotado en
-- varias. Esto es DISTINTO de las "categorias" que ya existían (esas son
-- por torneo, ej "Primera División" de "Apertura 2026"): las de acá son a
-- nivel Liga, sirven para clasificar/filtrar clubes y cobrar un precio fijo
-- por participar en esa modalidad, más allá de en qué torneos jueguen.
-- ============================================================================

CREATE TABLE modalidades_liga (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  precio            NUMERIC(12,2),
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liga_id, nombre)
);

CREATE TABLE club_modalidades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  modalidad_id      UUID NOT NULL REFERENCES modalidades_liga(id) ON DELETE CASCADE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, modalidad_id)
);

CREATE INDEX idx_club_modalidades_club ON club_modalidades(club_id);
CREATE INDEX idx_club_modalidades_modalidad ON club_modalidades(modalidad_id);
