const { verifyToken } = require('../utils/jwt');

// Valida el JWT del header "Authorization: Bearer <token>" y deja los datos
// del usuario logueado en req.usuario (id, rol, liga_id, club_id).
module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token faltante' });
  }

  try {
    req.usuario = verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
};
