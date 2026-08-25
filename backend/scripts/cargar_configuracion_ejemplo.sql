-- ============================================================================
-- Carga de datos de EJEMPLO para probar el módulo de Configuración de la
-- Liga TSMC: Tipos de Ingreso, Tipos de Gasto, Cuentas, Tipos de Cancha,
-- un Predio con sus Canchas propias, Árbitros, y Cobros (conceptos de pago).
--
-- Son nombres típicos para arrancar a probar las pantallas — después los
-- editás/borrás/agregás los que realmente uses desde el panel.
--
-- Los "Cobros" (torneo_conceptos_pago) son por TORNEO, no de la Liga en
-- general — así que acá los cargué sobre el torneo "Torneo Simple" (el
-- último que armamos) a modo de ejemplo. Si querés que los cargue en otro
-- torneo, avisame y te lo ajusto.
--
-- liga_id: 6bef5bc5-a262-451f-b565-d1cb8b4bb65a
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

-- ----- Tipos de Ingreso -----
INSERT INTO tipos_ingreso (liga_id, nombre) VALUES
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Cuota mensual de clubes'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Inscripción a torneos'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Multas y sanciones'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Sponsors y publicidad'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Venta de indumentaria');

-- ----- Tipos de Gasto -----
INSERT INTO tipos_gasto (liga_id, nombre) VALUES
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Arbitrajes'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Alquiler de canchas'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Trofeos y medallas'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Papelería e imprenta'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Mantenimiento de predios');

-- ----- Cuentas -----
INSERT INTO cuentas_liga (liga_id, nombre) VALUES
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Banco Nación - Cta Cte'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Mercado Pago'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Caja chica');

-- ----- Tipos de Cancha -----
INSERT INTO tipos_cancha (liga_id, nombre) VALUES
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Césped sintético'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Césped natural'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Cemento / parquet');

-- ----- Predio y Canchas propias de la Liga -----
WITH predio_nuevo AS (
  INSERT INTO predios_liga (liga_id, nombre, direccion)
  VALUES ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Predio Municipal', 'Av. Principal 1234')
  RETURNING id
),
tipo_sintetico AS (
  SELECT id FROM tipos_cancha WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a' AND nombre = 'Césped sintético'
)
INSERT INTO canchas_predio (predio_id, nombre, tipo_techo, tamanio, tipo_cancha_id)
SELECT predio_nuevo.id, c.nombre, c.tipo_techo, c.tamanio, tipo_sintetico.id
FROM predio_nuevo, tipo_sintetico,
  (VALUES
    ('Cancha 1', 'techada', '5 vs 5'),
    ('Cancha 2', 'aire_libre', '7 vs 7'),
    ('Cancha Principal', 'aire_libre', '11 vs 11')
  ) AS c(nombre, tipo_techo, tamanio);

-- ----- Árbitros -----
INSERT INTO arbitros_liga (liga_id, nombre, apellido, telefono, tipo) VALUES
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Carlos', 'Gómez', '11-2233-4455', 'arbitro'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Marcela', 'Fernández', '11-3344-5566', 'arbitro'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Javier', 'López', '11-4455-6677', 'juez_linea'),
  ('6bef5bc5-a262-451f-b565-d1cb8b4bb65a', 'Ana', 'Martínez', '11-5566-7788', 'ambos');

-- ----- Cobros (conceptos de pago) — de ejemplo sobre el torneo "Torneo Simple" -----
INSERT INTO torneo_conceptos_pago (torneo_id, tipo, monto)
SELECT t.id, c.tipo, c.monto
FROM torneos t,
  (VALUES
    ('inscripcion', 15000.00),
    ('mensual', 8000.00),
    ('por_partido', 2500.00)
  ) AS c(tipo, monto)
WHERE t.nombre = 'Torneo Simple' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

-- Chequeo final
SELECT 'tipos_ingreso' AS tabla, COUNT(*) FROM tipos_ingreso WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'tipos_gasto', COUNT(*) FROM tipos_gasto WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'cuentas_liga', COUNT(*) FROM cuentas_liga WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'tipos_cancha', COUNT(*) FROM tipos_cancha WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'predios_liga', COUNT(*) FROM predios_liga WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'canchas_predio', COUNT(*) FROM canchas_predio cp JOIN predios_liga p ON p.id = cp.predio_id WHERE p.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'arbitros_liga', COUNT(*) FROM arbitros_liga WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a'
UNION ALL
SELECT 'torneo_conceptos_pago (Torneo Simple)', COUNT(*) FROM torneo_conceptos_pago tcp JOIN torneos t ON t.id = tcp.torneo_id WHERE t.nombre = 'Torneo Simple' AND t.liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

COMMIT;
