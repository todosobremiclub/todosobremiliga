-- ============================================================================
-- 0025: Cobros — deudas y pagos de los clubes hacia la Liga, por torneo.
--
-- Cada torneo puede configurar hasta 3 conceptos de cobro (inscripción,
-- mensual, por partido), cada uno con su propio monto y pudiendo activarse o
-- desactivarse independientemente. Al activarse un concepto (o al ocurrir el
-- hecho que lo genera: inscripción de un club, generación de un partido, o
-- el disparo manual del cargo mensual de un período) se generan las "deudas"
-- correspondientes -- una fila por club por concepto (y por partido/período
-- si corresponde), snapshoteando el monto vigente en ese momento.
--
-- Los pagos se registran contra una deuda puntual y se acumulan: el saldo de
-- una deuda es su monto menos la suma de los pagos ya registrados contra
-- ella, permitiendo pagos parciales.
-- ============================================================================

CREATE TABLE torneo_conceptos_pago (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id         UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL CHECK (tipo IN ('inscripcion', 'mensual', 'por_partido')),
  monto             NUMERIC(12,2) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (torneo_id, tipo)
);

CREATE TABLE club_deudas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  torneo_id         UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  concepto_id       UUID NOT NULL REFERENCES torneo_conceptos_pago(id) ON DELETE CASCADE,
  club_id           UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL CHECK (tipo IN ('inscripcion', 'mensual', 'por_partido')),
  partido_id        UUID REFERENCES partidos(id) ON DELETE CASCADE,
  periodo           TEXT, -- solo para 'mensual', formato 'YYYY-MM'
  descripcion       TEXT,
  monto             NUMERIC(12,2) NOT NULL,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_deudas_torneo_club ON club_deudas (torneo_id, club_id);
CREATE INDEX idx_club_deudas_partido ON club_deudas (partido_id);

-- Evita generar dos veces la misma deuda de inscripción para un club en un torneo.
CREATE UNIQUE INDEX uq_deuda_inscripcion ON club_deudas (torneo_id, club_id, concepto_id) WHERE tipo = 'inscripcion';
-- Evita duplicar el cargo mensual de un mismo club en el mismo período.
CREATE UNIQUE INDEX uq_deuda_mensual ON club_deudas (torneo_id, club_id, concepto_id, periodo) WHERE tipo = 'mensual';
-- Evita duplicar el cargo por partido de un mismo club en el mismo partido.
CREATE UNIQUE INDEX uq_deuda_por_partido ON club_deudas (torneo_id, club_id, concepto_id, partido_id) WHERE tipo = 'por_partido';

CREATE TABLE club_pagos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deuda_id          UUID NOT NULL REFERENCES club_deudas(id) ON DELETE CASCADE,
  monto             NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha             DATE NOT NULL DEFAULT CURRENT_DATE,
  comentario        TEXT,
  creado_por        UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_club_pagos_deuda ON club_pagos (deuda_id);
