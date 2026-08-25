-- ============================================================================
-- Torneo "Liga Multicategoría 2026" — Apertura y Clausura, con varias
-- Divisiones (Primera y Reserva) y varias Categorías dentro de cada una
-- (2009 y 2010), todas con "suma_tabla_general" activado (es el valor por
-- defecto) para que sumen entre sí en UNA sola tabla general combinada,
-- además de la tabla general propia de cada Categoría (Apertura+Clausura).
--
-- Le puse ese nombre porque en el pedido original no se indicó un nombre
-- para este torneo — cambiálo con el botón "Editar" del torneo si querés
-- otro.
--
-- 20 clubes al azar de los ya cargados en la Liga TSMC, repartidos parejo
-- entre las 4 combinaciones División×Categoría (5 en cada una).
--
-- liga_id: 6bef5bc5-a262-451f-b565-d1cb8b4bb65a
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

WITH torneo_nuevo AS (
  INSERT INTO torneos (liga_id, nombre, deporte, formato_juego, cancha_juego, sistema_puntaje, estado)
  VALUES (
    '6bef5bc5-a262-451f-b565-d1cb8b4bb65a',
    'Liga Multicategoría 2026',
    'futbol',
    'apertura_clausura',
    'clubes',
    '{"victoria":3,"empate":1,"derrota":0}'::jsonb,
    'planificado'
  )
  RETURNING id
),
divisiones_nuevas AS (
  INSERT INTO categorias (torneo_id, nombre, genero, orden, suma_tabla_general)
  SELECT t.id, d.nombre, 'mixto', d.orden, TRUE
  FROM torneo_nuevo t
  CROSS JOIN (VALUES ('Primera', 0), ('Reserva', 1)) AS d(nombre, orden)
  RETURNING id, torneo_id, nombre, orden
),
categorias_nuevas AS (
  -- Estas son las "categorías" (2009 / 2010) dentro de cada división.
  INSERT INTO categoria_subcategorias (categoria_id, nombre, orden, suma_tabla_general)
  SELECT dn.id, s.nombre, s.orden, TRUE
  FROM divisiones_nuevas dn
  CROSS JOIN (VALUES ('2009', 0), ('2010', 1)) AS s(nombre, orden)
  RETURNING id, categoria_id, nombre
),
combinaciones AS (
  -- Cada combinación División×Categoría, numerada para repartir los clubes.
  SELECT
    cn.id AS subcategoria_id,
    dn.id AS categoria_id,
    dn.torneo_id,
    ROW_NUMBER() OVER (ORDER BY dn.orden, cn.nombre) AS numero
  FROM categorias_nuevas cn
  JOIN divisiones_nuevas dn ON dn.id = cn.categoria_id
),
clubes_elegidos AS (
  SELECT club_id
  FROM club_liga
  WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
  ORDER BY random()
  LIMIT 20
),
clubes_azar AS (
  SELECT club_id, NTILE(4) OVER (ORDER BY random()) AS grupo
  FROM clubes_elegidos
)
INSERT INTO equipos_torneo (torneo_id, categoria_id, subcategoria_id, club_id)
SELECT c.torneo_id, c.categoria_id, c.subcategoria_id, ca.club_id
FROM clubes_azar ca
JOIN combinaciones c ON c.numero = ca.grupo;

-- Chequeo final
SELECT t.nombre AS torneo, cat.nombre AS division, cs.nombre AS categoria, COUNT(et.id) AS equipos_asignados
FROM torneos t
JOIN categorias cat ON cat.torneo_id = t.id
JOIN categoria_subcategorias cs ON cs.categoria_id = cat.id
LEFT JOIN equipos_torneo et ON et.subcategoria_id = cs.id
WHERE t.nombre = 'Liga Multicategoría 2026' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
GROUP BY t.nombre, cat.nombre, cat.orden, cs.nombre
ORDER BY cat.orden, cs.nombre;

COMMIT;
