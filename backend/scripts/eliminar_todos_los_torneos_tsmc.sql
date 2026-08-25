-- ============================================================================
-- Borra TODOS los torneos de la Liga TSMC (liga de prueba), para arrancar de
-- cero y volver a cargarlos de a uno, validando cada uno antes de seguir con
-- el siguiente.
--
-- Al borrar de la tabla "torneos", se van en cascada automáticamente (están
-- todas las FK con ON DELETE CASCADE):
--   categorias (Divisiones) -> categoria_subcategorias (Categorías)
--   equipos_torneo (equipos inscriptos)
--   partidos (fixture y llave de eliminación)
--   tabla_posiciones
--   torneo_documentos (reglamentos subidos)
--
-- NO toca: los clubes, ni su alta en la Liga (club_liga) — esos quedan
-- intactos para volver a inscribirlos en los próximos torneos.
--
-- liga_id: 6bef5bc5-a262-451f-b565-d1cb8b4bb65a
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

-- Chequeo antes de borrar: qué se va a eliminar.
SELECT id, nombre, formato_juego FROM torneos WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

DELETE FROM torneos WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

-- Chequeo final: tiene que devolver 0 filas.
SELECT COUNT(*) AS torneos_restantes FROM torneos WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

COMMIT;
