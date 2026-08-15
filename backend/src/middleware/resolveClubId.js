// Análogo a resolveLigaId, pero para el lado del Club:
// - club_admin siempre opera sobre SU club_id (no puede elegir otro).
// - super_admin puede indicar ?club_id=... (query) o club_id (body) para
//   operar en nombre de un club si hiciera falta soporte/debug.
//
// Debe usarse siempre DESPUÉS de requireAuth.
module.exports = function resolveClubId(req, res, next) {
  if (req.usuario.rol === 'club_admin') {
    if (!req.usuario.club_id) {
      return res.status(403).json({ ok: false, error: 'Tu usuario no tiene un Club asociado' });
    }
    req.clubId = req.usuario.club_id;
    return next();
  }

  if (req.usuario.rol === 'super_admin') {
    const clubId = req.query.club_id || req.body.club_id;
    if (!clubId) {
      return res.status(400).json({ ok: false, error: 'Falta indicar club_id (query o body) para operar como super_admin' });
    }
    req.clubId = clubId;
    return next();
  }

  return res.status(403).json({ ok: false, error: 'No autorizado' });
};
