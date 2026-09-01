const express = require('express');
const router = express.Router();

const { query, getClient } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).
// Estas son las postulaciones de Clubes que llegaron por el formulario
// público (QR o link) y que la Liga tiene que Aceptar o Rechazar.

// GET /liga/postulaciones?estado=pendiente
router.get('/', async (req, res) => {
  const { estado } = req.query;
  try {
    const params = [req.ligaId];
    let filtroEstado = '';
    if (estado) {
      params.push(estado);
      filtroEstado = ` AND estado = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT * FROM postulaciones_club WHERE liga_id = $1${filtroEstado} ORDER BY creado_at DESC`,
      params
    );
    res.json({ ok: true, postulaciones: rows });
  } catch (err) {
    console.error('Error en GET /liga/postulaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/postulaciones/:id/aceptar — crea el Club real + su membresía
// en MI liga, a partir de los datos de la postulación.
router.patch('/:id/aceptar', async (req, res) => {
  const client = await getClient();
  try {
    const postulacionResult = await client.query(
      'SELECT * FROM postulaciones_club WHERE id = $1 AND liga_id = $2',
      [req.params.id, req.ligaId]
    );
    const postulacion = postulacionResult.rows[0];
    if (!postulacion) {
      client.release();
      return res.status(404).json({ ok: false, error: 'Postulación no encontrada en tu Liga' });
    }
    if (postulacion.estado !== 'pendiente') {
      client.release();
      return res.status(409).json({ ok: false, error: 'Esta postulación ya fue resuelta' });
    }

    const yaExiste = await client.query(
      `SELECT 1 FROM club_liga cl JOIN clubes c ON c.id = cl.club_id
       WHERE cl.liga_id = $1 AND LOWER(TRIM(c.nombre)) = LOWER(TRIM($2)) LIMIT 1`,
      [req.ligaId, postulacion.nombre]
    );
    if (yaExiste.rows[0]) {
      client.release();
      return res.status(409).json({
        ok: false,
        error: `Ya existe un club llamado "${postulacion.nombre}" en tu Liga. Rechazá la postulación o pedile al club que se postule con otro nombre.`
      });
    }

    // Aceptar una postulación también suma un club a la Liga -- respeta el
    // mismo máximo que el alta manual o la carga masiva (ver decisión del
    // roadmap). La postulación queda pendiente: el Super Admin/Liga puede
    // subir el límite y aceptarla después.
    const ligaResult = await client.query('SELECT max_clubes FROM ligas WHERE id = $1', [req.ligaId]);
    const maxClubes = ligaResult.rows[0]?.max_clubes;
    if (maxClubes !== null && maxClubes !== undefined) {
      const cantidadResult = await client.query('SELECT COUNT(*)::int AS cantidad FROM club_liga WHERE liga_id = $1', [req.ligaId]);
      if (cantidadResult.rows[0].cantidad >= maxClubes) {
        client.release();
        return res.status(409).json({
          ok: false,
          error: 'Tu Liga ya llegó al máximo de clubes permitido -- no se puede aceptar esta postulación hasta que subas el límite o des de baja algún club.'
        });
      }
    }

    await client.query('BEGIN');
    const clubResult = await client.query(
      `INSERT INTO clubes (nombre, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario, cuit, ciudad, provincia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [postulacion.nombre, postulacion.logo_url, postulacion.direccion, postulacion.telefono,
       postulacion.email_contacto, postulacion.color_primario, postulacion.color_secundario,
       postulacion.cuit, postulacion.ciudad, postulacion.provincia]
    );
    const club = clubResult.rows[0];
    await client.query('INSERT INTO club_liga (liga_id, club_id) VALUES ($1, $2)', [req.ligaId, club.id]);
    await client.query(
      `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, piso, es_principal, orden)
       VALUES ($1, 'Cancha principal', $2, $3, $4, TRUE, 0)`,
      [club.id, (postulacion.cancha_tipo_techo === 'techada' ? 'techada' : 'aire_libre'),
       postulacion.cancha_tamanio || null, postulacion.cancha_piso || null]
    );
    await client.query(
      `UPDATE postulaciones_club SET estado = 'aceptada', club_id_creado = $1, resuelto_at = NOW() WHERE id = $2`,
      [club.id, req.params.id]
    );
    await client.query('COMMIT');

    res.json({ ok: true, club });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en PATCH aceptar postulacion:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PATCH /liga/postulaciones/:id/rechazar
router.patch('/:id/rechazar', async (req, res) => {
  const { motivo_rechazo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE postulaciones_club SET estado = 'rechazada', motivo_rechazo = $1, resuelto_at = NOW()
       WHERE id = $2 AND liga_id = $3 AND estado = 'pendiente'
       RETURNING *`,
      [motivo_rechazo || null, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Postulación no encontrada o ya resuelta' });
    res.json({ ok: true, postulacion: rows[0] });
  } catch (err) {
    console.error('Error en PATCH rechazar postulacion:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
