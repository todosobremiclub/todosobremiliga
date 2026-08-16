-- ============================================================================
-- Ciudad/Provincia para Clubes + Postulaciones públicas de Clubes.
-- ============================================================================

ALTER TABLE clubes ADD COLUMN ciudad VARCHAR(100);
ALTER TABLE clubes ADD COLUMN provincia VARCHAR(100);

-- Postulación pública: un club se anota vía un formulario público (QR o link)
-- para participar de una Liga. Queda "pendiente" hasta que la Liga la acepte
-- o rechace. Si se acepta, se crea el Club real (tabla `clubes`) + su
-- membresía (`club_liga`), y se guarda la referencia en `club_id_creado`.
CREATE TABLE postulaciones_club (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(150) NOT NULL,
  cuit              VARCHAR(20),
  direccion         VARCHAR(255),
  ciudad            VARCHAR(100),
  provincia         VARCHAR(100),
  telefono          VARCHAR(50),
  email_contacto    VARCHAR(150),
  logo_url          TEXT,
  color_primario    VARCHAR(20),
  color_secundario  VARCHAR(20),
  estado            VARCHAR(20) NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aceptada', 'rechazada')),
  motivo_rechazo    TEXT,
  club_id_creado    UUID REFERENCES clubes(id),
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resuelto_at       TIMESTAMPTZ
);

CREATE INDEX idx_postulaciones_club_liga ON postulaciones_club (liga_id, estado);
