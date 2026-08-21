-- Incomparecencia ("no se presentó") de un equipo a un partido.
--
-- goles_walkover_ganador/perdedor en `torneos`: resultado con el que se
-- carga automáticamente un partido cuando UN solo equipo no se presenta
-- (ej: 3 a 0 en fútbol, 2 a 0 en futsal/handball) — configurable por
-- torneo al crearlo o editarlo. Si los DOS equipos no se presentan, el
-- partido no usa este resultado: ambos quedan directamente como perdedores
-- (0 puntos cada uno) sin que se compare ningún marcador.
ALTER TABLE torneos ADD COLUMN goles_walkover_ganador INT NOT NULL DEFAULT 3;
ALTER TABLE torneos ADD COLUMN goles_walkover_perdedor INT NOT NULL DEFAULT 0;

-- Marca, en el partido puntual, si el equipo local y/o visitante no se
-- presentaron. Se completa desde el mismo formulario de carga de resultado.
ALTER TABLE partidos ADD COLUMN no_presento_local BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE partidos ADD COLUMN no_presento_visitante BOOLEAN NOT NULL DEFAULT FALSE;
