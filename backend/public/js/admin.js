// Lógica del panel de Super Admin: CRUD de Ligas (Productivas / DEMO) +
// gestión de usuarios liga_admin.

let ligasCache = [];
let tabActual = 'productiva';
let logoBase64Actual = '';
let paginaLigasActual = 1;
const LIGAS_POR_PAGINA = 25;
let totalLigasActual = 0;

function mostrarFondoModal() {
  document.getElementById('fondoModalGenerico').classList.remove('oculto');
}
function ocultarFondoModal() {
  document.getElementById('fondoModalGenerico').classList.add('oculto');
}

const ESTADOS_DEMO_LABELS = {
  avanzado: 'Avanzado',
  pendiente: 'Pendiente',
  sin_respuesta: 'Sin Respuesta',
  baja: 'Baja'
};

function init() {
  const usuario = requerirRol(['super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  cargarLigas();
  conectarEventos();
}

function conectarEventos() {
  document.getElementById('tabBtnProductivas').addEventListener('click', () => cambiarTabLigas('productiva'));
  document.getElementById('tabBtnDemo').addEventListener('click', () => cambiarTabLigas('demo'));

  document.getElementById('buscadorLigas').addEventListener('input', () => {
    paginaLigasActual = 1;
    cargarLigas();
  });
  document.getElementById('btnLigasPaginaAnterior').addEventListener('click', () => {
    if (paginaLigasActual > 1) { paginaLigasActual -= 1; cargarLigas(); }
  });
  document.getElementById('btnLigasPaginaSiguiente').addEventListener('click', () => {
    if (paginaLigasActual * LIGAS_POR_PAGINA < totalLigasActual) { paginaLigasActual += 1; cargarLigas(); }
  });
  document.getElementById('btnLigasPaginaAnteriorTop').addEventListener('click', () => {
    if (paginaLigasActual > 1) { paginaLigasActual -= 1; cargarLigas(); }
  });
  document.getElementById('btnLigasPaginaSiguienteTop').addEventListener('click', () => {
    if (paginaLigasActual * LIGAS_POR_PAGINA < totalLigasActual) { paginaLigasActual += 1; cargarLigas(); }
  });

  document.getElementById('btnMostrarFormLiga').addEventListener('click', () => {
    limpiarFormLiga();
    document.getElementById('formLiga').classList.remove('oculto');
    mostrarFondoModal();
  });

  document.getElementById('btnCancelarFormLiga').addEventListener('click', () => {
    document.getElementById('formLiga').classList.add('oculto');
    ocultarFondoModal();
  });

  document.getElementById('formLiga').addEventListener('submit', guardarLiga);
  document.getElementById('formUsuario').addEventListener('submit', crearUsuarioLiga);
  document.getElementById('btnCerrarUsuarios').addEventListener('click', () => {
    document.getElementById('panelUsuarios').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('btnCerrarVerLiga').addEventListener('click', () => {
    document.getElementById('panelVerLiga').classList.add('oculto');
    ocultarFondoModal();
  });

  document.getElementById('ligaTipo').addEventListener('change', (e) => {
    document.getElementById('grupoEstadoDemo').classList.toggle('oculto', e.target.value !== 'demo');
  });

  document.getElementById('ligaLogoArchivo').addEventListener('change', onElegirLogo);

  ['Primario', 'Secundario', 'Acento'].forEach((sufijo) => {
    const input = document.getElementById(`ligaColor${sufijo}`);
    const span = document.getElementById(`ligaColor${sufijo}Hex`);
    input.addEventListener('input', () => { span.textContent = input.value; });
  });
}

function cambiarTabLigas(tipo) {
  tabActual = tipo;
  document.getElementById('tabBtnProductivas').classList.toggle('activo', tipo === 'productiva');
  document.getElementById('tabBtnDemo').classList.toggle('activo', tipo === 'demo');
  paginaLigasActual = 1;
  cargarLigas();
}

function onElegirLogo(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    logoBase64Actual = lector.result;
    const preview = document.getElementById('logoPreview');
    preview.src = logoBase64Actual;
    preview.classList.remove('oculto');
    document.getElementById('ligaLogoUrl').value = logoBase64Actual;
  };
  lector.readAsDataURL(archivo);
}

function limpiarFormLiga() {
  document.getElementById('ligaIdEdicion').value = '';
  document.getElementById('ligaNombre').value = '';
  document.getElementById('ligaTipo').value = tabActual;
  document.getElementById('grupoEstadoDemo').classList.toggle('oculto', tabActual !== 'demo');
  document.getElementById('ligaEstadoDemo').value = 'pendiente';
  document.getElementById('ligaDireccion').value = '';
  document.getElementById('ligaCiudad').value = '';
  document.getElementById('ligaProvincia').value = '';
  document.getElementById('ligaTelefono').value = '';
  document.getElementById('ligaEmail').value = '';
  document.getElementById('ligaLogoUrl').value = '';
  document.getElementById('ligaLogoArchivo').value = '';
  document.getElementById('logoPreview').classList.add('oculto');
  logoBase64Actual = '';
  document.getElementById('ligaColorPrimario').value = '#1d4ed8';
  document.getElementById('ligaColorPrimarioHex').textContent = '#1d4ed8';
  document.getElementById('ligaColorSecundario').value = '#1e3a8a';
  document.getElementById('ligaColorSecundarioHex').textContent = '#1e3a8a';
  document.getElementById('ligaColorAcento').value = '#f59e0b';
  document.getElementById('ligaColorAcentoHex').textContent = '#f59e0b';
  document.getElementById('ligaFormError').classList.add('oculto');
}

async function cargarLigas() {
  const tbody = document.getElementById('tablaLigas');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  const texto = document.getElementById('buscadorLigas').value.trim();
  try {
    const params = new URLSearchParams({
      tipo: tabActual,
      pagina: paginaLigasActual,
      por_pagina: LIGAS_POR_PAGINA
    });
    if (texto) params.set('q', texto);
    const data = await apiFetch(`/admin/ligas?${params.toString()}`);
    ligasCache = data.ligas;
    totalLigasActual = data.total;

    const desde = ligasCache.length ? (paginaLigasActual - 1) * LIGAS_POR_PAGINA + 1 : 0;
    const hasta = (paginaLigasActual - 1) * LIGAS_POR_PAGINA + ligasCache.length;
    const textoPaginacionLigas = `Mostrando ${desde}-${hasta} de ${totalLigasActual} ligas`;
    const deshabilitarAnteriorLigas = paginaLigasActual <= 1;
    const deshabilitarSiguienteLigas = paginaLigasActual * LIGAS_POR_PAGINA >= totalLigasActual;
    ['paginacionLigasInfo', 'paginacionLigasInfoTop'].forEach((id) => { document.getElementById(id).textContent = textoPaginacionLigas; });
    ['btnLigasPaginaAnterior', 'btnLigasPaginaAnteriorTop'].forEach((id) => { document.getElementById(id).disabled = deshabilitarAnteriorLigas; });
    ['btnLigasPaginaSiguiente', 'btnLigasPaginaSiguienteTop'].forEach((id) => { document.getElementById(id).disabled = deshabilitarSiguienteLigas; });

    if (!ligasCache.length) {
      tbody.innerHTML = '<tr><td colspan="5">No se encontraron Ligas.</td></tr>';
      return;
    }
    tbody.innerHTML = ligasCache.map((liga) => `
      <tr>
        <td>${liga.logo_url ? `<img class="logo-miniatura" src="${liga.logo_url}" alt="">` : '<span class="logo-miniatura"></span>'}</td>
        <td>${escapeHtml(liga.nombre)}</td>
        <td>${liga.cantidad_clubes}</td>
        <td>${renderEstadoLiga(liga)}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="verLiga('${liga.id}')">Ver</button>
          <button class="btn btn-secundario btn-pequeno" onclick="editarLiga('${liga.id}')">Editar</button>
          <button class="btn btn-secundario btn-pequeno" onclick="verUsuarios('${liga.id}', '${escapeHtml(liga.nombre)}')">Usuarios</button>
          <button class="btn ${liga.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoLiga('${liga.id}', ${!liga.activo})">${liga.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-peligro btn-pequeno" onclick="eliminarLiga('${liga.id}', '${escapeHtml(liga.nombre)}')">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error cargando Ligas: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderEstadoLiga(liga) {
  if (liga.tipo === 'demo') {
    const estado = liga.estado_demo || 'pendiente';
    return `<select class="select-estado-demo" onchange="cambiarEstadoDemo('${liga.id}', this.value)">
      ${Object.keys(ESTADOS_DEMO_LABELS).map((key) => `<option value="${key}" ${key === estado ? 'selected' : ''}>${ESTADOS_DEMO_LABELS[key]}</option>`).join('')}
    </select>`;
  }
  return `<span class="badge ${liga.activo ? 'badge-activo' : 'badge-inactivo'}">${liga.activo ? 'Activa' : 'Inactiva'}</span>`;
}

async function cambiarEstadoDemo(ligaId, nuevoEstado) {
  try {
    await apiFetch(`/admin/ligas/${ligaId}/estado-demo`, {
      method: 'PATCH',
      body: JSON.stringify({ estado_demo: nuevoEstado })
    });
    cargarLigas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function editarLiga(ligaId) {
  const liga = ligasCache.find((l) => l.id === ligaId);
  if (!liga) return;
  document.getElementById('ligaIdEdicion').value = liga.id;
  document.getElementById('ligaNombre').value = liga.nombre || '';
  document.getElementById('ligaTipo').value = liga.tipo || 'productiva';
  document.getElementById('grupoEstadoDemo').classList.toggle('oculto', liga.tipo !== 'demo');
  document.getElementById('ligaEstadoDemo').value = liga.estado_demo || 'pendiente';
  document.getElementById('ligaDireccion').value = liga.direccion || '';
  document.getElementById('ligaCiudad').value = liga.ciudad || '';
  document.getElementById('ligaProvincia').value = liga.provincia || '';
  document.getElementById('ligaTelefono').value = liga.telefono || '';
  document.getElementById('ligaEmail').value = liga.email_contacto || '';
  document.getElementById('ligaLogoUrl').value = liga.logo_url || '';
  logoBase64Actual = liga.logo_url || '';
  const preview = document.getElementById('logoPreview');
  if (liga.logo_url) {
    preview.src = liga.logo_url;
    preview.classList.remove('oculto');
  } else {
    preview.classList.add('oculto');
  }
  document.getElementById('ligaLogoArchivo').value = '';
  document.getElementById('ligaColorPrimario').value = liga.color_primario || '#1d4ed8';
  document.getElementById('ligaColorPrimarioHex').textContent = liga.color_primario || '#1d4ed8';
  document.getElementById('ligaColorSecundario').value = liga.color_secundario || '#1e3a8a';
  document.getElementById('ligaColorSecundarioHex').textContent = liga.color_secundario || '#1e3a8a';
  document.getElementById('ligaColorAcento').value = liga.color_acento || '#f59e0b';
  document.getElementById('ligaColorAcentoHex').textContent = liga.color_acento || '#f59e0b';
  document.getElementById('ligaFormError').classList.add('oculto');
  document.getElementById('formLiga').classList.remove('oculto');
  mostrarFondoModal();
}

async function guardarLiga(e) {
  e.preventDefault();
  const errorEl = document.getElementById('ligaFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('ligaIdEdicion').value;
  const tipo = document.getElementById('ligaTipo').value;
  const cuerpo = {
    nombre: document.getElementById('ligaNombre').value.trim(),
    tipo,
    estado_demo: tipo === 'demo' ? document.getElementById('ligaEstadoDemo').value : undefined,
    direccion: document.getElementById('ligaDireccion').value.trim() || undefined,
    ciudad: document.getElementById('ligaCiudad').value.trim() || undefined,
    provincia: document.getElementById('ligaProvincia').value.trim() || undefined,
    telefono: document.getElementById('ligaTelefono').value.trim() || undefined,
    email_contacto: document.getElementById('ligaEmail').value.trim() || undefined,
    logo_url: document.getElementById('ligaLogoUrl').value || undefined,
    color_primario: document.getElementById('ligaColorPrimario').value,
    color_secundario: document.getElementById('ligaColorSecundario').value,
    color_acento: document.getElementById('ligaColorAcento').value
  };

  try {
    if (id) {
      await apiFetch(`/admin/ligas/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/admin/ligas', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formLiga').classList.add('oculto');
    ocultarFondoModal();
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

async function eliminarLiga(ligaId, nombreLiga) {
  if (!confirm(`¿Eliminar definitivamente la Liga "${nombreLiga}"? Esto borra también sus torneos, usuarios, noticias, fichajes, etc. Los clubes NO se borran (siguen existiendo para otras Ligas).`)) {
    return;
  }
  try {
    await apiFetch(`/admin/ligas/${ligaId}`, { method: 'DELETE' });
    cargarLigas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function verLiga(ligaId) {
  const contenedor = document.getElementById('contenidoVerLiga');
  document.getElementById('panelVerLiga').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloVerLiga').textContent = 'Cargando...';
  contenedor.innerHTML = 'Cargando...';
  try {
    const data = await apiFetch(`/admin/ligas/${ligaId}`);
    const liga = data.liga;
    document.getElementById('tituloVerLiga').textContent = liga.nombre;
    contenedor.innerHTML = `
      <div class="form-grid">
        <div>
          ${liga.logo_url ? `<img class="logo-miniatura" style="width:80px;height:80px;" src="${liga.logo_url}" alt="">` : '<p class="texto-ayuda">Sin logo</p>'}
        </div>
      </div>
      <div class="form-grid">
        <div><strong>Tipo:</strong> ${liga.tipo === 'demo' ? 'DEMO' : 'Productiva'}</div>
        <div><strong>Estado:</strong> ${liga.tipo === 'demo' ? (ESTADOS_DEMO_LABELS[liga.estado_demo] || 'Pendiente') : (liga.activo ? 'Activa' : 'Inactiva')}</div>
        <div><strong>Clubes cargados:</strong> ${liga.cantidad_clubes}</div>
        <div><strong>Dirección:</strong> ${escapeHtml(liga.direccion || '-')}</div>
        <div><strong>Ciudad:</strong> ${escapeHtml(liga.ciudad || '-')}</div>
        <div><strong>Provincia:</strong> ${escapeHtml(liga.provincia || '-')}</div>
        <div><strong>Teléfono:</strong> ${escapeHtml(liga.telefono || '-')}</div>
        <div><strong>Email:</strong> ${escapeHtml(liga.email_contacto || '-')}</div>
      </div>
      <div class="form-grid">
        <div><strong>Color primario:</strong> <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${liga.color_primario || '#ccc'};vertical-align:middle;"></span> ${escapeHtml(liga.color_primario || '-')}</div>
        <div><strong>Color secundario:</strong> <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${liga.color_secundario || '#ccc'};vertical-align:middle;"></span> ${escapeHtml(liga.color_secundario || '-')}</div>
        <div><strong>Color de acento:</strong> <span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:${liga.color_acento || '#ccc'};vertical-align:middle;"></span> ${escapeHtml(liga.color_acento || '-')}</div>
      </div>
      <p class="texto-ayuda">Creada el ${new Date(liga.creado_at).toLocaleDateString('es-AR')}</p>
    `;
  } catch (err) {
    contenedor.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function verUsuarios(ligaId, nombreLiga) {
  document.getElementById('panelUsuarios').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloUsuarios').textContent = `Usuarios de "${nombreLiga}"`;
  document.getElementById('usuarioLigaId').value = ligaId;
  document.getElementById('usuarioFormError').classList.add('oculto');
  document.getElementById('usuarioFormOk').classList.add('oculto');
  document.getElementById('formUsuario').reset();
  document.getElementById('usuarioLigaId').value = ligaId; // reset() borra el hidden también, se vuelve a poner
  cargarUsuariosDeLiga(ligaId);
}

async function cargarUsuariosDeLiga(ligaId) {
  const tbody = document.getElementById('tablaUsuarios');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/admin/usuarios?liga_id=${ligaId}`);
    if (!data.usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="5">Esta Liga todavía no tiene usuarios asignados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.usuarios.map((u) => `
      <tr>
        <td>${escapeHtml(u.nombre)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.rol)}</td>
        <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="editarUsuarioAdmin('${ligaId}', '${u.id}', '${escapeHtml(u.nombre)}', '${escapeHtml(u.email)}')">Editar</button>
          <button class="btn btn-secundario btn-pequeno" onclick="cambiarPasswordUsuarioAdmin('${u.id}')">Cambiar contraseña</button>
          <button class="btn ${u.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoUsuarioAdmin('${ligaId}', '${u.id}', ${!u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-peligro btn-pequeno" onclick="eliminarUsuarioAdmin('${ligaId}', '${u.id}', '${escapeHtml(u.nombre)}')">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function editarUsuarioAdmin(ligaId, usuarioId, nombreActual, emailActual) {
  const nombre = prompt('Nombre:', nombreActual);
  if (nombre === null) return;
  const email = prompt('Email:', emailActual);
  if (email === null) return;
  try {
    await apiFetch(`/admin/usuarios/${usuarioId}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: nombre.trim(), email: email.trim() })
    });
    cargarUsuariosDeLiga(ligaId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function cambiarPasswordUsuarioAdmin(usuarioId) {
  const password = prompt('Nueva contraseña (mínimo 4 caracteres):');
  if (password === null) return;
  try {
    await apiFetch(`/admin/usuarios/${usuarioId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password })
    });
    alert('Contraseña actualizada.');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function toggleActivoUsuarioAdmin(ligaId, usuarioId, nuevoValor) {
  try {
    await apiFetch(`/admin/usuarios/${usuarioId}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: nuevoValor })
    });
    cargarUsuariosDeLiga(ligaId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarUsuarioAdmin(ligaId, usuarioId, nombre) {
  if (!confirm(`¿Eliminar definitivamente al usuario "${nombre}"?`)) return;
  try {
    await apiFetch(`/admin/usuarios/${usuarioId}`, { method: 'DELETE' });
    cargarUsuariosDeLiga(ligaId);
  } catch (err) {
    alert('Error: ' + err.message);
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
    cargarUsuariosDeLiga(ligaId);
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
