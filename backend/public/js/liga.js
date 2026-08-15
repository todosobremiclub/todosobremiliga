// Lógica del Panel de Liga. Por ahora: sección Clubes completa.
// La sección Torneos se completa en un paso siguiente.

let clubesCache = [];

function init() {
  const usuario = requerirRol(['liga_admin', 'super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  conectarEventos();
  cargarClubes();
}

function conectarEventos() {
  document.getElementById('tabBtnClubes').addEventListener('click', () => cambiarTab('clubes'));
  document.getElementById('tabBtnTorneos').addEventListener('click', () => cambiarTab('torneos'));

  document.getElementById('btnMostrarFormClub').addEventListener('click', () => {
    document.getElementById('formClub').reset();
    document.getElementById('clubFormError').classList.add('oculto');
    document.getElementById('formClub').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormClub').addEventListener('click', () => {
    document.getElementById('formClub').classList.add('oculto');
  });
  document.getElementById('formClub').addEventListener('submit', guardarClub);

  document.getElementById('btnCerrarUsuariosClub').addEventListener('click', () => {
    document.getElementById('panelUsuariosClub').classList.add('oculto');
  });
  document.getElementById('formUsuarioClub').addEventListener('submit', crearUsuarioClub);
}

function cambiarTab(nombre) {
  const secciones = { clubes: 'seccionClubes', torneos: 'seccionTorneos' };
  const botones = { clubes: 'tabBtnClubes', torneos: 'tabBtnTorneos' };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
}

async function cargarClubes() {
  const tbody = document.getElementById('tablaClubes');
  try {
    const data = await apiFetch('/liga/clubes');
    clubesCache = data.clubes;
    if (!clubesCache.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no cargaste ningún club.</td></tr>';
      return;
    }
    tbody.innerHTML = clubesCache.map((club) => `
      <tr>
        <td>${escapeHtml(club.nombre)}</td>
        <td>${escapeHtml(club.cuit || '-')}</td>
        <td><span class="badge ${club.activo_en_liga ? 'badge-activo' : 'badge-inactivo'}">${club.activo_en_liga ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="verUsuariosClub('${club.id}', '${escapeHtml(club.nombre)}')">Usuarios</button>
          <button class="btn ${club.activo_en_liga ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoClub('${club.id}', ${!club.activo_en_liga})">${club.activo_en_liga ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('clubFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    nombre: document.getElementById('clubNombre').value.trim(),
    cuit: document.getElementById('clubCuit').value.trim() || undefined,
    direccion: document.getElementById('clubDireccion').value.trim() || undefined,
    telefono: document.getElementById('clubTelefono').value.trim() || undefined,
    email_contacto: document.getElementById('clubEmail').value.trim() || undefined,
    logo_url: document.getElementById('clubLogoUrl').value.trim() || undefined
  };

  try {
    await apiFetch('/liga/clubes', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formClub').classList.add('oculto');
    cargarClubes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function toggleActivoClub(clubId, nuevoValor) {
  try {
    await apiFetch(`/liga/clubes/${clubId}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: nuevoValor })
    });
    cargarClubes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function verUsuariosClub(clubId, nombreClub) {
  document.getElementById('panelUsuariosClub').classList.remove('oculto');
  document.getElementById('tituloUsuariosClub').textContent = `Usuarios de "${nombreClub}"`;
  document.getElementById('usuarioClubId').value = clubId;
  document.getElementById('usuarioClubFormError').classList.add('oculto');
  document.getElementById('usuarioClubFormOk').classList.add('oculto');
  document.getElementById('formUsuarioClub').reset();
  document.getElementById('usuarioClubId').value = clubId;
}

async function crearUsuarioClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('usuarioClubFormError');
  const okEl = document.getElementById('usuarioClubFormOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const clubId = document.getElementById('usuarioClubId').value;
  const cuerpo = {
    nombre: document.getElementById('ucNombre').value.trim(),
    email: document.getElementById('ucEmail').value.trim(),
    password: document.getElementById('ucPassword').value
  };

  try {
    await apiFetch(`/liga/clubes/${clubId}/usuarios`, { method: 'POST', body: JSON.stringify(cuerpo) });
    okEl.textContent = 'Usuario creado correctamente.';
    okEl.classList.remove('oculto');
    document.getElementById('formUsuarioClub').reset();
    document.getElementById('usuarioClubId').value = clubId;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

function escapeHtml(texto) {
  if (texto == null) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
