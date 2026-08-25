-- ============================================================================
-- Redes sociales de la Liga, para mostrar en el footer del sitio público
-- (logo de la Liga + botones de Facebook/Instagram/YouTube). Se configuran
-- desde el Panel Super Admin al cargar o editar una Liga -- son opcionales,
-- el footer sólo pinta el botón de la red social que tenga URL cargada.
-- ============================================================================
ALTER TABLE ligas ADD COLUMN facebook_url  VARCHAR(255);
ALTER TABLE ligas ADD COLUMN instagram_url VARCHAR(255);
ALTER TABLE ligas ADD COLUMN youtube_url   VARCHAR(255);
