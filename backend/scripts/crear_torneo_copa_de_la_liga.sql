-- ============================================================================
-- Torneo "Copa de la Liga" — formato "Eliminación directa" puro (sin fase de
-- grupos previa): una sola División ("Primera"), en canchas de los clubes.
--
-- OJO — cambio respecto al pedido original: la eliminación directa arma la
-- llave sorteando TODOS los equipos inscriptos de una, así que la cantidad
-- tiene que ser una potencia de 2 (2, 4, 8, 16, 32 o 64) — no admite equipos
-- "libres"/con bye. Por eso acá se cargan 16 clubes al azar (no 20, como en
-- los otros torneos) — es la potencia de 2 más cercana. Si preferís otra
-- cantidad (8, 32...) avisame y te lo ajusto.
--
-- Cancha de los clubes: tampoco se especificó en el pedido original, así que
-- usé "clubes" (canchas de los propios equipos) — cambialo si lo pensaste
-- distinto, es un campo editable desde "Editar" torneo.
--
-- Con el torneo ya creado y los 16 equipos inscriptos, para armar la llave
-- hay que ir al torneo en el panel, entrar a la División "Primera" y usar el
-- botón "Generar llave" (no "Generar automático": ese botón es para fixtures
-- de temporada regular, que este formato no tiene).
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
    'Copa de la Liga',
    'futbol',
    'eliminacion_directa',
    'clubes',
    '{"victoria":3,"empate":1,"derrota":0}'::jsonb,
    'planificado'
  )
  RETURNING id
),
division_nueva AS (
  INSERT INTO categorias (torneo_id, nombre, genero, orden)
  SELECT id, 'Primera', 'mixto', 0 FROM torneo_nuevo
  RETURNING id, torneo_id
),
clubes_elegidos AS (
  SELECT club_id
  FROM club_liga
  WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
  ORDER BY random()
  LIMIT 16
)
INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id)
SELECT dn.torneo_id, dn.id, ce.club_id
FROM clubes_elegidos ce
CROSS JOIN division_nueva dn;

-- Chequeo final
SELECT t.nombre AS torneo, cat.nombre AS division, COUNT(et.id) AS equipos_asignados
FROM torneos t
JOIN categorias cat ON cat.torneo_id = t.id
LEFT JOIN equipos_torneo et ON et.categoria_id = cat.id
WHERE t.nombre = 'Copa de la Liga' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
GROUP BY t.nombre, cat.nombre;

COMMIT;
