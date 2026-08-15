const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();

const { query } = require('../db');
const { signToken } = require('../utils/jwt');
const requireAuth = require('../middleware/requireAuth');

// POST /auth/login
// Login único para los 4 roles (super_admin, liga_admin, club_admin, jugador).
// El rol viaja adentro del JWT y determina qué puede ver/hacer cada quien.
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan email y/o password' });
  }

  try {
    const { rows } = await query(
      'SELECT * FROM usuarios WHERE email = $1 AND activo = TRUE',
      [email]
    );
    const usuario = rows[0];

    if (!usuario || !usuario.password_hash) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    const passwordOk = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
    }

    await query('UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1', [usuario.id]);

    const token = signToken({
      id: usuario.id,
      rol: usuario.rol,
      liga_id: usuario.liga_id,
      club_id: usuario.club_id
    });

    res.json({
      ok: true,
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        liga_id: usuario.liga_id,
        club_id: usuario.club_id
      }
    });
  } catch (err) {
    console.error('Error en /auth/login:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /auth/me
// Devuelve los datos del usuario logueado a partir del token — útil para que
// el frontend valide la sesión al cargar cualquier pantalla.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, nombre, email, rol, liga_id, club_id, activo FROM usuarios WHERE id = $1',
      [req.usuario.id]
    );
    if (!rows[0] || !rows[0].activo) {
      return res.status(401).json({ ok: false, error: 'Usuario inactivo o inexistente' });
    }
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    console.error('Error en /auth/me:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
