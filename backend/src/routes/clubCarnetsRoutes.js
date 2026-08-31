const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).
//
// Escaneo de carnets desde el lado CLUB, para el día de partido: el local
// escanea los carnets del visitante y viceversa (no hace falta que sea
// justo así -- cualquier club puede validar cualquier otro dentro de una
// Liga en la que participe). A diferencia de "Validar carnet" del lado
// Liga/Autoridad (que ya sabe en qué Liga está por el token), acá el club
// puede jugar en VARIAS Ligas -- por eso primero elige Torneo/División/
// Categoría (de sus propios torneos, ver GET /club/torneos) y DESPUÉS el
// Club rival cuyo jugador va a escanear (ver GET /rivales), no importa el
// partido puntual (decisión del roadmap).
//
// El Torneo indicado ya define la Liga (t.liga_id) -- no hace falta pedir
// liga_id aparte. Igual que en Liga/Autoridad, la respuesta es sólo
// habilitado/no-habilitado + nombre y foto (NO expone el código QR ni el
// resto del carnet).

// GET /club/carnets/rivales?torneo_id=&categoria_id=&subcategoria_id= —
// clubes con equipo activo en esa División/Categoría, para elegir de quién
// se va a escanear el carnet.
router.get('/rivales', async (req, res) => {
  const { torneo_id, categoria_id, subcategoria_id } = req.query;
  if (!torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan torneo_id y/o categoria_id' });
  }
  try {
    const torneoResult = await query('SELECT liga_id FROM torneos WHERE id = $1', [torneo_id]);
    if (!torneoResult.rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    const ligaId = torneoResult.rows[0].liga_id;

    const clubEnLiga = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2 AND activo = TRUE',
      [req.clubId, ligaId]
    );
    if (!clubEnLiga.rows[0]) {
      return res.status(403).json({ ok: false, error: 'Tu club no participa en la Liga de ese torneo' });
    }

    const { rows } = await query(
      `SELECT DISTINCT c.id, c.nombre, c.logo_url
       FROM equipos_torneo et
       JOIN clubes c ON c.id = et.club_id
       WHERE et.torneo_id = $1 AND et.categoria_id = $2
         AND et.subcategoria_id IS NOT DISTINCT FROM $3::uuid
         AND et.activo = TRUE
       ORDER BY c.nombre ASC`,
      [torneo_id, categoria_id, subcategoria_id || null]
    );
    res.json({ ok: true, clubes: rows });
  } catch (err) {
    console.error('Error en GET /club/carnets/rivales:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /club/carnets/validar/:codigoQr?club_id=&torneo_id=&categoria_id=&subcategoria_id=
// Devuelve si el jugador está HABILITADO para jugar en esa División/
// Categoría del Club elegido -- igual criterio que la validación del lado
// Liga (fichaje aprobado, carnet vigente, no sancionado, Torneo/División/
// Categoría coincidentes), sumando que el carnet escaneado sea justo del
// Club que se eligió antes de escanear.
router.get('/validar/:codigoQr', async (req, res) => {
  const { club_id, torneo_id, categoria_id, subcategoria_id } = req.query;
  if (!club_id || !torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan club_id, torneo_id y/o categoria_id (elegí Club, Torneo y División antes de escanear)' });
  }
  try {
    const torneoResult = await query('SELECT liga_id FROM torneos WHERE id = $1', [torneo_id]);
    if (!torneoResult.rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado' });
    const ligaId = torneoResult.rows[0].liga_id;

    const clubEnLiga = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2 AND activo = TRUE',
      [req.clubId, ligaId]
    );
    if (!clubEnLiga.rows[0]) {
      return res.status(403).json({ ok: false, error: 'Tu club no participa en la Liga de ese torneo' });
    }

    const { rows } = await query(
      `SELECT car.id, car.activo, car.vigente_hasta,
              f.estado AS fichaje_estado, f.torneo_id AS fichaje_torneo_id,
              f.categoria_id AS fichaje_categoria_id, f.subcategoria_id AS fichaje_subcategoria_id,
              f.club_id AS fichaje_club_id,
              f.sancionado AS fichaje_sancionado, f.sancionado_motivo AS fichaje_sancionado_motivo,
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
    if (!carnet || carnet.liga_id !== ligaId) {
      return res.status(404).json({ ok: false, error: 'Carnet no encontrado' });
    }

    const vigente = carnet.activo && (!carnet.vigente_hasta || new Date(carnet.vigente_hasta) >= new Date());
    const fichajeAprobado = carnet.fichaje_estado === 'aprobado';
    const coincideClub = carnet.fichaje_club_id === club_id;
    const coincideTorneo = carnet.fichaje_torneo_id === torneo_id;
    const coincideCategoria = carnet.fichaje_categoria_id === categoria_id;
    const coincideSubcategoria = !subcategoria_id || carnet.fichaje_subcategoria_id === subcategoria_id;

    let motivo = null;
    if (carnet.fichaje_sancionado) motivo = carnet.fichaje_sancionado_motivo ? `Jugador sancionado: ${carnet.fichaje_sancionado_motivo}` : 'Jugador sancionado';
    else if (!vigente) motivo = 'El carnet no está vigente (vencido o desactivado)';
    else if (!fichajeAprobado) motivo = 'El fichaje del jugador no está aprobado';
    else if (!coincideClub) motivo = 'Este carnet pertenece a otro club, no al que elegiste';
    else if (!coincideTorneo || !coincideCategoria || !coincideSubcategoria) {
      motivo = 'El jugador está fichado en otro Torneo/División/Categoría, no en el seleccionado';
    }

    const habilitado = !carnet.fichaje_sancionado && vigente && fichajeAprobado && coincideClub && coincideTorneo && coincideCategoria && coincideSubcategoria;

    res.json({
      ok: true,
      habilitado,
      motivo,
      sancionado: !!carnet.fichaje_sancionado,
      jugador: { nombre: carnet.jugador_nombre, apellido: carnet.jugador_apellido, foto_url: carnet.jugador_foto_url },
      club_nombre: carnet.club_nombre,
      torneo_nombre: carnet.torneo_nombre,
      categoria_nombre: carnet.categoria_nombre,
      subcategoria_nombre: carnet.subcategoria_nombre
    });
  } catch (err) {
    console.error('Error en GET /club/carnets/validar:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
