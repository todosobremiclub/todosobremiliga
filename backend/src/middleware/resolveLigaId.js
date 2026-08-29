// Calcula a qué Liga pertenecen los datos que se están pidiendo/creando:
// - Si el usuario logueado es liga_admin, siempre se usa SU liga_id (no puede
//   elegir otra: así nos aseguramos de que nunca vea/toque datos de otra Liga).
// - Si es super_admin, puede operar "en nombre de" una Liga indicando
//   ?liga_id=... (query) o liga_id en el body, porque el super_admin no
//   pertenece a ninguna Liga en particular.
//
// Debe usarse siempre DESPUÉS de requireAuth.
module.exports = function resolveLigaId(req, res, next) {
  if (req.usuario.rol === 'liga_admin' || req.usuario.rol === 'autoridad' || req.usuario.rol === 'arbitro') {
    if (!req.usuario.liga_id) {
      return res.status(403).json({ ok: false, error: 'Tu usuario no tiene una Liga asociada' });
    }
    req.ligaId = req.usuario.liga_id;
    return next();
  }

  if (req.usuario.rol === 'super_admin') {
    const ligaId = req.query.liga_id || req.body.liga_id;
    if (!ligaId) {
      return res.status(400).json({ ok: false, error: 'Falta indicar liga_id (query o body) para operar como super_admin' });
    }
    req.ligaId = ligaId;
    return next();
  }

  return res.status(403).json({ ok: false, error: 'No autorizado' });
};
