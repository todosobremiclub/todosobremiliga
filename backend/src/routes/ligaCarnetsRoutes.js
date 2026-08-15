const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).

// GET /liga/carnets/verificar/:codigoQr — para usar el día de partido: se
// escanea/tipea el código del carnet y se ve si es válido y de quién es.
router.get('/verificar/:codigoQr', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT car.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.foto_url AS jugador_foto_url,
              c.nombre AS club_nombre, t.nombre AS torneo_nombre, t.liga_id
       FROM carnets car
       JOIN jugadores j ON j.id = car.jugador_id
       JOIN clubes c ON c.id = j.club_id
       JOIN torneos t ON t.id = car.torneo_id
       WHERE car.codigo_qr = $1`,
      [req.params.codigoQr]
    );
    const carnet = rows[0];
    if (!carnet || carnet.liga_id !== req.ligaId) {
      return res.status(404).json({ ok: false, error: 'Carnet no encontrado' });
    }
    const vigente = carnet.activo && (!carnet.vigente_hasta || new Date(carnet.vigente_hasta) >= new Date());
    res.json({ ok: true, carnet, vigente });
  } catch (err) {
    console.error('Error en GET verificar carnet:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
