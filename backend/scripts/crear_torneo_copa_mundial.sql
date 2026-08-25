-- ============================================================================
-- Torneo "Copa Mundial" — formato "Grupos + Playoffs", con 3 Divisiones
-- (Primera, Segunda y Tercera), en canchas propias de la Liga.
--
-- 20 clubes al azar de los ya cargados en la Liga TSMC, repartidos entre las
-- 3 Divisiones (7/7/6). Dentro de cada División se arman 2 Grupos (Zona A y
-- Zona B) al azar, para que se pueda generar el fixture de la fase de grupos
-- por separado en cada zona.
--
-- Config de la llave de eliminación (botón "Generar llave", una vez jugada
-- toda la fase de grupos): clasifican los 2 primeros de cada grupo -> 2
-- grupos x 2 clasificados = 4 equipos -> arranca en Semifinal. Esto es válido
-- sin importar que las zonas tengan 3 o 4 equipos (lo único que tiene que dar
-- una potencia de 2 es el TOTAL de clasificados de la División, no el tamaño
-- de cada zona).
--
-- liga_id: 6bef5bc5-a262-451f-b565-d1cb8b4bb65a
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

WITH torneo_nuevo AS (
  INSERT INTO torneos (liga_id, nombre, deporte, formato_juego, cancha_juego, sistema_puntaje, estado, config_extra)
  VALUES (
    '6bef5bc5-a262-451f-b565-d1cb8b4bb65a',
    'Copa Mundial',
    'futbol',
    'grupos_playoffs',
    'propias_liga',
    '{"victoria":3,"empate":1,"derrota":0}'::jsonb,
    'planificado',
    '{"clasificados_por_grupo":2,"mejor_tercero":false}'::jsonb
  )
  RETURNING id
),
divisiones_nuevas AS (
  INSERT INTO categorias (torneo_id, nombre, genero, orden)
  SELECT t.id, d.nombre, 'mixto', d.orden
  FROM torneo_nuevo t
  CROSS JOIN (VALUES ('Primera', 0), ('Segunda', 1), ('Tercera', 2)) AS d(nombre, orden)
  RETURNING id, torneo_id, orden
),
clubes_elegidos AS (
  -- Primero elegimos los 20 clubes al azar (materializado en su propio paso,
  -- igual que en los otros scripts, para no mezclar esta elección con los
  -- repartos de abajo).
  SELECT club_id
  FROM club_liga
  WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
  ORDER BY random()
  LIMIT 20
),
clubes_division AS (
  -- Reparto entre las 3 Divisiones: NTILE(3) sobre 20 clubes da 7/7/6.
  SELECT club_id, NTILE(3) OVER (ORDER BY random()) AS division_num
  FROM clubes_elegidos
),
clubes_grupo AS (
  -- Dentro de cada División, reparto en 2 Grupos (Zona A / Zona B).
  SELECT club_id, division_num,
         NTILE(2) OVER (PARTITION BY division_num ORDER BY random()) AS grupo_num
  FROM clubes_division
)
INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, grupo)
SELECT dn.torneo_id, dn.id, cg.club_id, CASE WHEN cg.grupo_num = 1 THEN 'Zona A' ELSE 'Zona B' END
FROM clubes_grupo cg
JOIN divisiones_nuevas dn ON dn.orden = cg.division_num - 1;

-- Chequeo final
SELECT t.nombre AS torneo, cat.nombre AS division, et.grupo, COUNT(et.id) AS equipos_asignados
FROM torneos t
JOIN categorias cat ON cat.torneo_id = t.id
LEFT JOIN equipos_torneo et ON et.categoria_id = cat.id
WHERE t.nombre = 'Copa Mundial' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
GROUP BY t.nombre, cat.nombre, cat.orden, et.grupo
ORDER BY cat.orden, et.grupo;

COMMIT;
