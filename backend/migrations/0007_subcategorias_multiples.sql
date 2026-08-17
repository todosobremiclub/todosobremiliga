-- ============================================================================
-- Reestructura "subcategoría" de un campo de texto suelto en `categorias` a
-- una tabla propia (categoria_subcategorias), porque en la práctica una
-- categoría puede tener VARIAS subcategorías (ej: la categoría "Fútbol
-- Femenino" del torneo "Copa Lamba" puede tener las subcategorías "Primera"
-- y "Reserva"). Cuando una categoría tiene subcategorías cargadas, el club
-- se inscribe SIEMPRE a nivel subcategoría (no a la categoría "pelada") —
-- eso se resuelve en el backend de participaciones, no acá.
-- ============================================================================
CREATE TABLE categoria_subcategorias (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id  UUID NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
  nombre        VARCHAR(100) NOT NULL,
  orden         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (categoria_id, nombre)
);

CREATE INDEX idx_categoria_subcategorias_categoria ON categoria_subcategorias (categoria_id);

-- Migra el valor libre que ya pudiera existir en categorias.subcategoria
-- (cargado en el batch anterior) a una fila de la nueva tabla, para no
-- perder nada ya cargado.
INSERT INTO categoria_subcategorias (categoria_id, nombre)
SELECT id, TRIM(subcategoria) FROM categorias
WHERE subcategoria IS NOT NULL AND TRIM(subcategoria) <> '';

ALTER TABLE categorias DROP COLUMN subcategoria;

-- ============================================================================
-- La inscripción de un club (equipos_torneo) ahora puede apuntar, opcional-
-- mente, a una subcategoría puntual dentro de la categoría. Cuando la
-- categoría tiene subcategorías cargadas, el equipo SIEMPRE va a apuntar a
-- una de ellas (subcategoria_id NOT NULL en ese caso, validado en el
-- backend); si la categoría no tiene subcategorías, subcategoria_id queda NULL.
-- ============================================================================
ALTER TABLE equipos_torneo ADD COLUMN subcategoria_id UUID REFERENCES categoria_subcategorias(id) ON DELETE CASCADE;

CREATE INDEX idx_equipos_torneo_subcategoria ON equipos_torneo (subcategoria_id);

-- Reemplaza el UNIQUE anterior (torneo_id, categoria_id, club_id) por uno que
-- contempla la subcategoría: dos equipos del mismo club en la misma categoría
-- son válidos SI son de subcategorías distintas (ej: uno en "Primera" y otro
-- en "Reserva"). Usamos una columna generada que reemplaza NULL por un UUID
-- sentinela fijo, porque en SQL dos NULL nunca "chocan" en un UNIQUE (y sin
-- esto, un club podría quedar inscripto dos veces en la misma categoría SIN
-- subcategorías).
ALTER TABLE equipos_torneo DROP CONSTRAINT equipos_torneo_torneo_id_categoria_id_club_id_key;

ALTER TABLE equipos_torneo ADD COLUMN subcategoria_clave UUID GENERATED ALWAYS AS
  (COALESCE(subcategoria_id, '00000000-0000-0000-0000-000000000000'::uuid)) STORED;

ALTER TABLE equipos_torneo ADD CONSTRAINT equipos_torneo_torneo_cat_club_subcat_key
  UNIQUE (torneo_id, categoria_id, club_id, subcategoria_clave);
