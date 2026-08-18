-- Dirección propia de cada cancha del club (puede ser distinta a la
-- dirección general del club, ej: un club con una cancha en otro barrio).
-- Se usa para mostrarla en el Fixture según la cancha que se seleccione
-- para cada partido.
ALTER TABLE clubes_canchas ADD COLUMN direccion VARCHAR(255);
