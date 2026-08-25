-- ============================================================================
-- Genera retroactivamente la deuda de "Inscripción" para los clubes que ya
-- estaban inscriptos en un torneo ANTES de que se cargara el concepto de
-- pago "inscripcion" — normalmente esto se genera solo en el momento en
-- que un club se inscribe, así que a los que ya estaban cargados no les
-- llegó a impactar.
--
-- Es seguro correrlo más de una vez: no duplica (hay un índice único por
-- torneo+club+concepto para el tipo 'inscripcion'), así que si ya le generó
-- la deuda a un club, ese club se salta y listo.
--
-- Este script apunta al torneo "Torneo Simple" — si querés correrlo para
-- otro torneo, cambiá el nombre en el WHERE de la selección de "torneo".
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

WITH torneo AS (
  SELECT id FROM torneos
  WHERE nombre = 'Torneo Simple' AND liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
),
concepto AS (
  SELECT id, monto FROM torneo_conceptos_pago
  WHERE torneo_id = (SELECT id FROM torneo) AND tipo = 'inscripcion' AND activo = TRUE
),
clubes_inscriptos AS (
  -- Un club puede tener más de un equipo_torneo (varias categorías dentro
  -- del mismo torneo) — la deuda de inscripción es UNA por club, no una por
  -- cada equipo, por eso el DISTINCT.
  SELECT DISTINCT club_id FROM equipos_torneo
  WHERE torneo_id = (SELECT id FROM torneo) AND activo = TRUE
)
INSERT INTO club_deudas (torneo_id, concepto_id, club_id, tipo, descripcion, monto)
SELECT (SELECT id FROM torneo), concepto.id, clubes_inscriptos.club_id, 'inscripcion', 'Inscripción al torneo', concepto.monto
FROM clubes_inscriptos, concepto
ON CONFLICT (torneo_id, club_id, concepto_id) WHERE tipo = 'inscripcion' DO NOTHING;

-- Chequeo final: cuántas deudas de inscripción quedaron para este torneo
-- (tendría que ser igual a la cantidad de clubes inscriptos).
SELECT t.nombre AS torneo, COUNT(cd.id) AS deudas_inscripcion
FROM torneos t
LEFT JOIN club_deudas cd ON cd.torneo_id = t.id AND cd.tipo = 'inscripcion'
WHERE t.nombre = 'Torneo Simple' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
GROUP BY t.nombre;

COMMIT;
