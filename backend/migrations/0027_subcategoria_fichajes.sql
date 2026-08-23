-- ============================================================================
-- Agrega el 4to nivel de la cascada Liga -> Torneo -> División (categoria) ->
-- Categoría (subcategoria) al momento de fichar un jugador. Hasta ahora
-- `fichajes` sólo guardaba hasta categoria_id (división); cuando esa
-- división tiene subcategorías cargadas (ver 0007_subcategorias_multiples),
-- hace falta saber a cuál de ellas queda fichado el jugador (por ejemplo:
-- división "Fútbol Femenino", subcategoría "Primera" o "Reserva").
--
-- A diferencia de equipos_torneo.subcategoria_id (que usa ON DELETE CASCADE),
-- acá usamos ON DELETE SET NULL: un fichaje/carnet ya aprobado es un
-- registro histórico del jugador y no tiene que desaparecer si la Liga borra
-- o reorganiza subcategorías más adelante.
-- ============================================================================
ALTER TABLE fichajes ADD COLUMN subcategoria_id UUID REFERENCES categoria_subcategorias(id) ON DELETE SET NULL;

CREATE INDEX idx_fichajes_subcategoria ON fichajes (subcategoria_id);
