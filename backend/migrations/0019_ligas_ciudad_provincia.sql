-- Ciudad/Provincia para Ligas (mismo criterio que ya existe para Clubes en
-- la migración 0004): permite al Super Admin registrar dónde está radicada
-- cada Liga al darla de alta.
ALTER TABLE ligas ADD COLUMN ciudad VARCHAR(100);
ALTER TABLE ligas ADD COLUMN provincia VARCHAR(100);
