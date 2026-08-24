-- ============================================================================
-- Marca 20 clubes al azar de la Liga "TSMC" con su cancha principal como
-- "reglamentaria" (checkbox "Cancha reglamentaria (40x20)" en el form de
-- edición de club).
--
-- liga_id: 6bef5bc5-a262-451f-b565-d1cb8b4bb65a
--
-- Solo toca la cancha marcada como PRINCIPAL (es_principal = TRUE) de cada
-- club elegido, que es la que usa el form de "Editar Club". No modifica el
-- campo "Tamaño de la cancha" (la app tampoco lo hace sola al tildar el
-- checkbox, solo deshabilita ese campo para edición manual).
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo el bloque de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

WITH candidatos AS (
  SELECT cc.id
  FROM clubes_canchas cc
  JOIN club_liga cl ON cl.club_id = cc.club_id
  WHERE cl.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
    AND cc.es_principal = TRUE
    AND cc.cancha_reglamentaria IS NOT TRUE
  ORDER BY random()
  LIMIT 20
)
UPDATE clubes_canchas
SET cancha_reglamentaria = TRUE
WHERE id IN (SELECT id FROM candidatos);

-- Chequeo: mostrá cuántas quedaron marcadas en total para esta Liga.
SELECT COUNT(*) AS canchas_reglamentarias
FROM clubes_canchas cc
JOIN club_liga cl ON cl.club_id = cc.club_id
WHERE cl.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
  AND cc.es_principal = TRUE
  AND cc.cancha_reglamentaria = TRUE;

COMMIT;
