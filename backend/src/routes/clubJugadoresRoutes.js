const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).

// GET /club/jugadores — jugadores registrados por MI club
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT * FROM jugadores WHERE club_id = $1 ORDER BY apellido ASC, nombre ASC',
      [req.clubId]
    );
    res.json({ ok: true, jugadores: rows });
  } catch (err) {
    console.error('Error en GET /club/jugadores:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/jugadores — alta de un jugador/socio del club
router.post('/', async (req, res) => {
  const {
    nombre, apellido, dni, fecha_nacimiento, foto_url, posicion, numero_camiseta,
    telefono, email, actividad_id, categoria_socio_id
  } = req.body;

  if (!nombre || !nombre.trim() || !apellido || !apellido.trim() || !dni || !dni.trim()) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (nombre, apellido, dni)' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO jugadores (club_id, nombre, apellido, dni, fecha_nacimiento, foto_url, posicion, numero_camiseta,
                               telefono, email, actividad_id, categoria_socio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [req.clubId, nombre.trim(), apellido.trim(), dni.trim(), fecha_nacimiento || null,
       foto_url || null, posicion || null, numero_camiseta || null,
       telefono || null, email || null, actividad_id || null, categoria_socio_id || null]
    );
    res.status(201).json({ ok: true, jugador: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un jugador con DNI ${dni} en tu club` });
    }
    console.error('Error en POST /club/jugadores:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /club/jugadores/solicitudes — solicitudes de autorregistro de socios
// (formulario público QR/link) pendientes de revisar. Se listan primero las
// pendientes; también se pueden ver las ya resueltas con ?estado=aprobado o
// ?estado=rechazado.
router.get('/solicitudes', async (req, res) => {
  const estado = ['pendiente', 'aprobado', 'rechazado'].includes(req.query.estado) ? req.query.estado : 'pendiente';
  try {
    const { rows } = await query(
      `SELECT s.*, a.nombre AS actividad_nombre, c.nombre AS categoria_socio_nombre
       FROM solicitudes_socio s
       LEFT JOIN club_actividades a ON a.id = s.actividad_id
       LEFT JOIN club_categorias_socio c ON c.id = s.categoria_socio_id
       WHERE s.club_id = $1 AND s.estado = $2
       ORDER BY s.creado_at ASC`,
      [req.clubId, estado]
    );
    res.json({ ok: true, solicitudes: rows });
  } catch (err) {
    console.error('Error en GET /club/jugadores/solicitudes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/jugadores/solicitudes/:id/aprobar — crea el jugador real a
// partir de los datos que cargó el socio, y marca la solicitud como
// aprobada (queda el vínculo al jugador creado).
router.post('/solicitudes/:id/aprobar', async (req, res) => {
  let solicitud = null;
  try {
    const solicitudResult = await query(
      `SELECT * FROM solicitudes_socio WHERE id = $1 AND club_id = $2 AND estado = 'pendiente'`,
      [req.params.id, req.clubId]
    );
    solicitud = solicitudResult.rows[0];
    if (!solicitud) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada o ya revisada' });

    const jugadorResult = await query(
      `INSERT INTO jugadores (club_id, nombre, apellido, dni, fecha_nacimiento, foto_url, telefono, email, actividad_id, categoria_socio_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [req.clubId, solicitud.nombre, solicitud.apellido, solicitud.dni, solicitud.fecha_nacimiento,
       solicitud.foto_url, solicitud.telefono, solicitud.email, solicitud.actividad_id, solicitud.categoria_socio_id]
    );
    const jugador = jugadorResult.rows[0];

    const { rows } = await query(
      `UPDATE solicitudes_socio SET estado = 'aprobado', jugador_id = $1, revisado_por = $2, revisado_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [jugador.id, req.usuario.id, req.params.id]
    );
    res.json({ ok: true, solicitud: rows[0], jugador });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un jugador con DNI ${solicitud ? solicitud.dni : ''} en tu club — revisá si ya estaba cargado y rechazá esta solicitud.` });
    }
    console.error('Error en POST /club/jugadores/solicitudes/:id/aprobar:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/jugadores/solicitudes/:id/rechazar
router.post('/solicitudes/:id/rechazar', async (req, res) => {
  const { motivo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE solicitudes_socio SET estado = 'rechazado', motivo_rechazo = $1, revisado_por = $2, revisado_at = NOW()
       WHERE id = $3 AND club_id = $4 AND estado = 'pendiente'
       RETURNING *`,
      [motivo || null, req.usuario.id, req.params.id, req.clubId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada o ya revisada' });
    res.json({ ok: true, solicitud: rows[0] });
  } catch (err) {
    console.error('Error en POST /club/jugadores/solicitudes/:id/rechazar:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /club/jugadores/:jugadorId — edición
router.put('/:jugadorId', async (req, res) => {
  const {
    nombre, apellido, dni, fecha_nacimiento, foto_url, posicion, numero_camiseta,
    telefono, email, actividad_id, categoria_socio_id
  } = req.body;

  try {
    const { rows } = await query(
      `UPDATE jugadores SET
         nombre = COALESCE($1, nombre),
         apellido = COALESCE($2, apellido),
         dni = COALESCE($3, dni),
         fecha_nacimiento = COALESCE($4, fecha_nacimiento),
         foto_url = COALESCE($5, foto_url),
         posicion = COALESCE($6, posicion),
         numero_camiseta = COALESCE($7, numero_camiseta),
         telefono = COALESCE($8, telefono),
         email = COALESCE($9, email),
         actividad_id = COALESCE($10, actividad_id),
         categoria_socio_id = COALESCE($11, categoria_socio_id)
       WHERE id = $12 AND club_id = $13
       RETURNING *`,
      [nombre || null, apellido || null, dni || null, fecha_nacimiento || null,
       foto_url || null, posicion || null, numero_camiseta || null,
       telefono || null, email || null, actividad_id || null, categoria_socio_id || null,
       req.params.jugadorId, req.clubId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Jugador no encontrado en tu club' });
    res.json({ ok: true, jugador: rows[0] });
  } catch (err) {
    console.error('Error en PUT /club/jugadores/:jugadorId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /club/jugadores/:jugadorId/activo
router.patch('/:jugadorId/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      'UPDATE jugadores SET activo = $1 WHERE id = $2 AND club_id = $3 RETURNING *',
      [activo, req.params.jugadorId, req.clubId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Jugador no encontrado en tu club' });
    res.json({ ok: true, jugador: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /club/jugadores/:jugadorId/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /club/jugadores/:jugadorId — borrado definitivo, SOLO si el jugador
// nunca tuvo un fichaje (si ya jugó en algún torneo, borrarlo de verdad
// rompería el historial de goleadores/tarjetas de esos partidos ya jugados;
// en ese caso hay que usar "Desactivar" en vez de "Eliminar").
router.delete('/:jugadorId', async (req, res) => {
  try {
    const jugador = await query('SELECT id FROM jugadores WHERE id = $1 AND club_id = $2', [req.params.jugadorId, req.clubId]);
    if (!jugador.rows[0]) return res.status(404).json({ ok: false, error: 'Jugador no encontrado en tu club' });

    const tieneFichajes = await query('SELECT 1 FROM fichajes WHERE jugador_id = $1 LIMIT 1', [req.params.jugadorId]);
    if (tieneFichajes.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: 'Este jugador ya tuvo un fichaje (jugó en algún torneo) y no se puede eliminar sin perder ese historial. Usá "Desactivar" en su lugar.'
      });
    }

    await query('DELETE FROM jugadores WHERE id = $1 AND club_id = $2', [req.params.jugadorId, req.clubId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /club/jugadores/:jugadorId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
