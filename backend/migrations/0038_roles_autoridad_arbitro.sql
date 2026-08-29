-- Habilita 2 roles nuevos, pensados para la futura app móvil (y ya utilizables
-- desde la web): "autoridad" y "arbitro".
--
-- - autoridad: es un concepto NUEVO. La Liga le asigna uno o más alcances
--   (Torneo, opcionalmente una División puntual (categorias.id) y
--   opcionalmente una Categoría puntual dentro de esa división
--   (categoria_subcategorias.id)). Dentro de ese alcance puede cargar el
--   resultado de un partido (incluye goles/tarjetas por jugador, ya que se
--   cargan juntos). No puede tocar nada más de la plataforma.
--
-- - arbitro: NO es un concepto nuevo — la Liga ya tenía un padrón de árbitros
--   (tabla `arbitros_liga`, migración 0013) que se asigna a partidos
--   puntuales (`partido_arbitros`). Lo único que agrega esta migración es la
--   posibilidad de darle a un árbitro del padrón un LOGIN (usuario_id) para
--   que pueda entrar a la app y ver SOLO los partidos que ya tiene asignados
--   en `partido_arbitros` — no se duplica ni se toca el padrón existente.

ALTER TABLE usuarios DROP CONSTRAINT usuarios_rol_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
  CHECK (rol IN ('super_admin', 'liga_admin', 'club_admin', 'jugador', 'autoridad', 'arbitro'));

-- Un árbitro del padrón puede (opcionalmente) tener un usuario de login
-- vinculado. Si el usuario se borra, el árbitro sigue existiendo en el
-- padrón, simplemente pierde el acceso a la app.
ALTER TABLE arbitros_liga ADD COLUMN usuario_id UUID UNIQUE REFERENCES usuarios(id) ON DELETE SET NULL;

-- ============================================================================
-- Asignaciones de alcance del rol Autoridad (esto sí es una tabla nueva).
-- Una fila = "este usuario puede cargar resultados en este alcance".
-- categoria_id = división (tabla `categorias`). subcategoria_id = categoría
-- puntual dentro de esa división (tabla `categoria_subcategorias`).
-- NULL en categoria_id o subcategoria_id = alcanza a todo lo de abajo.
-- ============================================================================
CREATE TABLE liga_autoridad_asignaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  liga_id         UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  torneo_id       UUID NOT NULL REFERENCES torneos(id) ON DELETE CASCADE,
  categoria_id    UUID REFERENCES categorias(id) ON DELETE CASCADE,
  subcategoria_id UUID REFERENCES categoria_subcategorias(id) ON DELETE CASCADE,
  creado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_autoridad_asignaciones_usuario ON liga_autoridad_asignaciones (usuario_id);
CREATE INDEX idx_autoridad_asignaciones_torneo ON liga_autoridad_asignaciones (torneo_id);
