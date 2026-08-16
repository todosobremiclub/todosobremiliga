const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/agenda — eventos de mi Liga (ordenados por fecha)
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM agenda_eventos WHERE liga_id = $1 ORDER BY fecha ASC, hora ASC NULLS LAST',
      [req.ligaId]
    );
    res.json({ ok: true, eventos: rows });
  } catch (err) {
    console.error('Error en GET /liga/agenda:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/agenda — crear un evento
router.post('/', async (req, res) => {
  const { titulo, descripcion, fecha, hora, lugar, tipo } = req.body;
  const tiposValidos = ['reunion', 'capacitacion', 'evento', 'partido', 'otro'];

  if (!titulo || !titulo.trim() || !fecha) {
    return res.status(400).json({ ok: false, error: 'Faltan título y/o fecha' });
  }
  if (tipo && !tiposValidos.includes(tipo)) {
    return res.status(400).json({ ok: false, error: `Tipo inválido. Válidos: ${tiposValidos.join(', ')}` });
  }

  try {
    const { rows } = await query(
      `INSERT INTO agenda_eventos (liga_id, titulo, descripcion, fecha, hora, lugar, tipo)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'evento'))
       RETURNING *`,
      [req.ligaId, titulo.trim(), descripcion || null, fecha, hora || null, lugar || null, tipo || null]
    );
    res.status(201).json({ ok: true, evento: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/agenda:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/agenda/:eventoId — borrar un evento
router.delete('/:eventoId', async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM agenda_eventos WHERE id = $1 AND liga_id = $2 RETURNING id',
      [req.params.eventoId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Evento no encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/agenda/:eventoId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
