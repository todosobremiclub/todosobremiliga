-- Marca si una categoría (o, si tiene, cada una de sus subcategorías) suma
-- sus puntos a la tabla general del torneo (para torneos con varias
-- categorías/subcategorías que compiten en paralelo pero además compiten
-- entre sí en una tabla combinada, ej: Baby Fútbol Categorías A-E con
-- subcategorías 2018/2019/2020).
ALTER TABLE categorias ADD COLUMN suma_tabla_general BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categoria_subcategorias ADD COLUMN suma_tabla_general BOOLEAN NOT NULL DEFAULT TRUE;
