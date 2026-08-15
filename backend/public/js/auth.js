// Utilidades compartidas de sesión/autenticación para todos los paneles
// (admin.html, liga.html, club.html). Se guarda el token y los datos del
// usuario en localStorage — es una app propia (no un artifact de Claude),
// así que localStorage es la forma normal y correcta de persistir sesión acá.

const TSM_TOKEN_KEY = 'tsmliga_token';
const TSM_USUARIO_KEY = 'tsmliga_usuario';

function getToken() {
  return localStorage.getItem(TSM_TOKEN_KEY);
}

function getUsuario() {
  try {
    return JSON.parse(localStorage.getItem(TSM_USUARIO_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

function guardarSesion(token, usuario) {
  localStorage.setItem(TSM_TOKEN_KEY, token);
  localStorage.setItem(TSM_USUARIO_KEY, JSON.stringify(usuario));
}

function cerrarSesion() {
  localStorage.removeItem(TSM_TOKEN_KEY);
  localStorage.removeItem(TSM_USUARIO_KEY);
  window.location.href = '/login.html';
}

// Llamar al principio de cada panel: si no hay sesión válida o el rol no
// corresponde a esa pantalla, redirige a /login.html.
function requerirRol(rolesPermitidos) {
  const token = getToken();
  const usuario = getUsuario();
  if (!token || !usuario) {
    window.location.href = '/login.html';
    return null;
  }
  if (!rolesPermitidos.includes(usuario.rol)) {
    window.location.href = '/login.html';
    return null;
  }
  return usuario;
}

// Wrapper de fetch que agrega el token y maneja errores de forma consistente.
async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(path, Object.assign({}, options, { headers }));

  if (res.status === 401) {
    cerrarSesion();
    throw new Error('Sesión expirada, volvé a ingresar');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // respuesta sin cuerpo JSON
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `Error ${res.status}`);
  }

  return data;
}

// Pinta el nombre/rol del usuario logueado y conecta el botón de salir,
// en cualquier topbar que tenga los elementos con estos ids.
function inicializarTopbar(usuario) {
  const nombreEl = document.getElementById('usuarioNombre');
  const logoutBtn = document.getElementById('btnLogout');
  if (nombreEl) nombreEl.textContent = `${usuario.nombre} (${usuario.rol})`;
  if (logoutBtn) logoutBtn.addEventListener('click', cerrarSesion);
}
