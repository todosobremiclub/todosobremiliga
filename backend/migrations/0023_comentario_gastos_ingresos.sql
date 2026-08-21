-- Campo de comentario libre para Ingresos y Gastos de la Liga (además del
-- concepto), pedido para poder aclarar detalles del movimiento.
ALTER TABLE gastos ADD COLUMN comentario TEXT;
ALTER TABLE ingresos ADD COLUMN comentario TEXT;
