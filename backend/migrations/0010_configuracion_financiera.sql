-- ============================================================================
-- 0010: Configuración financiera de la Liga — listas propias de "Tipos de
-- gasto", "Tipos de ingreso" y "Cuentas" (ej: Banco Galicia, Caja chica,
-- Mercado Pago), para usarlas como desplegable al cargar un Gasto o un
-- Ingreso en vez de escribir la categoría a mano cada vez.
-- Se agregan las columnas nuevas a gastos/ingresos pero se deja la columna
-- "categoria" (texto libre) como estaba, por compatibilidad con lo ya
-- cargado — el frontend pasa a usar el tipo elegido de la lista.
-- ============================================================================

CREATE TABLE tipos_gasto (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liga_id, nombre)
);

CREATE TABLE tipos_ingreso (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  activo            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liga_id, nombre)
);

CREATE TABLE cuentas_liga (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id           UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  nombre            VARCHAR(100) NOT NULL,
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  creado_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (liga_id, nombre)
);

ALTER TABLE gastos ADD COLUMN tipo_gasto_id UUID REFERENCES tipos_gasto(id) ON DELETE SET NULL;
ALTER TABLE gastos ADD COLUMN cuenta_id UUID REFERENCES cuentas_liga(id) ON DELETE SET NULL;

ALTER TABLE ingresos ADD COLUMN tipo_ingreso_id UUID REFERENCES tipos_ingreso(id) ON DELETE SET NULL;
ALTER TABLE ingresos ADD COLUMN cuenta_id UUID REFERENCES cuentas_liga(id) ON DELETE SET NULL;
