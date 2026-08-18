-- ============================================================================
-- 0012: Varias cosas juntas pedidas en la misma tanda:
--
-- 1) "Tipos de cancha" configurables por Liga (ej: Césped sintético, Cemento,
--    Parquet) para reemplazar el campo de texto libre "Piso de la cancha" al
--    cargar/editar un club.
-- 2) Predios y canchas PROPIOS de la Liga (opcional), para poder asignarlos
--    después a los partidos del fixture.
-- 3) El Torneo ahora indica si se juega en canchas propias de la Liga o en
--    las canchas de los clubes (cancha_juego).
-- 4) Formato de juego nuevo: 'apertura_clausura' (dos ruedas invirtiendo
--    localía, cada una con su propia tabla, más una tabla general).
-- 5) El precio de inscripción se mueve del Torneo a la Categoría (o
--    Subcategoría, si la categoría tiene) — se había agregado en la 0011 a
--    nivel Torneo, ahora se saca de ahí.
-- ============================================================================

-- ----- 1) Tipos de cancha -----
CREATE TABLE tipos_cancha (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liga_id, nombre)
);

ALTER TABLE clubes_canchas ADD COLUMN tipo_cancha_id UUID REFERENCES tipos_cancha(id) ON DELETE SET NULL;

-- ----- 2) Predios y canchas propias de la Liga -----
CREATE TABLE predios_liga (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(150) NOT NULL,
  direccion         VARCHAR(255),
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liga_id, nombre)
);

CREATE TABLE canchas_predio (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  predio_id         UUID NOT NULL REFERENCES predios_liga(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  tipo_techo        VARCHAR(20) NOT NULL DEFAULT 'aire_libre' CHECK (tipo_techo IN ('techada', 'aire_libre')),
  tamanio           VARCHAR(50),
  tipo_cancha_id    UUID REFERENCES tipos_cancha(id) ON DELETE SET NULL,
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_canchas_predio_predio ON canchas_predio(predio_id);

-- ----- 3) Torneo: dónde se juega -----
ALTER TABLE torneos ADD COLUMN cancha_juego VARCHAR(20) NOT NULL DEFAULT 'clubes'
  CHECK (cancha_juego IN ('propias_liga', 'clubes'));

-- ----- 4) Formato "Apertura y Clausura" -----
ALTER TABLE torneos DROP CONSTRAINT IF EXISTS torneos_formato_juego_check;
ALTER TABLE torneos ADD CONSTRAINT torneos_formato_juego_check
  CHECK (formato_juego IN ('todos_contra_todos', 'grupos_playoffs', 'liguilla_ida_vuelta', 'eliminacion_directa', 'apertura_clausura'));

ALTER TABLE partidos ADD COLUMN ronda VARCHAR(10) CHECK (ronda IN ('apertura', 'clausura'));
ALTER TABLE partidos ADD COLUMN cancha_predio_id UUID REFERENCES canchas_predio(id) ON DELETE SET NULL;

ALTER TABLE tabla_posiciones ADD COLUMN ronda VARCHAR(10) NOT NULL DEFAULT 'general'
  CHECK (ronda IN ('general', 'apertura', 'clausura'));
ALTER TABLE tabla_posiciones DROP CONSTRAINT IF EXISTS tabla_posiciones_torneo_id_categoria_id_equipo_torneo_id_key;
ALTER TABLE tabla_posiciones ADD CONSTRAINT tabla_posiciones_unica UNIQUE (torneo_id, categoria_id, equipo_torneo_id, ronda);

-- ----- 5) Precio de inscripción: de Torneo a Categoría/Subcategoría -----
ALTER TABLE torneos DROP COLUMN IF EXISTS precio_inscripcion;
ALTER TABLE categorias ADD COLUMN precio_inscripcion NUMERIC(12,2);
ALTER TABLE categoria_subcategorias ADD COLUMN precio_inscripcion NUMERIC(12,2);
