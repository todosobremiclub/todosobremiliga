-- ============================================================================
-- Carga 20 jugadores de ejemplo para Atlético Ferroviario, con DNI y fecha
-- de nacimiento distinta cada uno (edades entre 16 y 35 años aprox.).
--
-- club_id: 43c3a7aa-293c-441f-b9cf-fd3037869b3e
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

INSERT INTO jugadores (club_id, nombre, apellido, dni, fecha_nacimiento, posicion, numero_camiseta) VALUES
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Lucas',    'Gómez',      '38452110', '2005-03-14', 'Arquero',    1),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Mateo',    'Fernández',  '37891245', '2006-07-22', 'Defensor',   2),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Facundo',  'López',      '36774102', '2007-11-05', 'Defensor',   3),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Nicolás',  'Martínez',   '35998876', '1999-01-30', 'Defensor',   4),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Tomás',    'Rodríguez',  '39112233', '2003-05-18', 'Defensor',   5),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Agustín',  'García',     '37564321', '2000-09-09', 'Volante',    6),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Franco',   'Sánchez',    '38221199', '2004-12-25', 'Volante',    7),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Joaquín',  'Romero',     '36887654', '1998-04-11', 'Volante',    8),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Ignacio',  'Torres',     '39445566', '2002-08-27', 'Volante',    9),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Santiago', 'Flores',     '37332211', '2001-02-14', 'Delantero',  10),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Bruno',    'Díaz',       '38667788', '2006-06-03', 'Delantero',  11),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Valentín', 'Acosta',     '36112987', '1997-10-19', 'Delantero',  12),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Emiliano', 'Molina',     '39887123', '2005-01-08', 'Arquero',    13),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Gonzalo',  'Herrera',    '37778890', '2003-11-29', 'Defensor',   14),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Federico', 'Ruiz',       '38221876', '1999-07-16', 'Volante',    15),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Damián',   'Ortiz',      '36998765', '2000-03-22', 'Delantero',  16),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Alan',     'Silva',      '39556677', '2007-05-10', 'Defensor',   17),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Ezequiel', 'Núñez',      '37445123', '1998-12-01', 'Volante',    18),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Ramiro',   'Castro',     '38112456', '2004-09-27', 'Delantero',  19),
  ('43c3a7aa-293c-441f-b9cf-fd3037869b3e', 'Maximiliano', 'Ríos',    '36776554', '2002-04-05', 'Defensor',   20);

-- Chequeo final
SELECT COUNT(*) AS jugadores_cargados FROM jugadores WHERE club_id = '43c3a7aa-293c-441f-b9cf-fd3037869b3e';

COMMIT;
