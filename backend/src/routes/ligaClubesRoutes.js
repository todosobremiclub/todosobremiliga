const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { query, getClient } = require('../db');

// Todas las rutas usan req.ligaId, calculado por el middleware resolveLigaId
// (montado en app.js antes de este router).

// GET /liga/clubes — clubes que participan en MI liga
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.*, cl.id AS membresia_id, cl.activo AS activo_en_liga, cl.fecha_alta
       FROM club_liga cl
       JOIN clubes c ON c.id = cl.club_id
       WHERE cl.liga_id = $1
       ORDER BY c.nombre ASC`,
      [req.ligaId]
    );
    res.json({ ok: true, clubes: rows });
  } catch (err) {
    console.error('Error en GET /liga/clubes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes — alta de un club NUEVO, que queda automáticamente
// inscripto en mi liga. (Vincular un club ya existente de otra liga es un
// caso que se suma más adelante si hace falta.)
router.post('/', async (req, res) => {
  const {
    nombre, logo_url, direccion, telefono,
    email_contacto, color_primario, color_secundario, cuit
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del club es obligatorio' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const clubResult = await client.query(
      `INSERT INTO clubes (nombre, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario, cuit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [nombre.trim(), logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null, cuit || null]
    );
    const club = clubResult.rows[0];

    const membresiaResult = await client.query(
      `INSERT INTO club_liga (liga_id, club_id) VALUES ($1, $2) RETURNING *`,
      [req.ligaId, club.id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      ok: true,
      club: {
        ...club,
        membresia_id: membresiaResult.rows[0].id,
        activo_en_liga: membresiaResult.rows[0].activo,
        fecha_alta: membresiaResult.rows[0].fecha_alta
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /liga/clubes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PUT /liga/clubes/:clubId — edición de los datos de un club (solo si
// participa en MI liga, si no 404 aunque el club exista en la base)
router.put('/:clubId', async (req, res) => {
  const {
    nombre, logo_url, direccion, telefono,
    email_contacto, color_primario, color_secundario, cuit
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del club es obligatorio' });
  }

  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const { rows } = await query(
      `UPDATE clubes SET
         nombre = $1, logo_url = $2, direccion = $3, telefono = $4,
         email_contacto = $5, color_primario = $6, color_secundario = $7, cuit = $8,
         actualizado_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [nombre.trim(), logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null, cuit || null,
       req.params.clubId]
    );
    res.json({ ok: true, club: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/clubes/:clubId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/clubes/:clubId/activo — activar/desactivar la PARTICIPACIÓN
// de ese club en mi liga (no borra ni afecta al club en sí, que puede seguir
// jugando en otra liga).
router.patch('/:clubId/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      `UPDATE club_liga SET activo = $1
       WHERE club_id = $2 AND liga_id = $3
       RETURNING *`,
      [activo, req.params.clubId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    res.json({ ok: true, membresia: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /liga/clubes/:clubId/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/clubes/:clubId/participaciones — todas las combinaciones
// torneo+categoría en las que ese club tiene un equipo inscripto DENTRO de MI
// liga. Un mismo club puede tener varios equipos a la vez (ej. Baby Fútbol
// Sub 10 y Futsal Primera), esto lo muestra todo junto.
router.get('/:clubId/participaciones', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const { rows } = await query(
      `SELECT et.id AS equipo_torneo_id, et.grupo, et.activo,
              t.id AS torneo_id, t.nombre AS torneo_nombre, t.deporte, t.temporada, t.estado AS torneo_estado,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre
       FROM equipos_torneo et
       JOIN torneos t ON t.id = et.torneo_id
       JOIN categorias cat ON cat.id = et.categoria_id
       WHERE et.club_id = $1 AND t.liga_id = $2
       ORDER BY t.nombre ASC, cat.orden ASC, cat.nombre ASC`,
      [req.params.clubId, req.ligaId]
    );
    res.json({ ok: true, participaciones: rows });
  } catch (err) {
    console.error('Error en GET participaciones de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/usuarios — la Liga crea el usuario club_admin
// que va a administrar ese club (cargar jugadores, pedir fichajes, mostrar
// carnets el día de partido). El club_admin no queda atado a esta Liga en
// particular (un club puede jugar en más de una), solo al club.
router.post('/:clubId/usuarios', async (req, res) => {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (email, password, nombre)' });
  }

  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, club_id, activo)
       VALUES ($1, $2, $3, 'club_admin', $4, TRUE)
       RETURNING id, email, nombre, rol, club_id, activo, creado_at`,
      [email.trim().toLowerCase(), passwordHash, nombre.trim(), req.params.clubId]
    );
    res.status(201).json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en POST /liga/clubes/:clubId/usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
