-- ============================================================================
-- 0002: Ligas - color de acento (para la futura app Android) + separación
-- Productivas / DEMO con estados propios de DEMO.
-- ============================================================================

ALTER TABLE ligas ADD COLUMN color_acento VARCHAR(20);

ALTER TABLE ligas ADD COLUMN tipo VARCHAR(10) NOT NULL DEFAULT 'productiva'
  CHECK (tipo IN ('productiva', 'demo'));

ALTER TABLE ligas ADD COLUMN estado_demo VARCHAR(20)
  CHECK (estado_demo IN ('avanzado', 'pendiente', 'sin_respuesta', 'baja'));

-- Nota: estado_demo solo se usa cuando tipo = 'demo'. Para Ligas 'productiva'
-- queda en NULL y se sigue usando el campo "activo" (Activar/Desactivar) de siempre.
