const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-CAMBIAR-en-produccion';

function signToken(payload) {
  // 12 horas de sesión; se puede ajustar según lo que pida cada módulo (ej. la app de fichajes
  // capaz necesita sesiones más largas para los clubes).
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };
