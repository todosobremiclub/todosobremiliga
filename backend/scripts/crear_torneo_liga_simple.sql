-- ============================================================================
-- Torneo "Liga Simple" — Liguilla ida y vuelta, en canchas propias de la Liga,
-- con una sola División ("Primera"), y 20 clubes al azar de los ya cargados
-- en la Liga TSMC asignados a esa División.
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
    'Liga Simple',
    'futbol',
    'liguilla_ida_vuelta',
    'propias_liga',
    '{"victoria":3,"empate":1,"derrota":0}'::jsonb,
    'planificado'
  )
  RETURNING id
),
categoria_nueva AS (
  INSERT INTO categorias (torneo_id, nombre, genero, orden)
  SELECT id, 'Primera', 'mixto', 0 FROM torneo_nuevo
  RETURNING id, torneo_id
),
clubes_azar AS (
  SELECT club_id
  FROM club_liga
  WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
  ORDER BY random()
  LIMIT 20
)
INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id)
SELECT c.torneo_id, c.id, ca.club_id
FROM categoria_nueva c
CROSS JOIN clubes_azar ca;

-- Chequeo final
SELECT t.nombre AS torneo, cat.nombre AS division, COUNT(et.id) AS equipos_asignados
FROM torneos t
JOIN categorias cat ON cat.torneo_id = t.id
LEFT JOIN equipos_torneo et ON et.categoria_id = cat.id
WHERE t.nombre = 'Liga Simple' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
GROUP BY t.nombre, cat.nombre;

COMMIT;
