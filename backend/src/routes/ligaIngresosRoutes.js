const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/ingresos — listado (opcionalmente filtrado por rango de fechas)
router.get('/', async (req, res) => {
  const { desde, hasta } = req.query;
  try {
    const { rows } = await query(
      `SELECT i.*, c.nombre AS club_nombre
       FROM ingresos i
       LEFT JOIN clubes c ON c.id = i.club_id
       WHERE i.liga_id = $1
         AND ($2::date IS NULL OR i.fecha >= $2)
         AND ($3::date IS NULL OR i.fecha <= $3)
       ORDER BY i.fecha DESC, i.creado_at DESC`,
      [req.ligaId, desde || null, hasta || null]
    );
    res.json({ ok: true, ingresos: rows });
  } catch (err) {
    console.error('Error en GET /liga/ingresos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/ingresos — registrar un ingreso (ej. cuota de afiliación de un club)
router.post('/', async (req, res) => {
  const { concepto, categoria, monto, fecha, comprobante_url, club_id } = req.body;

  if (!concepto || !concepto.trim() || monto == null) {
    return res.status(400).json({ ok: false, error: 'Faltan concepto y/o monto' });
  }
  if (isNaN(Number(monto)) || Number(monto) <= 0) {
    return res.status(400).json({ ok: false, error: 'El monto tiene que ser un número mayor a 0' });
  }

  try {
    if (club_id) {
      const clubEnMiLiga = await query(
        'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
        [club_id, req.ligaId]
      );
      if (!clubEnMiLiga.rows[0]) {
        return res.status(404).json({ ok: false, error: 'Ese club no participa en tu Liga' });
      }
    }

    const { rows } = await query(
      `INSERT INTO ingresos (liga_id, club_id, concepto, categoria, monto, fecha, comprobante_url, creado_por)
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, CURRENT_DATE), $7, $8)
       RETURNING *`,
      [req.ligaId, club_id || null, concepto.trim(), categoria || null, monto,
       fecha || null, comprobante_url || null, req.usuario.id]
    );
    res.status(201).json({ ok: true, ingreso: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/ingresos:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/ingresos/:ingresoId — borrar un registro
router.delete('/:ingresoId', async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM ingresos WHERE id = $1 AND liga_id = $2 RETURNING id',
      [req.params.ingresoId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Ingreso no encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/ingresos/:ingresoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
