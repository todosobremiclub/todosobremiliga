-- ============================================================================
-- SUPER TORNEO — prueba de carga a gran escala (versión con resultados reales)
--
-- Estructura (dentro de la Liga TSMC, sin crear una Liga nueva):
--   Torneo "Super Torneo"
--     └── 26 Categorías ("Zonas") "Zona A" a "Zona Z"
--           └── 7 Subcategorías por Zona: años 2013 a 2019
--
-- Cada Zona tiene su PROPIA tabla general (suma de puntos de sus 7
-- subcategorías/años), sin mezclarse con las otras 25 Zonas — usa el
-- endpoint GET /web/torneos/:torneoId/categorias/:categoriaId/tabla-general
-- (y su par en /liga/torneos/... para el Panel Liga), con todas las
-- subcategorías con suma_tabla_general = TRUE.
--
-- A diferencia de "Super Liga" (versión anterior, ya borrada), esta versión
-- CARGA RESULTADOS REALES para cada partido (no solo el fixture programado):
--   - Cada partido queda con estado='jugado' y un marcador aleatorio.
--   - La tabla de posiciones (apertura/clausura/general) se calcula a partir
--     de esos resultados reales, con el mismo criterio que usa la app al
--     cargar un resultado a mano (src/utils/tablaPosiciones.js).
--   - Se cargan también goleadores y tarjetas por partido
--     (partido_estadisticas_jugador), repartiendo los goles de cada partido
--     entre los 10 jugadores fichados de cada categoría.
--
-- Además:
--   - Formato Apertura y Clausura (localía invertida) para todo el torneo,
--     ida y vuelta.
--   - Se juega en la cancha principal de cada club (cancha_juego = 'clubes').
--   - Fixture automático (round-robin, método del círculo) por Zona,
--     aplicado a las 7 subcategorías: jornada 1 el 01/08/2026 y +7 días por
--     jornada — MISMO fixture (mismos cruces, misma fecha) para las 7
--     categorías de una misma Zona.
--   - Los 200 clubes de prueba ya existentes (alta_masiva_200_clubes.sql, ya
--     socios de TSMC) se reparten al azar entre las 26 Zonas (18 zonas de 8
--     clubes + 8 zonas de 7 clubes = 200), y cada club juega las 7
--     subcategorías (años) de su Zona.
--   - 10 jugadores fichados y APROBADOS por cada combinación club+categoría
--     (200 clubes × 7 categorías × 10 = 14.000 jugadores/fichajes).
--
-- Requiere que ya exista la Liga TSMC con sus 200 clubes de prueba
-- (scripts/alta_masiva_200_clubes.sql), liga_id 6bef5bc5-a262-451f-b565-d1cb8b4bb65a.
--
-- Si antes llegaste a correr "Super Liga" (versión vieja, ya la borraste con
-- revertir_super_liga.sql) no hace falta nada más. Si por algún motivo
-- necesitás deshacer ESTE script, correr scripts/revertir_super_torneo.sql.
--
-- Envuelto en BEGIN/COMMIT: si algo sale mal, ejecutar ROLLBACK; en vez de
-- COMMIT; y no queda nada a medio cargar.
--
-- CÓMO USARLO EN DBEAVER: ejecutar TODO el archivo de una sola vez con
-- "Execute SQL Script" (Alt+X) — no línea por línea.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Liga: se usa la Liga TSMC ya existente (no se crea una nueva)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_liga AS
SELECT id FROM ligas WHERE id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM tmp_liga) <> 1 THEN
    RAISE EXCEPTION 'No se encontró la Liga TSMC (id 6bef5bc5-a262-451f-b565-d1cb8b4bb65a). Revisar antes de continuar.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 1. Torneo único "Super Torneo", dentro de TSMC
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_torneo AS SELECT gen_random_uuid() AS id;

INSERT INTO torneos (id, liga_id, nombre, deporte, temporada, formato_juego, sistema_puntaje, cancha_juego, fecha_inicio, estado, slug)
SELECT t.id, l.id, 'Super Torneo', 'futbol', '2026', 'apertura_clausura',
       '{"victoria":3,"empate":1,"derrota":0}'::jsonb, 'clubes', DATE '2026-08-01', 'en_curso', 'super-torneo'
FROM tmp_torneo t CROSS JOIN tmp_liga l;

-- ----------------------------------------------------------------------------
-- 2. 26 Zonas (categorías) A-Z dentro del Torneo "Super Torneo"
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_divisiones AS
SELECT gen_random_uuid() AS id, chr(64 + n) AS letra, n
FROM generate_series(1, 26) AS n;

INSERT INTO categorias (id, torneo_id, nombre, genero, edad_minima, edad_maxima, orden, suma_tabla_general)
SELECT d.id, t.id, 'Zona ' || d.letra, 'masculino', NULL, NULL, d.n, TRUE
FROM tmp_divisiones d CROSS JOIN tmp_torneo t;

CREATE INDEX idx_tmp_divisiones_letra ON tmp_divisiones (letra);

-- ----------------------------------------------------------------------------
-- 3. 7 Subcategorías (años 2013 a 2019) por Zona, todas suman a la tabla
--    general de SU Zona.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_subcategorias AS
SELECT gen_random_uuid() AS id, d.id AS division_id, d.letra, y.anio, y.ord
FROM tmp_divisiones d
CROSS JOIN (VALUES (2013,1),(2014,2),(2015,3),(2016,4),(2017,5),(2018,6),(2019,7)) AS y(anio, ord);

INSERT INTO categoria_subcategorias (id, categoria_id, nombre, orden, suma_tabla_general)
SELECT id, division_id, anio::text, ord, TRUE
FROM tmp_subcategorias;

CREATE INDEX idx_tmp_subcategorias_division ON tmp_subcategorias (division_id);

-- ----------------------------------------------------------------------------
-- 4. Reparto aleatorio de los 200 clubes existentes entre las 26 Zonas
--    (18 zonas de 8 clubes + 8 zonas de 7 clubes = 200)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_clubes AS
SELECT club_id, row_number() OVER (ORDER BY random()) AS rn
FROM club_liga
WHERE liga_id = '6bef5bc5-a262-451f-b565-d1cb8b4bb65a';

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM tmp_clubes) <> 200 THEN
    RAISE EXCEPTION 'Se esperaban 200 clubes en la Liga TSMC y se encontraron %. Revisar antes de continuar.', (SELECT COUNT(*) FROM tmp_clubes);
  END IF;
END $$;

CREATE TEMP TABLE tmp_div_sizes AS
SELECT id AS division_id, letra,
       CASE WHEN row_number() OVER (ORDER BY random()) <= 18 THEN 8 ELSE 7 END AS cupo
FROM tmp_divisiones;

CREATE TEMP TABLE tmp_div_ranges AS
SELECT division_id, letra, cupo,
       SUM(cupo) OVER (ORDER BY letra ROWS UNBOUNDED PRECEDING) - cupo AS offset_before
FROM tmp_div_sizes;

CREATE TEMP TABLE tmp_club_division AS
SELECT c.club_id, r.division_id, r.letra
FROM tmp_clubes c
JOIN tmp_div_ranges r ON c.rn > r.offset_before AND c.rn <= r.offset_before + r.cupo;

CREATE INDEX idx_tmp_club_division_division ON tmp_club_division (division_id);
CREATE INDEX idx_tmp_club_division_club ON tmp_club_division (club_id);

-- No hace falta insertar en club_liga: los 200 clubes ya son socios de TSMC.

-- ----------------------------------------------------------------------------
-- 5. Cada club inscripto en las 7 subcategorías (años) de su Zona
--    (equipos_torneo, con categoria_id = zona y subcategoria_id = año)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_equipos AS
SELECT gen_random_uuid() AS id, (SELECT id FROM tmp_torneo) AS torneo_id, sc.division_id AS categoria_id, sc.id AS subcategoria_id, cd.club_id
FROM tmp_club_division cd
JOIN tmp_subcategorias sc ON sc.division_id = cd.division_id;

INSERT INTO equipos_torneo (id, torneo_id, categoria_id, subcategoria_id, club_id)
SELECT id, torneo_id, categoria_id, subcategoria_id, club_id FROM tmp_equipos;

CREATE INDEX idx_tmp_equipos_lookup ON tmp_equipos (categoria_id, subcategoria_id, club_id);

-- ----------------------------------------------------------------------------
-- 6. 10 jugadores fichados y APROBADOS por cada combinación club+categoría
--    (200 clubes × 7 categorías × 10 = 14.000 jugadores/fichajes)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_fichajes (
  club_id UUID,
  subcategoria_id UUID,
  jugador_id UUID,
  orden_en_plantel INT
);

DO $$
DECLARE
  nombres TEXT[] := ARRAY['Juan','Mateo','Benjamín','Lucas','Tomás','Santiago','Joaquín','Bautista','Thiago','Valentino',
                           'Emiliano','Facundo','Nicolás','Franco','Agustín','Gael','Ian','Dante','Simón','Máximo',
                           'Federico','Bruno','Ignacio','Ciro','Rodrigo','Gonzalo','Martín','Julián','Lorenzo','Renzo',
                           'Ramiro','Marcos','Diego','Alan','Cristian','Ezequiel','Leonel','Matías','Gaspar','Pedro'];
  apellidos TEXT[] := ARRAY['González','Rodríguez','Gómez','Fernández','López','Díaz','Martínez','Pérez','García','Sánchez',
                             'Romero','Sosa','Torres','Álvarez','Ruiz','Ramírez','Flores','Acosta','Benítez','Medina',
                             'Herrera','Suárez','Aguirre','Rojas','Molina','Ortiz','Silva','Núñez','Cabrera','Ledesma',
                             'Peralta','Vera','Godoy','Ríos','Domínguez','Gutiérrez','Castro','Moreno','Ojeda','Bravo'];
  posiciones TEXT[] := ARRAY['Arquero','Defensor','Mediocampista','Delantero'];
  cd_rec RECORD;
  sub_rec RECORD;
  gen INT;
  contador_dni BIGINT := 0;
  v_jugador_id UUID;
  nombre_j TEXT;
  apellido_j TEXT;
  dni_j TEXT;
  nacimiento DATE;
  fecha_solicitud TIMESTAMPTZ;
BEGIN
  FOR cd_rec IN SELECT club_id, division_id FROM tmp_club_division LOOP
    FOR sub_rec IN SELECT id AS subcategoria_id, anio FROM tmp_subcategorias WHERE division_id = cd_rec.division_id LOOP
      FOR gen IN 1..10 LOOP
        contador_dni := contador_dni + 1;
        nombre_j := nombres[1 + floor(random() * array_length(nombres, 1))::INT];
        apellido_j := apellidos[1 + floor(random() * array_length(apellidos, 1))::INT];
        dni_j := (30000000 + contador_dni)::TEXT; -- estrictamente creciente: garantiza unicidad (club_id, dni)
        nacimiento := make_date(sub_rec.anio, 1 + floor(random() * 12)::INT, 1 + floor(random() * 28)::INT);
        fecha_solicitud := TIMESTAMPTZ '2026-06-01 09:00:00' + (floor(random() * 45) || ' days')::INTERVAL;

        INSERT INTO jugadores (id, club_id, nombre, apellido, dni, fecha_nacimiento, posicion, numero_camiseta, activo)
        VALUES (gen_random_uuid(), cd_rec.club_id, nombre_j, apellido_j, dni_j, nacimiento,
                posiciones[1 + floor(random() * array_length(posiciones, 1))::INT], gen, TRUE)
        RETURNING id INTO v_jugador_id;

        INSERT INTO fichajes (id, jugador_id, club_id, liga_id, torneo_id, categoria_id, subcategoria_id, estado, fecha_solicitud, fecha_resolucion)
        VALUES (gen_random_uuid(), v_jugador_id, cd_rec.club_id, (SELECT id FROM tmp_liga), (SELECT id FROM tmp_torneo),
                cd_rec.division_id, sub_rec.subcategoria_id, 'aprobado', fecha_solicitud, fecha_solicitud + INTERVAL '1 day');

        INSERT INTO tmp_fichajes (club_id, subcategoria_id, jugador_id, orden_en_plantel)
        VALUES (cd_rec.club_id, sub_rec.subcategoria_id, v_jugador_id, gen);
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

CREATE INDEX idx_tmp_fichajes_lookup ON tmp_fichajes (club_id, subcategoria_id);

-- ----------------------------------------------------------------------------
-- 7. Fixture automático CON RESULTADOS: round-robin (método del círculo) por
--    Zona, Apertura + Clausura (localía invertida), ida y vuelta, aplicado a
--    las 7 subcategorías (años). Jornada 1 = 01/08/2026, +7 días cada jornada
--    siguiente (continuo entre Apertura y Clausura), MISMO cruce y fecha para
--    las 7 categorías de la Zona. Cada partido queda cargado como 'jugado'
--    con un marcador al azar, y sus goles repartidos entre los 10 fichados
--    de cada equipo (goleadores) más algunas tarjetas.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  div_rec RECORD;
  sub_rec RECORD;
  club_ids UUID[];
  n INT;
  rondas INT;
  arr UUID[];
  fijo UUID;
  fase INT;
  r INT;
  i INT;
  home UUID;
  away UUID;
  jornada_actual INT;
  fecha_partido DATE;
  equipo_local UUID;
  equipo_visitante UUID;
  cancha_local UUID;
  hora_partido TIME;
  horarios TIME[] := ARRAY['15:00','15:30','16:00','16:30','17:00','18:00']::TIME[];
  v_partido_id UUID;
  goles_local INT;
  goles_visitante INT;
  g INT;
  v_jugador_gol UUID;
  v_amarillas INT;
  v_rojas INT;
  v_jugador_tarjeta UUID;
  es_local BOOLEAN;
BEGIN
  FOR div_rec IN SELECT id AS division_id, letra FROM tmp_divisiones LOOP

    SELECT array_agg(club_id ORDER BY random()) INTO club_ids
    FROM tmp_club_division WHERE division_id = div_rec.division_id;

    n := array_length(club_ids, 1);
    IF n % 2 = 1 THEN
      club_ids := club_ids || NULL::UUID; -- equipo "libre" (bye)
      n := n + 1;
    END IF;
    rondas := n - 1;
    jornada_actual := 0;

    FOR fase IN 1..2 LOOP -- 1 = apertura, 2 = clausura
      arr := club_ids;

      FOR r IN 1..rondas LOOP
        jornada_actual := jornada_actual + 1;
        fecha_partido := DATE '2026-08-01' + (jornada_actual - 1) * 7;

        FOR i IN 1..(n/2) LOOP
          IF fase = 1 THEN
            home := arr[i];
            away := arr[n + 1 - i];
          ELSE
            home := arr[n + 1 - i]; -- Clausura: localía invertida
            away := arr[i];
          END IF;

          IF home IS NOT NULL AND away IS NOT NULL THEN
            FOR sub_rec IN SELECT id AS subcategoria_id FROM tmp_subcategorias WHERE division_id = div_rec.division_id LOOP
              SELECT id INTO equipo_local FROM tmp_equipos
                WHERE categoria_id = div_rec.division_id AND subcategoria_id = sub_rec.subcategoria_id AND club_id = home;
              SELECT id INTO equipo_visitante FROM tmp_equipos
                WHERE categoria_id = div_rec.division_id AND subcategoria_id = sub_rec.subcategoria_id AND club_id = away;
              SELECT id INTO cancha_local FROM clubes_canchas
                WHERE club_id = home AND es_principal = TRUE LIMIT 1;
              hora_partido := horarios[1 + floor(random() * array_length(horarios, 1))::INT];
              goles_local := floor(random() * 5)::INT;      -- 0 a 4
              goles_visitante := floor(random() * 5)::INT;  -- 0 a 4

              INSERT INTO partidos (id, torneo_id, categoria_id, equipo_local_id, equipo_visitante_id, fecha, hora, jornada, ronda, cancha_club_id, estado, resultado_local, resultado_visitante)
              VALUES (gen_random_uuid(), (SELECT id FROM tmp_torneo), div_rec.division_id, equipo_local, equipo_visitante,
                      fecha_partido, hora_partido, jornada_actual, CASE WHEN fase = 1 THEN 'apertura' ELSE 'clausura' END,
                      cancha_local, 'jugado', goles_local, goles_visitante)
              RETURNING id INTO v_partido_id;

              -- Goleadores: reparte los goles de cada equipo entre sus 10 fichados de esa categoría.
              FOR g IN 1..goles_local LOOP
                SELECT jugador_id INTO v_jugador_gol FROM tmp_fichajes
                  WHERE club_id = home AND subcategoria_id = sub_rec.subcategoria_id
                  OFFSET floor(random() * 10) LIMIT 1;
                IF v_jugador_gol IS NOT NULL THEN
                  INSERT INTO partido_estadisticas_jugador (partido_id, jugador_id, equipo_torneo_id, goles)
                  VALUES (v_partido_id, v_jugador_gol, equipo_local, 1)
                  ON CONFLICT (partido_id, jugador_id) DO UPDATE SET goles = partido_estadisticas_jugador.goles + 1;
                END IF;
              END LOOP;

              FOR g IN 1..goles_visitante LOOP
                SELECT jugador_id INTO v_jugador_gol FROM tmp_fichajes
                  WHERE club_id = away AND subcategoria_id = sub_rec.subcategoria_id
                  OFFSET floor(random() * 10) LIMIT 1;
                IF v_jugador_gol IS NOT NULL THEN
                  INSERT INTO partido_estadisticas_jugador (partido_id, jugador_id, equipo_torneo_id, goles)
                  VALUES (v_partido_id, v_jugador_gol, equipo_visitante, 1)
                  ON CONFLICT (partido_id, jugador_id) DO UPDATE SET goles = partido_estadisticas_jugador.goles + 1;
                END IF;
              END LOOP;

              -- Tarjetas: entre 0 y 2 amarillas y 0 o 1 roja por partido, repartidas al azar entre ambos planteles.
              v_amarillas := floor(random() * 3)::INT;
              FOR g IN 1..v_amarillas LOOP
                es_local := random() < 0.5;
                SELECT jugador_id INTO v_jugador_tarjeta FROM tmp_fichajes
                  WHERE club_id = (CASE WHEN es_local THEN home ELSE away END) AND subcategoria_id = sub_rec.subcategoria_id
                  OFFSET floor(random() * 10) LIMIT 1;
                IF v_jugador_tarjeta IS NOT NULL THEN
                  INSERT INTO partido_estadisticas_jugador (partido_id, jugador_id, equipo_torneo_id, tarjetas_amarillas)
                  VALUES (v_partido_id, v_jugador_tarjeta, (CASE WHEN es_local THEN equipo_local ELSE equipo_visitante END), 1)
                  ON CONFLICT (partido_id, jugador_id) DO UPDATE SET tarjetas_amarillas = partido_estadisticas_jugador.tarjetas_amarillas + 1;
                END IF;
              END LOOP;

              IF random() < 0.08 THEN -- ~8% de los partidos tiene una roja
                es_local := random() < 0.5;
                SELECT jugador_id INTO v_jugador_tarjeta FROM tmp_fichajes
                  WHERE club_id = (CASE WHEN es_local THEN home ELSE away END) AND subcategoria_id = sub_rec.subcategoria_id
                  OFFSET floor(random() * 10) LIMIT 1;
                IF v_jugador_tarjeta IS NOT NULL THEN
                  INSERT INTO partido_estadisticas_jugador (partido_id, jugador_id, equipo_torneo_id, tarjetas_rojas)
                  VALUES (v_partido_id, v_jugador_tarjeta, (CASE WHEN es_local THEN equipo_local ELSE equipo_visitante END), 1)
                  ON CONFLICT (partido_id, jugador_id) DO UPDATE SET tarjetas_rojas = partido_estadisticas_jugador.tarjetas_rojas + 1;
                END IF;
              END IF;

            END LOOP;
          END IF;
        END LOOP;

        -- Rotación método del círculo: la posición 1 queda fija, el resto rota.
        fijo := arr[1];
        arr := array[fijo] || arr[n] || arr[2:n-1];
      END LOOP;
    END LOOP;

  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8. Tabla de posiciones (apertura / clausura / general) calculada a partir
--    de los resultados reales cargados arriba — mismo criterio que
--    src/utils/tablaPosiciones.js (puntos según torneos.sistema_puntaje).
-- ----------------------------------------------------------------------------
INSERT INTO tabla_posiciones (torneo_id, categoria_id, equipo_torneo_id, ronda, partidos_jugados, ganados, empatados, perdidos, a_favor, en_contra, diferencia, puntos, actualizado_at)
WITH resultados AS (
  SELECT equipo_local_id AS equipo_id, categoria_id, ronda, resultado_local AS gf, resultado_visitante AS gc,
         CASE WHEN resultado_local > resultado_visitante THEN 'G' WHEN resultado_local < resultado_visitante THEN 'P' ELSE 'E' END AS resu
  FROM partidos WHERE torneo_id = (SELECT id FROM tmp_torneo) AND estado = 'jugado'
  UNION ALL
  SELECT equipo_visitante_id, categoria_id, ronda, resultado_visitante, resultado_local,
         CASE WHEN resultado_visitante > resultado_local THEN 'G' WHEN resultado_visitante < resultado_local THEN 'P' ELSE 'E' END
  FROM partidos WHERE torneo_id = (SELECT id FROM tmp_torneo) AND estado = 'jugado'
)
SELECT (SELECT id FROM tmp_torneo), categoria_id, equipo_id, ronda,
       COUNT(*)::INT,
       COUNT(*) FILTER (WHERE resu = 'G')::INT,
       COUNT(*) FILTER (WHERE resu = 'E')::INT,
       COUNT(*) FILTER (WHERE resu = 'P')::INT,
       SUM(gf)::INT, SUM(gc)::INT, (SUM(gf) - SUM(gc))::INT,
       (COUNT(*) FILTER (WHERE resu = 'G') * 3 + COUNT(*) FILTER (WHERE resu = 'E') * 1)::INT,
       NOW()
FROM resultados
GROUP BY categoria_id, equipo_id, ronda;

INSERT INTO tabla_posiciones (torneo_id, categoria_id, equipo_torneo_id, ronda, partidos_jugados, ganados, empatados, perdidos, a_favor, en_contra, diferencia, puntos, actualizado_at)
WITH resultados AS (
  SELECT equipo_local_id AS equipo_id, categoria_id, resultado_local AS gf, resultado_visitante AS gc,
         CASE WHEN resultado_local > resultado_visitante THEN 'G' WHEN resultado_local < resultado_visitante THEN 'P' ELSE 'E' END AS resu
  FROM partidos WHERE torneo_id = (SELECT id FROM tmp_torneo) AND estado = 'jugado'
  UNION ALL
  SELECT equipo_visitante_id, categoria_id, resultado_visitante, resultado_local,
         CASE WHEN resultado_visitante > resultado_local THEN 'G' WHEN resultado_visitante < resultado_local THEN 'P' ELSE 'E' END
  FROM partidos WHERE torneo_id = (SELECT id FROM tmp_torneo) AND estado = 'jugado'
)
SELECT (SELECT id FROM tmp_torneo), categoria_id, equipo_id, 'general',
       COUNT(*)::INT,
       COUNT(*) FILTER (WHERE resu = 'G')::INT,
       COUNT(*) FILTER (WHERE resu = 'E')::INT,
       COUNT(*) FILTER (WHERE resu = 'P')::INT,
       SUM(gf)::INT, SUM(gc)::INT, (SUM(gf) - SUM(gc))::INT,
       (COUNT(*) FILTER (WHERE resu = 'G') * 3 + COUNT(*) FILTER (WHERE resu = 'E') * 1)::INT,
       NOW()
FROM resultados
GROUP BY categoria_id, equipo_id;

-- ----------------------------------------------------------------------------
-- Resumen final (se muestra al correr el script en DBeaver)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM tmp_divisiones) AS zonas,
  (SELECT COUNT(*) FROM tmp_subcategorias) AS categorias,
  (SELECT COUNT(*) FROM tmp_club_division) AS clubes_asignados,
  (SELECT COUNT(*) FROM tmp_equipos) AS equipos_torneo,
  (SELECT COUNT(*) FROM partidos p WHERE p.torneo_id = (SELECT id FROM tmp_torneo)) AS partidos_generados,
  (SELECT COUNT(*) FROM partidos p WHERE p.torneo_id = (SELECT id FROM tmp_torneo) AND p.estado = 'jugado') AS partidos_jugados,
  (SELECT COUNT(*) FROM tmp_fichajes) AS fichajes_generados,
  (SELECT COUNT(*) FROM partido_estadisticas_jugador pe JOIN partidos p ON p.id = pe.partido_id WHERE p.torneo_id = (SELECT id FROM tmp_torneo)) AS filas_estadisticas,
  (SELECT COUNT(*) FROM tabla_posiciones tp WHERE tp.torneo_id = (SELECT id FROM tmp_torneo)) AS filas_tabla_posiciones;

COMMIT;
-- Si preferís deshacer todo en vez de confirmar, ejecutá ROLLBACK; en lugar de la línea COMMIT; de arriba.
