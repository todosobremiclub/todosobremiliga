-- 1) Descripción de fecha/jornada (texto libre, ej: "Sábado 8 de Agosto" o
--    "Semana del 1 al 8"), una por torneo+categoria+jornada.
CREATE TABLE fixture_jornadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  categoria_id UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  jornada INTEGER NOT NULL,
  descripcion VARCHAR(200),
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (torneo_id, categoria_id, jornada)
);

-- 2) Árbitros de la Liga (configurables, para asignar después a los partidos).
CREATE TABLE arbitros_liga (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  telefono VARCHAR(50),
  tipo VARCHAR(20) NOT NULL DEFAULT 'arbitro' CHECK (tipo IN ('arbitro', 'juez_linea', 'ambos')),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3) Asignación de árbitro(s) a un partido puntual (puede haber más de uno:
--    árbitro principal + jueces de línea).
CREATE TABLE partido_arbitros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partido_id UUID NOT NULL REFERENCES partidos(id) ON DELETE CASCADE,
  arbitro_id UUID NOT NULL REFERENCES arbitros_liga(id) ON DELETE CASCADE,
  UNIQUE (partido_id, arbitro_id)
);
CREATE INDEX idx_partido_arbitros_partido ON partido_arbitros(partido_id);

-- 4) Si el club local tiene más de una cancha, permite elegir cuál de ellas
--    se usa en ese partido puntual (por defecto, si queda NULL, se usa la
--    cancha marcada como principal del club).
ALTER TABLE partidos ADD COLUMN cancha_club_id UUID REFERENCES clubes_canchas(id) ON DELETE SET NULL;
