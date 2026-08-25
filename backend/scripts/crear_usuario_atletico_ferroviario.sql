-- ============================================================================
-- Crea el usuario "club_admin" para Atlético Ferroviario (para que puedan
-- entrar a su Panel Club: cargar jugadores, pedir fichajes, ver carnets).
--
-- OJO: esto mismo ya se puede hacer sin tocar la base — en el Panel Liga,
-- en la fila del club, el ícono de "persona" (al lado del lápiz y el trofeo)
-- abre "Usuarios del club" y te deja crear uno desde ahí con contraseña
-- propia. Este script es la vía rápida para no tener que hacerlo a mano.
--
-- Credenciales generadas:
--   Email:      atleticoferroviario@tsmc.com.ar
--   Contraseña: Ferroviario2026
-- Recomiendo avisarle al club que la cambie la primera vez que entra (desde
-- "Usuarios del club" en el Panel Liga se puede resetear la contraseña
-- cuando quieran).
--
-- club_id: 43c3a7aa-293c-441f-b9cf-fd3037869b3e
--
-- CÓMO USARLO EN DBEAVER: ejecutar todo de una sola vez (incluye
-- BEGIN/COMMIT). Podés cambiar COMMIT; por ROLLBACK; si querés deshacerlo.
-- ============================================================================

BEGIN;

INSERT INTO usuarios (email, password_hash, nombre, rol, club_id, activo)
VALUES (
  'atleticoferroviario@tsmc.com.ar',
  '$2b$10$tCzIwH.p3gBIcKEslxkzkuEjRRQv4ALHhOcfVK3X7brPYChXYTDZa', -- hash bcrypt de "Ferroviario2026"
  'Atlético Ferroviario',
  'club_admin',
  '43c3a7aa-293c-441f-b9cf-fd3037869b3e',
  TRUE
);

-- Chequeo final
SELECT id, email, nombre, rol, club_id, activo FROM usuarios WHERE club_id = '43c3a7aa-293c-441f-b9cf-fd3037869b3e';

COMMIT;
