-- ============================================================================
-- 0026: Limpieza de deudas "por partido" generadas por error antes de que el
-- backend se corrigiera para generarlas recién al cargar el resultado del
-- partido (ver 0025_cobros.sql / src/routes/ligaFixtureRoutes.js). Antes de
-- ese fix, se generaban de una al armar el fixture completo -- así que hoy
-- puede haber deudas de tipo 'por_partido' de partidos que TODAVÍA no se
-- jugaron.
--
-- Este script borra esas deudas mal generadas, con una única salvedad: si
-- alguna ya tiene un pago registrado en contra (no debería pasar, pero por
-- las dudas) NO se borra, para no perder esa plata cargada -- esos casos
-- quedan listados al final para revisarlos a mano.
-- ============================================================================

DELETE FROM club_deudas d
WHERE d.tipo = 'por_partido'
  AND d.partido_id IN (SELECT id FROM partidos WHERE estado <> 'jugado')
  AND NOT EXISTS (SELECT 1 FROM club_pagos p WHERE p.deuda_id = d.id);

-- Si esta consulta devuelve filas, son deudas "por partido" de partidos sin
-- jugar que YA tienen un pago cargado -- revisalas a mano antes de decidir
-- qué hacer (podés dejarlas, o borrar el pago y después la deuda).
SELECT d.id AS deuda_id, d.club_id, d.partido_id, d.monto, d.descripcion
FROM club_deudas d
WHERE d.tipo = 'por_partido'
  AND d.partido_id IN (SELECT id FROM partidos WHERE estado <> 'jugado')
  AND EXISTS (SELECT 1 FROM club_pagos p WHERE p.deuda_id = d.id);
