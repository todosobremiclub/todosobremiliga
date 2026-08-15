// Uso: requireRole('super_admin') o requireRole('liga_admin', 'super_admin')
// Debe usarse siempre DESPUÉS de requireAuth (necesita req.usuario ya cargado).
module.exports = function requireRole(...rolesPermitidos) {
  return function (req, res, next) {
    if (!req.usuario) {
      return res.status(401).json({ ok: false, error: 'No autenticado' });
    }
    if (!rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({ ok: false, error: 'No autorizado para este recurso' });
    }
    next();
  };
};
