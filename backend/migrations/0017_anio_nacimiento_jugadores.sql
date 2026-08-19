-- Guarda el año de nacimiento del jugador como columna calculada a partir de
-- fecha_nacimiento (generada automáticamente por Postgres, no hay que
-- mantenerla a mano) — sirve para filtrar rápido por año de nacimiento en el
-- listado de Jugadores del Club, sin tener que parsear la fecha en cada
-- consulta.
ALTER TABLE jugadores ADD COLUMN anio_nacimiento INTEGER GENERATED ALWAYS AS
  (EXTRACT(YEAR FROM fecha_nacimiento)::int) STORED;
