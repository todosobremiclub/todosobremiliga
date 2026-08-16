const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).
// Contabilidad interna de la Liga (no de los clubes).

// GET /liga/gastos — listado (opcionalmente filtrado por rango de fechas)
router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    const { rows } = await query(
      `SELECT * FROM gastos
       WHERE liga_id = $1
         AND ($2::date IS NULL OR fecha >= $2)
         AND ($3::date IS NULL OR fecha <= $3)
       ORDER BY fecha DESC, creado_at DESC`,
      [req.ligaId, desde || null, hasta || null]
    );
    res.json({ ok: true, gastos: rows });
  } catch (err) {
    console.error('Error en GET /liga/gastos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/gastos — registrar un gasto
router.post('/', async (req, res) => {
  const { concepto, categoria, monto, fecha, comprobante_url } = req.body;

  if (!concepto || !concepto.trim() || monto == null) {
    return res.status(400).json({ ok: false, error: 'Faltan concepto y/o monto' });
  }
  if (isNaN(Number(monto)) || Number(monto) <= 0) {
    return res.status(400).json({ ok: false, error: 'El monto tiene que ser un número mayor a 0' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO gastos (liga_id, concepto, categoria, monto, fecha, comprobante_url, creado_por)
       VALUES ($1, $2, $3, $4, COALESCE($5, CURRENT_DATE), $6, $7)
       RETURNING *`,
      [req.ligaId, concepto.trim(), categoria || null, monto, fecha || null,
       comprobante_url || null, req.usuario.id]
    );
    res.status(201).json({ ok: true, gasto: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/gastos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/gastos/:gastoId — borrar un registro (ej. carga por error)
router.delete('/:gastoId', async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM gastos WHERE id = $1 AND liga_id = $2 RETURNING id',
      [req.params.gastoId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Gasto no encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/gastos/:gastoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
