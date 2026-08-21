-- Foto/banner de una categoría (ej: la foto del baby fútbol categoría 2015),
-- para mostrar tanto en el panel de Liga (sección Torneos) como en el sitio
-- público, igual que ya se hace con el logo del club.
ALTER TABLE categorias ADD COLUMN foto_url TEXT;
