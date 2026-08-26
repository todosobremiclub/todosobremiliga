-- ============================================================================
-- SUPER LIGA — prueba de carga a gran escala
--
-- Estructura (dentro de la Liga TSMC, sin crear una Liga nueva):
--   Torneo "Super Liga"
--     └── 26 Categorías ("Divisiones") "División A" a "División Z"
--           └── 7 Subcategorías por División: años 2013 a 2019
--
-- Cada División tiene su PROPIA tabla general (suma de puntos de sus 7
-- subcategorías/años), sin mezclarse con las otras 25 Divisiones — para eso
-- se agregó el endpoint GET /web/torneos/:torneoId/categorias/:categoriaId/
-- tabla-general (ver src/routes/webRoutes.js), y todas las subcategorías
-- quedan con suma_tabla_general = TRUE.
--
-- Además:
--   - Formato Apertura y Clausura (localía invertida) para todo el torneo.
--   - Se juega en la cancha principal de cada club (cancha_juego = 'clubes').
--   - Fixture automático (round-robin, método del círculo) por División,
--     aplicado a las 7 subcategorías: jornada 1 el 01/08/2026 y +7 días por
--     jornada, misma fecha para todos los partidos de esa jornada.
--   - Los 200 clubes de prueba ya existentes (alta_masiva_200_clubes.sql, ya
--     socios de TSMC) se reparten al azar entre las 26 Divisiones (18
--     divisiones de 8 clubes + 8 divisiones de 7 clubes = 200), y cada club
--     juega las 7 subcategorías (años) de su División.
--   - 4000 fichajes distintos (con su jugador asociado), asignados al azar a
--     un club y a una subcategoría (año) de la División de ese club.
--
-- Requiere que ya exista la Liga TSMC con sus 200 clubes de prueba
-- (scripts/alta_masiva_200_clubes.sql), liga_id 6bef5bc5-a262-451f-b565-d1cb8b4bb65a.
--
-- Si antes llegaste a correr una versión vieja de este script (Super Liga
-- como Liga aparte, o como 26 Torneos separados), corré primero
-- scripts/revertir_super_liga.sql para deshacerla.
--
-- Envuelto en BEGIN/COMMIT: si algo sale mal, ejecutar ROLLBACK; en vez de
-- COMMIT; y no queda nada a medio cargar.
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
-- 1. Torneo único "Super Liga", dentro de TSMC
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_torneo AS SELECT gen_random_uuid() AS id;

INSERT INTO torneos (id, liga_id, nombre, deporte, temporada, formato_juego, sistema_puntaje, cancha_juego, fecha_inicio, estado, slug)
SELECT t.id, l.id, 'Super Liga', 'futbol', '2026', 'apertura_clausura',
       '{"victoria":3,"empate":1,"derrota":0}'::jsonb, 'clubes', DATE '2026-08-01', 'en_curso', 'super-liga'
FROM tmp_torneo t CROSS JOIN tmp_liga l;

-- ----------------------------------------------------------------------------
-- 2. 26 Divisiones (categorías) A-Z dentro del Torneo "Super Liga"
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_divisiones AS
SELECT gen_random_uuid() AS id, chr(64 + n) AS letra, n
FROM generate_series(1, 26) AS n;

INSERT INTO categorias (id, torneo_id, nombre, genero, edad_minima, edad_maxima, orden, suma_tabla_general)
SELECT d.id, t.id, 'División ' || d.letra, 'masculino', NULL, NULL, d.n, TRUE
FROM tmp_divisiones d CROSS JOIN tmp_torneo t;

CREATE INDEX idx_tmp_divisiones_letra ON tmp_divisiones (letra);

-- ----------------------------------------------------------------------------
-- 3. 7 Subcategorías (años 2013 a 2019) por División, todas suman a la tabla
--    general de SU División.
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
-- 4. Reparto aleatorio de los 200 clubes existentes entre las 26 Divisiones
--    (18 divisiones de 8 clubes + 8 divisiones de 7 clubes = 200)
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
-- 5. Cada club inscripto en las 7 subcategorías (años) de su División
--    (equipos_torneo, con categoria_id = división y subcategoria_id = año)
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE tmp_equipos AS
SELECT gen_random_uuid() AS id, (SELECT id FROM tmp_torneo) AS torneo_id, sc.division_id AS categoria_id, sc.id AS subcategoria_id, cd.club_id
FROM tmp_club_division cd
JOIN tmp_subcategorias sc ON sc.division_id = cd.division_id;

INSERT INTO equipos_torneo (id, torneo_id, categoria_id, subcategoria_id, club_id)
SELECT id, torneo_id, categoria_id, subcategoria_id, club_id FROM tmp_equipos;

CREATE INDEX idx_tmp_equipos_lookup ON tmp_equipos (categoria_id, subcategoria_id, club_id);

-- Tabla de posiciones en cero para todos los equipos, en las 3 rondas, para
-- que las tablas (individual, apertura, clausura y general) muestren a todos
-- los equipos desde el arranque aunque todavía no haya resultados cargados.
INSERT INTO tabla_posiciones (torneo_id, categoria_id, equipo_torneo_id, ronda)
SELECT torneo_id, categoria_id, id, ronda
FROM tmp_equipos CROSS JOIN (VALUES ('general'), ('apertura'), ('clausura')) AS r(ronda);

-- ----------------------------------------------------------------------------
-- 6. Fixture automático: round-robin (método del círculo) por División,
--    Apertura + Clausura (localía invertida), aplicado a las 7 subcategorías
--    (años). Jornada 1 = 01/08/2026, +7 días cada jornada siguiente (continuo
--    entre Apertura y Clausura), misma fecha para todos los partidos de la
--    jornada.
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

              INSERT INTO partidos (id, torneo_id, categoria_id, equipo_local_id, equipo_visitante_id, fecha, hora, jornada, ronda, cancha_club_id, estado)
              VALUES (gen_random_uuid(), (SELECT id FROM tmp_torneo), div_rec.division_id, equipo_local, equipo_visitante,
                      fecha_partido, hora_partido, jornada_actual, CASE WHEN fase = 1 THEN 'apertura' ELSE 'clausura' END,
                      cancha_local, 'programado');
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
-- 7. 4000 fichajes distintos, cada uno con su jugador, asignados al azar a un
--    club (de los 200) y a una subcategoría (año) de la División de ese club.
-- ----------------------------------------------------------------------------
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
  estados TEXT[] := ARRAY['aprobado','aprobado','aprobado','pendiente','pendiente','rechazado'];
  v_division_id UUID;
  v_subcategoria_id UUID;
  v_anio INT;
  v_jugador_id UUID;
  v_club_id UUID;
  nombre_j TEXT;
  apellido_j TEXT;
  dni_j TEXT;
  nacimiento DATE;
  estado_f TEXT;
  fecha_solicitud TIMESTAMPTZ;
  k INT;
BEGIN
  FOR k IN 1..4000 LOOP
    SELECT cd.club_id, cd.division_id INTO v_club_id, v_division_id
    FROM tmp_club_division cd
    OFFSET floor(random() * 200) LIMIT 1;

    SELECT sc.id, sc.anio INTO v_subcategoria_id, v_anio
    FROM tmp_subcategorias sc
    WHERE sc.division_id = v_division_id
    OFFSET floor(random() * 7) LIMIT 1;

    nombre_j := nombres[1 + floor(random() * array_length(nombres, 1))::INT];
    apellido_j := apellidos[1 + floor(random() * array_length(apellidos, 1))::INT];
    dni_j := (30000000 + k * 137 + floor(random() * 100))::TEXT;
    nacimiento := make_date(v_anio, 1 + floor(random() * 12)::INT, 1 + floor(random() * 28)::INT);
    estado_f := estados[1 + floor(random() * array_length(estados, 1))::INT];
    fecha_solicitud := TIMESTAMPTZ '2026-06-01 09:00:00' + (floor(random() * 60) || ' days')::INTERVAL;

    INSERT INTO jugadores (id, club_id, nombre, apellido, dni, fecha_nacimiento, activo)
    VALUES (gen_random_uuid(), v_club_id, nombre_j, apellido_j, dni_j, nacimiento, TRUE)
    RETURNING id INTO v_jugador_id;

    INSERT INTO fichajes (id, jugador_id, club_id, liga_id, torneo_id, categoria_id, subcategoria_id, estado, fecha_solicitud, fecha_resolucion)
    VALUES (gen_random_uuid(), v_jugador_id, v_club_id, (SELECT id FROM tmp_liga), (SELECT id FROM tmp_torneo), v_division_id, v_subcategoria_id, estado_f,
            fecha_solicitud, CASE WHEN estado_f <> 'pendiente' THEN fecha_solicitud + INTERVAL '2 days' ELSE NULL END);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Resumen final (se muestra al correr el script en DBeaver)
-- ----------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM tmp_divisiones) AS divisiones,
  (SELECT COUNT(*) FROM tmp_subcategorias) AS subcategorias,
  (SELECT COUNT(*) FROM tmp_club_division) AS clubes_asignados,
  (SELECT COUNT(*) FROM tmp_equipos) AS equipos_torneo,
  (SELECT COUNT(*) FROM partidos p WHERE p.torneo_id = (SELECT id FROM tmp_torneo)) AS partidos_generados,
  (SELECT COUNT(*) FROM fichajes f WHERE f.torneo_id = (SELECT id FROM tmp_torneo)) AS fichajes_generados;

COMMIT;
-- Si preferís deshacer todo en vez de confirmar, ejecutá ROLLBACK; en lugar de la línea COMMIT; de arriba.
