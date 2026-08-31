-- Foto de frente y de dorso del DNI del jugador. Se suben desde el Club al
-- solicitar un fichaje (o al cargar/editar el jugador) y quedan guardadas
-- en el JUGADOR (no en el fichaje puntual): un jugador puede tener varios
-- fichajes a lo largo del tiempo (distintos torneos/Ligas) y el DNI es el
-- mismo documento en todos los casos, no tiene sentido repetir la carga.
--
-- Mismo criterio que foto_url: se guardan como 'data:image/...;base64,...'
-- (ver decisión #2 del roadmap), no como archivos aparte.
ALTER TABLE jugadores
  ADD COLUMN dni_frente_url TEXT,
  ADD COLUMN dni_dorso_url TEXT;
