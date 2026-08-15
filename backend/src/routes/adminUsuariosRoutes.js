const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { query } = require('../db');

// Roles que el Super Admin puede crear desde este panel. club_admin y
// jugador se van a crear desde sus propios flujos (Módulo Liga / Fichajes),
// no desde acá.
const ROLES_PERMITIDOS_DESDE_ADMIN = ['super_admin', 'liga_admin'];

// GET /admin/usuarios?liga_id=... — listado de usuarios, opcionalmente
// filtrado por Liga (para ver quién administra cada una).
router.get('/', async (req, res) => {
  const { liga_id } = req.query;
  try {
    let sql = `SELECT id, email, nombre, rol, liga_id, club_id, activo, ultimo_login, creado_at
               FROM usuarios`;
    const params = [];
    if (liga_id) {
      params.push(liga_id);
      sql += ' WHERE liga_id = $1';
    }
    sql += ' ORDER BY creado_at DESC';
    const { rows } = await query(sql, params);
    res.json({ ok: true, usuarios: rows });
  } catch (err) {
    console.error('Error en GET /admin/usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /admin/usuarios — alta de un usuario liga_admin (o, si hiciera falta,
// otro super_admin). El typico caso de uso: después de crear una Liga, el
// Super Admin crea el usuario que la va a administrar.
router.post('/', async (req, res) => {
  const { email, password, nombre, rol, liga_id } = req.body;

  if (!email || !password || !nombre || !rol) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (email, password, nombre, rol)' });
  }
  if (!ROLES_PERMITIDOS_DESDE_ADMIN.includes(rol)) {
    return res.status(400).json({ ok: false, error: `Rol no permitido desde este panel: ${rol}` });
  }
  if (rol === 'liga_admin' && !liga_id) {
    return res.status(400).json({ ok: false, error: 'Un usuario liga_admin necesita liga_id' });
  }

  try {
    if (liga_id) {
      const ligaExiste = await query('SELECT id FROM ligas WHERE id = $1', [liga_id]);
      if (!ligaExiste.rows[0]) {
        return res.status(404).json({ ok: false, error: 'La Liga indicada no existe' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, liga_id, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, email, nombre, rol, liga_id, club_id, activo, creado_at`,
      [email.trim().toLowerCase(), passwordHash, nombre.trim(), rol, liga_id || null]
    );
    res.status(201).json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique_violation (email repetido)
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en POST /admin/usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /admin/usuarios/:id/activo — activar o desactivar un usuario
// (por ejemplo, si una Liga deja de operar, se desactiva su liga_admin sin borrarlo).
router.patch('/:id/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, email, nombre, rol, activo',
      [activo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /admin/usuarios/:id/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
