-- Dos configuraciones nuevas por Liga, cargadas desde el Panel Super Admin:
--
-- 1) max_clubes: tope de clubes que esa Liga puede tener cargados. NULL
--    significa "sin límite" (así no rompemos ninguna Liga ya cargada, todas
--    quedan sin límite hasta que el Super Admin le ponga uno a propósito).
--    El backend valida esto al agregar un club a una Liga (alta nueva,
--    vincular uno existente, aceptar postulación, carga masiva) -- los
--    clubes que ya estaban cargados NO se tocan si después se baja el
--    límite por debajo de la cantidad actual, sólo se bloquean los nuevos.
--
-- 2) permite_usuarios_club: si es FALSE, esa Liga no puede crear usuarios
--    club_admin para sus clubes (POST /liga/clubes/:clubId/usuarios). El
--    resto del módulo Clubes sigue funcionando igual -- sólo se bloquea la
--    creación de ese usuario de acceso puntual.
ALTER TABLE ligas
  ADD COLUMN max_clubes INTEGER,
  ADD COLUMN permite_usuarios_club BOOLEAN NOT NULL DEFAULT TRUE;
