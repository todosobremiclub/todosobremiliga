// Lógica del panel de Super Admin: CRUD de Ligas + gestión de usuarios liga_admin.

let ligasCache = [];

function init() {
  const usuario = requerirRol(['super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  cargarLigas();
  conectarEventos();
}

function conectarEventos() {
  document.getElementById('btnMostrarFormLiga').addEventListener('click', () => {
    limpiarFormLiga();
    document.getElementById('formLiga').classList.remove('oculto');
  });

  document.getElementById('btnCancelarFormLiga').addEventListener('click', () => {
    document.getElementById('formLiga').classList.add('oculto');
  });

  document.getElementById('formLiga').addEventListener('submit', guardarLiga);
  document.getElementById('formUsuario').addEventListener('submit', crearUsuarioLiga);
  document.getElementById('btnCerrarUsuarios').addEventListener('click', () => {
    document.getElementById('panelUsuarios').classList.add('oculto');
  });
}

function limpiarFormLiga() {
  document.getElementById('ligaIdEdicion').value = '';
  document.getElementById('ligaNombre').value = '';
  document.getElementById('ligaSlug').value = '';
  document.getElementById('ligaDireccion').value = '';
  document.getElementById('ligaTelefono').value = '';
  document.getElementById('ligaEmail').value = '';
  document.getElementById('ligaLogoUrl').value = '';
  document.getElementById('ligaColorPrimario').value = '';
  document.getElementById('ligaColorSecundario').value = '';
  document.getElementById('ligaFormError').classList.add('oculto');
}

async function cargarLigas() {
  const tbody = document.getElementById('tablaLigas');
  try {
    const data = await apiFetch('/admin/ligas');
    ligasCache = data.ligas;
    if (!ligasCache.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay Ligas creadas.</td></tr>';
      return;
    }
    tbody.innerHTML = ligasCache.map((liga) => `
      <tr>
        <td>${escapeHtml(liga.nombre)}</td>
        <td>${escapeHtml(liga.slug)}</td>
        <td><span class="badge ${liga.activo ? 'badge-activo' : 'badge-inactivo'}">${liga.activo ? 'Activa' : 'Inactiva'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="editarLiga('${liga.id}')">Editar</button>
          <button class="btn btn-secundario btn-pequeno" onclick="verUsuarios('${liga.id}', '${escapeHtml(liga.nombre)}')">Usuarios</button>
          <button class="btn ${liga.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoLiga('${liga.id}', ${!liga.activo})">${liga.activo ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error cargando Ligas: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarLiga(ligaId) {
  const liga = ligasCache.find((l) => l.id === ligaId);
  if (!liga) return;
  document.getElementById('ligaIdEdicion').value = liga.id;
  document.getElementById('ligaNombre').value = liga.nombre || '';
  document.getElementById('ligaSlug').value = liga.slug || '';
  document.getElementById('ligaDireccion').value = liga.direccion || '';
  document.getElementById('ligaTelefono').value = liga.telefono || '';
  document.getElementById('ligaEmail').value = liga.email_contacto || '';
  document.getElementById('ligaLogoUrl').value = liga.logo_url || '';
  document.getElementById('ligaColorPrimario').value = liga.color_primario || '';
  document.getElementById('ligaColorSecundario').value = liga.color_secundario || '';
  document.getElementById('formLiga').classList.remove('oculto');
}

async function guardarLiga(e) {
  e.preventDefault();
  const errorEl = document.getElementById('ligaFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('ligaIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('ligaNombre').value.trim(),
    slug: document.getElementById('ligaSlug').value.trim() || undefined,
    direccion: document.getElementById('ligaDireccion').value.trim() || undefined,
    telefono: document.getElementById('ligaTelefono').value.trim() || undefined,
    email_contacto: document.getElementById('ligaEmail').value.trim() || undefined,
    logo_url: document.getElementById('ligaLogoUrl').value.trim() || undefined,
    color_primario: document.getElementById('ligaColorPrimario').value.trim() || undefined,
    color_secundario: document.getElementById('ligaColorSecundario').value.trim() || undefined
  };

  try {
    if (id) {
      await apiFetch(`/admin/ligas/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/admin/ligas', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formLiga').classList.add('oculto');
    cargarLigas();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function toggleActivoLiga(ligaId, nuevoValor) {
  try {
    await apiFetch(`/admin/ligas/${ligaId}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: nuevoValor })
    });
    cargarLigas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function verUsuarios(ligaId, nombreLiga) {
  document.getElementById('panelUsuarios').classList.remove('oculto');
  document.getElementById('tituloUsuarios').textContent = `Usuarios de "${nombreLiga}"`;
  document.getElementById('usuarioLigaId').value = ligaId;
  document.getElementById('usuarioFormError').classList.add('oculto');
  document.getElementById('usuarioFormOk').classList.add('oculto');
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioLigaId').value = ligaId; // reset() borra el hidden también, se vuelve a poner

  const tbody = document.getElementById('tablaUsuarios');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/admin/usuarios?liga_id=${ligaId}`);
    if (!data.usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="4">Esta Liga todavía no tiene usuarios asignados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.usuarios.map((u) => `
      <tr>
        <td>${escapeHtml(u.nombre)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.rol)}</td>
        <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function crearUsuarioLiga(e) {
  e.preventDefault();
  const errorEl = document.getElementById('usuarioFormError');
  const okEl = document.getElementById('usuarioFormOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const ligaId = document.getElementById('usuarioLigaId').value;
  const cuerpo = {
    nombre: document.getElementById('usuarioNombreInput').value.trim(),
    email: document.getElementById('usuarioEmail').value.trim(),
    password: document.getElementById('usuarioPassword').value,
    rol: 'liga_admin',
    liga_id: ligaId
  };

  try {
    await apiFetch('/admin/usuarios', { method: 'POST', body: JSON.stringify(cuerpo) });
    okEl.textContent = 'Usuario creado correctamente.';
    okEl.classList.remove('oculto');
    document.getElementById('formUsuario').reset();
    document.getElementById('usuarioLigaId').value = ligaId;
    const nombreLiga = document.getElementById('tituloUsuarios').textContent;
    verUsuarios(ligaId, nombreLiga.replace('Usuarios de "', '').replace('"', ''));
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
