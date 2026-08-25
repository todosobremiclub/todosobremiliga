-- ============================================================================
-- 0030: Autorregistro de socios por QR + Configuración de Actividades y
-- Categorías por Club.
--
-- 1) "Actividades" y "Categorías de socio" configurables por Club (ej.
--    Actividades: Fútbol, Vóley, Handball — Categorías: Infantil, Cadete,
--    Mayor), para usarlas como desplegable tanto en el alta manual de un
--    jugador (Panel Club) como en el formulario público de autorregistro.
-- 2) `jugadores` gana teléfono/email de contacto y la Actividad/Categoría
--    elegida — quedan opcionales, no rompen los jugadores ya cargados.
-- 3) `solicitudes_socio`: lo que llena un socio desde el formulario público
--    (QR/link) queda acá, PENDIENTE de que el club_admin lo revise y
--    apruebe (recién ahí se crea el jugador real) o lo rechace.
-- ============================================================================

CREATE TABLE club_actividades (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, nombre)
);

CREATE TABLE club_categorias_socio (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id           UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, nombre)
);

ALTER TABLE jugadores ADD COLUMN telefono VARCHAR(50);
ALTER TABLE jugadores ADD COLUMN email VARCHAR(150);
ALTER TABLE jugadores ADD COLUMN actividad_id UUID REFERENCES club_actividades(id) ON DELETE SET NULL;
ALTER TABLE jugadores ADD COLUMN categoria_socio_id UUID REFERENCES club_categorias_socio(id) ON DELETE SET NULL;

CREATE TABLE solicitudes_socio (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id             UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  nombre              VARCHAR(100) NOT NULL,
  apellido            VARCHAR(100) NOT NULL,
  dni                 VARCHAR(20) NOT NULL,
  fecha_nacimiento    DATE,
  telefono            VARCHAR(50),
  email               VARCHAR(150),
  foto_url            TEXT,
  actividad_id        UUID REFERENCES club_actividades(id) ON DELETE SET NULL,
  categoria_socio_id  UUID REFERENCES club_categorias_socio(id) ON DELETE SET NULL,
  estado              VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo      TEXT,
  jugador_id          UUID REFERENCES jugadores(id) ON DELETE SET NULL,
  revisado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  revisado_at         TIMESTAMPTZ,
  creado_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_solicitudes_socio_club ON solicitudes_socio (club_id, estado);
