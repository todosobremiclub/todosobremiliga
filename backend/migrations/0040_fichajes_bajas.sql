-- 'Baja directa con aviso' (decisión explícita del roadmap): el Club puede
-- eliminar un fichado por su cuenta, SIN esperar aprobación de la Liga. El
-- fichaje se borra de verdad (no queda como 'rechazado' ni nada intermedio)
-- -- esta tabla es sólo el registro/aviso para que la Liga vea qué pasó,
-- ya que después de la baja no queda ningún otro rastro del fichaje.
--
-- Se guardan copias de los datos (nombre del jugador, torneo, etc.) en vez
-- de FKs al fichaje/torneo/categoría porque el fichaje ya no existe después
-- de la baja, y no tiene sentido obligar a este aviso a desaparecer si el
-- torneo se borra más adelante.
CREATE TABLE fichajes_bajas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liga_id               UUID NOT NULL REFERENCES ligas(id) ON DELETE CASCADE,
  club_id               UUID NOT NULL REFERENCES clubes(id) ON DELETE CASCADE,
  jugador_nombre        VARCHAR(150) NOT NULL,
  jugador_apellido      VARCHAR(150) NOT NULL,
  jugador_dni           VARCHAR(30),
  torneo_nombre         VARCHAR(200),
  categoria_nombre      VARCHAR(200),
  subcategoria_nombre   VARCHAR(200),
  estado_al_momento     VARCHAR(20),
  motivo                TEXT,
  dado_de_baja_por      UUID REFERENCES usuarios(id),
  creado_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fichajes_bajas_liga ON fichajes_bajas(liga_id, creado_at DESC);
