-- ============================================================================
-- REVERTIR "Super Liga" — deshace TODO lo que haya quedado cargado por
-- cualquiera de las versiones anteriores del script:
--   v1) Super Liga como una Liga nueva aparte (slug 'super-liga') + su
--       usuario liga_admin (scripts/crear_usuario_super_liga.sql)
--   v2) Super Liga como 26 Torneos separados "División A".."División Z"
--       dentro de TSMC
--   v3) Super Liga como 1 Torneo "Super Liga" (slug 'super-liga') dentro de
--       TSMC, con Divisiones A-Z como categorías
--
-- Es seguro correrlo aunque no hayas ejecutado ninguna versión: si no
-- encuentra nada, no borra nada.
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

-- Los jugadores creados para los fichajes de Super Liga (en cualquiera de
-- sus versiones) no se borran solos al eliminar la Liga/Torneo (jugadores.
-- club_id no depende de liga_id ni torneo_id), así que los borramos a mano
-- primero. Esto arrastra en cascada sus fichajes.
DELETE FROM jugadores
WHERE id IN (
  SELECT jugador_id FROM fichajes
  WHERE liga_id = (SELECT id FROM ligas WHERE slug = 'super-liga')
     OR torneo_id IN (
          SELECT id FROM torneos
          WHERE nombre = 'Super Liga' OR nombre LIKE 'División %'
        )
);

-- v2: 26 Torneos "División A".."División Z" (categorías, equipos_torneo,
-- partidos, tabla_posiciones y fichajes que hayan quedado se van en cascada).
DELETE FROM torneos WHERE nombre LIKE 'División %';

-- v3: 1 Torneo "Super Liga" dentro de TSMC (con sus categorías/Divisiones,
-- subcategorías/años, equipos_torneo, partidos, tabla_posiciones y fichajes
-- en cascada).
DELETE FROM torneos WHERE nombre = 'Super Liga';

-- v1: Liga "Super Liga" aparte (arrastra en cascada usuarios, torneos,
-- categorías, equipos_torneo, partidos, tabla_posiciones, club_liga y
-- fichajes que hubieran quedado). Los 200 clubes NO se tocan (son entidades
-- globales, siguen existiendo y siguen en TSMC).
DELETE FROM ligas WHERE slug = 'super-liga';

-- Chequeo final (debería devolver 0 filas)
SELECT
  (SELECT COUNT(*) FROM ligas WHERE slug = 'super-liga') AS liga_restos,
  (SELECT COUNT(*) FROM torneos WHERE nombre = 'Super Liga' OR nombre LIKE 'División %') AS torneos_restos;

COMMIT;
-- Si preferís deshacer todo en vez de confirmar, ejecutá ROLLBACK; en lugar de la línea COMMIT; de arriba.
