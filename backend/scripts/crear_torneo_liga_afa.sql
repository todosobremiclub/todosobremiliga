-- ============================================================================
-- Torneo "Liga AFA" — Apertura y Clausura, en las canchas de los clubes, con
-- 4 Divisiones (Primera A, B, C y D), y 20 clubes al azar de los ya cargados
-- en la Liga TSMC, repartidos parejo entre las 4 Divisiones (5 por división).
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
    'Liga AFA',
    'futbol',
    'apertura_clausura',
    'clubes',
    '{"victoria":3,"empate":1,"derrota":0}'::jsonb,
    'planificado'
  )
  RETURNING id
),
divisiones_nuevas AS (
  INSERT INTO categorias (torneo_id, nombre, genero, orden)
  SELECT t.id, d.nombre, 'mixto', d.orden
  FROM torneo_nuevo t
  CROSS JOIN (VALUES ('Primera A', 0), ('Primera B', 1), ('Primera C', 2), ('Primera D', 3)) AS d(nombre, orden)
  RETURNING id, torneo_id, orden
),
clubes_elegidos AS (
  -- Primero elegimos los 20 clubes al azar (materializado en su propio paso,
  -- para no mezclar esta elección con el reparto en 4 grupos de abajo).
  SELECT club_id
  FROM club_liga
  WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
  ORDER BY random()
  LIMIT 20
),
clubes_azar AS (
  -- Recién sobre esos 20 ya elegidos repartimos parejo en 4 grupos (5 c/u).
  SELECT club_id, NTILE(4) OVER (ORDER BY random()) AS grupo
  FROM clubes_elegidos
)
INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id)
SELECT dn.torneo_id, dn.id, ca.club_id
FROM clubes_azar ca
JOIN divisiones_nuevas dn ON dn.orden = ca.grupo - 1;

-- Chequeo final
SELECT t.nombre AS torneo, cat.nombre AS division, COUNT(et.id) AS equipos_asignados
FROM torneos t
JOIN categorias cat ON cat.torneo_id = t.id
LEFT JOIN equipos_torneo et ON et.categoria_id = cat.id
WHERE t.nombre = 'Liga AFA' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
GROUP BY t.nombre, cat.nombre, cat.orden
ORDER BY cat.orden;

COMMIT;
