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
  const { nombre, apellido, dni, fecha_nacimiento, foto_url, posicion, numero_camiseta } = req.body;

  if (!nombre || !nombre.trim() || !apellido || !apellido.trim() || !dni || !dni.trim()) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (nombre, apellido, dni)' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO jugadores (club_id, nombre, apellido, dni, fecha_nacimiento, foto_url, posicion, numero_camiseta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [req.clubId, nombre.trim(), apellido.trim(), dni.trim(), fecha_nacimiento || null,
       foto_url || null, posicion || null, numero_camiseta || null]
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

// PUT /club/jugadores/:jugadorId — edición
router.put('/:jugadorId', async (req, res) => {
  const { nombre, apellido, dni, fecha_nacimiento, foto_url, posicion, numero_camiseta } = req.body;

  try {
    const { rows } = await query(
      `UPDATE jugadores SET
         nombre = COALESCE($1, nombre),
         apellido = COALESCE($2, apellido),
         dni = COALESCE($3, dni),
         fecha_nacimiento = COALESCE($4, fecha_nacimiento),
         foto_url = COALESCE($5, foto_url),
         posicion = COALESCE($6, posicion),
         numero_camiseta = COALESCE($7, numero_camiseta)
       WHERE id = $8 AND club_id = $9
       RETURNING *`,
      [nombre || null, apellido || null, dni || null, fecha_nacimiento || null,
       foto_url || null, posicion || null, numero_camiseta || null,
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

module.exports = router;
