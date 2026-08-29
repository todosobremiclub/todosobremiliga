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

// GET /liga/carnets/validar/:codigoQr?torneo_id=..&categoria_id=..&subcategoria_id=..
// Para usar el día de partido: la Liga (o Autoridad, más adelante) elige
// primero el Torneo, la División y la Categoría en la que se está jugando, y
// después escanea el carnet. Devuelve si el jugador está HABILITADO para
// jugar ESE partido puntual (no solo si el carnet es válido en general).
router.get('/validar/:codigoQr', async (req, res) => {
  const { torneo_id, categoria_id, subcategoria_id } = req.query;
  if (!torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan torneo_id y categoria_id (elegí Torneo y División antes de escanear)' });
  }
  try {
    const { rows } = await query(
      `SELECT car.id, car.activo, car.vigente_hasta,
              f.estado AS fichaje_estado, f.torneo_id AS fichaje_torneo_id,
              f.categoria_id AS fichaje_categoria_id, f.subcategoria_id AS fichaje_subcategoria_id,
              j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.foto_url AS jugador_foto_url,
              c.nombre AS club_nombre, t.liga_id, t.nombre AS torneo_nombre,
              cat.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre
       FROM carnets car
       JOIN fichajes f ON f.id = car.fichaje_id
       JOIN jugadores j ON j.id = car.jugador_id
       JOIN clubes c ON c.id = j.club_id
       JOIN torneos t ON t.id = car.torneo_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sc ON sc.id = f.subcategoria_id
       WHERE car.codigo_qr = $1`,
      [req.params.codigoQr]
    );
    const carnet = rows[0];
    if (!carnet || carnet.liga_id !== req.ligaId) {
      return res.status(404).json({ ok: false, error: 'Carnet no encontrado' });
    }

    const vigente = carnet.activo && (!carnet.vigente_hasta || new Date(carnet.vigente_hasta) >= new Date());
    const fichajeAprobado = carnet.fichaje_estado === 'aprobado';
    const coincideTorneo = carnet.fichaje_torneo_id === torneo_id;
    const coincideCategoria = carnet.fichaje_categoria_id === categoria_id;
    const coincideSubcategoria = !subcategoria_id || carnet.fichaje_subcategoria_id === subcategoria_id;

    let motivo = null;
    if (!vigente) motivo = 'El carnet no está vigente (vencido o desactivado)';
    else if (!fichajeAprobado) motivo = 'El fichaje del jugador no está aprobado';
    else if (!coincideTorneo || !coincideCategoria || !coincideSubcategoria) {
      motivo = 'El jugador está fichado en otro Torneo/División/Categoría, no en el seleccionado';
    }

    const habilitado = vigente && fichajeAprobado && coincideTorneo && coincideCategoria && coincideSubcategoria;

    res.json({
      ok: true,
      habilitado,
      motivo,
      jugador: { nombre: carnet.jugador_nombre, apellido: carnet.jugador_apellido, foto_url: carnet.jugador_foto_url },
      club_nombre: carnet.club_nombre,
      torneo_nombre: carnet.torneo_nombre,
      categoria_nombre: carnet.categoria_nombre,
      subcategoria_nombre: carnet.subcategoria_nombre
    });
  } catch (err) {
    console.error('Error en GET validar carnet:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
