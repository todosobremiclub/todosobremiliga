// Lógica del Panel de Liga: Clubes + Torneos/Categorías/Equipos/Fixture/Tabla.

let clubesCache = [];
let torneosCache = [];
let categoriasCache = [];
let equiposCache = [];
let partidosCache = [];
let clubLogoBase64Actual = '';

let torneoActualId = null;
let torneoActualNombre = '';
let categoriaActualId = null;
let categoriaActualNombre = '';

function init() {
  const usuario = requerirRol(['liga_admin', 'super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  conectarEventos();
  cargarPerfilLiga();
  cargarClubes();
}

// Trae los datos de marca (nombre/logo/colores) de la propia Liga y pinta el
// header con un degradé usando sus colores reales — look moderno pedido para
// el Panel Liga.
async function cargarPerfilLiga() {
  try {
    const data = await apiFetch('/liga/perfil');
    const liga = data.liga;
    const header = document.getElementById('headerLiga');
    const primario = liga.color_primario || '#1d4ed8';
    const secundario = liga.color_secundario || '#1e3a8a';
    header.style.background = `linear-gradient(135deg, ${primario}, ${secundario})`;
    header.classList.remove('oculto');
    document.getElementById('headerLigaNombre').textContent = liga.nombre;
    const logo = document.getElementById('headerLigaLogo');
    if (liga.logo_url) {
      logo.src = liga.logo_url;
      logo.classList.remove('oculto');
    } else {
      logo.classList.add('oculto');
    }
  } catch (err) {
    // Si falla, seguimos sin header de marca (no bloquea el resto del panel).
  }
}

function conectarEventos() {
  document.getElementById('tabBtnClubes').addEventListener('click', () => cambiarTab('clubes'));
  document.getElementById('tabBtnTorneos').addEventListener('click', () => cambiarTab('torneos'));
  document.getElementById('tabBtnFichajes').addEventListener('click', () => cambiarTab('fichajes'));
  document.getElementById('tabBtnNoticias').addEventListener('click', () => cambiarTab('noticias'));
  document.getElementById('tabBtnNotificaciones').addEventListener('click', () => cambiarTab('notificaciones'));
  document.getElementById('tabBtnFinanzas').addEventListener('click', () => cambiarTab('finanzas'));
  document.getElementById('tabBtnAgenda').addEventListener('click', () => cambiarTab('agenda'));

  // ---- Clubes ----
  document.getElementById('btnMostrarFormClub').addEventListener('click', () => {
    limpiarFormClub();
    document.getElementById('formClub').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormClub').addEventListener('click', () => {
    document.getElementById('formClub').classList.add('oculto');
  });
  document.getElementById('formClub').addEventListener('submit', guardarClub);
  document.getElementById('clubLogoArchivo').addEventListener('change', onElegirLogoClub);
  ['Primario', 'Secundario'].forEach((sufijo) => {
    const input = document.getElementById(`clubColor${sufijo}`);
    const span = document.getElementById(`clubColor${sufijo}Hex`);
    input.addEventListener('input', () => { span.textContent = input.value; });
  });

  document.getElementById('btnCerrarUsuariosClub').addEventListener('click', () => {
    document.getElementById('panelUsuariosClub').classList.add('oculto');
  });
  document.getElementById('formUsuarioClub').addEventListener('submit', crearUsuarioClub);

  // ---- Torneos ----
  document.getElementById('btnMostrarFormTorneo').addEventListener('click', () => {
    document.getElementById('formTorneo').reset();
    document.getElementById('torneoPtsVictoria').value = 3;
    document.getElementById('torneoPtsEmpate').value = 1;
    document.getElementById('torneoFormError').classList.add('oculto');
    document.getElementById('formTorneo').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormTorneo').addEventListener('click', () => {
    document.getElementById('formTorneo').classList.add('oculto');
  });
  document.getElementById('formTorneo').addEventListener('submit', guardarTorneo);

  // ---- Categorías ----
  document.getElementById('btnCerrarCategorias').addEventListener('click', () => {
    document.getElementById('panelCategorias').classList.add('oculto');
    document.getElementById('panelDetalleCategoria').classList.add('oculto');
    torneoActualId = null;
  });
  document.getElementById('btnMostrarFormCategoria').addEventListener('click', () => {
    document.getElementById('formCategoria').reset();
    document.getElementById('categoriaTorneoId').value = torneoActualId;
    document.getElementById('categoriaFormError').classList.add('oculto');
    document.getElementById('formCategoria').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormCategoria').addEventListener('click', () => {
    document.getElementById('formCategoria').classList.add('oculto');
  });
  document.getElementById('formCategoria').addEventListener('submit', guardarCategoria);

  // ---- Detalle de categoría ----
  document.getElementById('btnCerrarDetalleCategoria').addEventListener('click', () => {
    document.getElementById('panelDetalleCategoria').classList.add('oculto');
    categoriaActualId = null;
  });
  document.getElementById('tabBtnEquipos').addEventListener('click', () => cambiarTabDetalle('equipos'));
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTabDetalle('fixture'));
  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTabDetalle('tabla'));

  document.getElementById('btnInscribirClub').addEventListener('click', inscribirClub);

  document.getElementById('btnMostrarFormPartido').addEventListener('click', () => {
    document.getElementById('formPartido').reset();
    document.getElementById('partidoFormError').classList.add('oculto');
    document.getElementById('formPartido').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormPartido').addEventListener('click', () => {
    document.getElementById('formPartido').classList.add('oculto');
  });
  document.getElementById('formPartido').addEventListener('submit', guardarPartido);

  // ---- Fichajes ----
  document.getElementById('filtroEstadoFichaje').addEventListener('change', cargarFichajesLiga);

  // ---- Noticias ----
  document.getElementById('btnMostrarFormNoticia').addEventListener('click', () => {
    document.getElementById('formNoticia').reset();
    document.getElementById('noticiaFormError').classList.add('oculto');
    document.getElementById('formNoticia').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormNoticia').addEventListener('click', () => {
    document.getElementById('formNoticia').classList.add('oculto');
  });
  document.getElementById('formNoticia').addEventListener('submit', guardarNoticia);

  // ---- Notificaciones ----
  document.getElementById('btnMostrarFormNotificacion').addEventListener('click', () => {
    document.getElementById('formNotificacion').reset();
    document.getElementById('notificacionFormError').classList.add('oculto');
    document.getElementById('notificacionFormOk').classList.add('oculto');
    poblarSelectClubesNotificacion();
    document.getElementById('formNotificacion').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormNotificacion').addEventListener('click', () => {
    document.getElementById('formNotificacion').classList.add('oculto');
  });
  document.getElementById('formNotificacion').addEventListener('submit', enviarNotificacion);

  // ---- Finanzas ----
  document.getElementById('btnMostrarFormIngreso').addEventListener('click', () => {
    document.getElementById('formIngreso').reset();
    document.getElementById('ingresoFormError').classList.add('oculto');
    poblarSelectClubesIngreso();
    document.getElementById('formIngreso').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormIngreso').addEventListener('click', () => {
    document.getElementById('formIngreso').classList.add('oculto');
  });
  document.getElementById('formIngreso').addEventListener('submit', guardarIngreso);

  document.getElementById('btnMostrarFormGasto').addEventListener('click', () => {
    document.getElementById('formGasto').reset();
    document.getElementById('gastoFormError').classList.add('oculto');
    document.getElementById('formGasto').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormGasto').addEventListener('click', () => {
    document.getElementById('formGasto').classList.add('oculto');
  });
  document.getElementById('formGasto').addEventListener('submit', guardarGasto);

  // ---- Agenda ----
  document.getElementById('btnMostrarFormEvento').addEventListener('click', () => {
    document.getElementById('formEvento').reset();
    document.getElementById('eventoFormError').classList.add('oculto');
    document.getElementById('formEvento').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormEvento').addEventListener('click', () => {
    document.getElementById('formEvento').classList.add('oculto');
  });
  document.getElementById('formEvento').addEventListener('submit', guardarEvento);
}

function cambiarTab(nombre) {
  const secciones = {
    clubes: 'seccionClubes', torneos: 'seccionTorneos', fichajes: 'seccionFichajes',
    noticias: 'seccionNoticias', notificaciones: 'seccionNotificaciones',
    finanzas: 'seccionFinanzas', agenda: 'seccionAgenda'
  };
  const botones = {
    clubes: 'tabBtnClubes', torneos: 'tabBtnTorneos', fichajes: 'tabBtnFichajes',
    noticias: 'tabBtnNoticias', notificaciones: 'tabBtnNotificaciones',
    finanzas: 'tabBtnFinanzas', agenda: 'tabBtnAgenda'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'torneos' && !torneosCache.length) {
    cargarTorneos();
  }
  if (nombre === 'fichajes') cargarFichajesLiga();
  if (nombre === 'noticias') cargarNoticias();
  if (nombre === 'notificaciones') cargarNotificaciones();
  if (nombre === 'finanzas') cargarFinanzas();
  if (nombre === 'agenda') cargarAgenda();
}

// ===================== FICHAJES (aprobar/rechazar) =====================

async function cargarFichajesLiga() {
  const tbody = document.getElementById('tablaFichajesLiga');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  const estado = document.getElementById('filtroEstadoFichaje').value;
  try {
    const params = estado ? `?estado=${estado}` : '';
    const data = await apiFetch(`/liga/fichajes${params}`);
    const fichajes = data.fichajes;
    if (!fichajes.length) {
      tbody.innerHTML = '<tr><td colspan="6">No hay solicitudes de fichaje en este estado.</td></tr>';
      return;
    }
    const badgesEstado = { pendiente: 'badge-pendiente', aprobado: 'badge-activo', rechazado: 'badge-inactivo' };
    tbody.innerHTML = fichajes.map((f) => `
      <tr>
        <td>${escapeHtml(f.jugador_nombre)} ${escapeHtml(f.jugador_apellido)} ${f.jugador_dni ? `(DNI ${escapeHtml(f.jugador_dni)})` : ''}</td>
        <td>${escapeHtml(f.club_nombre)}</td>
        <td>${escapeHtml(f.torneo_nombre || '-')}</td>
        <td>${escapeHtml(f.categoria_nombre || '-')}</td>
        <td><span class="badge ${badgesEstado[f.estado] || ''}">${escapeHtml(f.estado)}</span></td>
        <td>
          ${f.estado === 'pendiente' ? `
            <button class="btn btn-pequeno" onclick="aprobarFichaje('${f.id}')">Aprobar</button>
            <button class="btn btn-peligro btn-pequeno" onclick="rechazarFichaje('${f.id}')">Rechazar</button>
          ` : (f.motivo_rechazo ? `<span class="texto-ayuda">Motivo: ${escapeHtml(f.motivo_rechazo)}</span>` : '-')}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function aprobarFichaje(fichajeId) {
  try {
    await apiFetch(`/liga/fichajes/${fichajeId}/aprobar`, { method: 'PATCH' });
    cargarFichajesLiga();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rechazarFichaje(fichajeId) {
  const motivo = prompt('Motivo del rechazo (opcional):');
  if (motivo === null) return;
  try {
    await apiFetch(`/liga/fichajes/${fichajeId}/rechazar`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo_rechazo: motivo.trim() || undefined })
    });
    cargarFichajesLiga();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== CLUBES =====================

async function cargarClubes() {
  const tbody = document.getElementById('tablaClubes');
  try {
    const data = await apiFetch('/liga/clubes');
    clubesCache = data.clubes;
    if (!clubesCache.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no cargaste ningún club.</td></tr>';
      return;
    }
    tbody.innerHTML = clubesCache.map((club) => `
      <tr>
        <td>${club.logo_url ? `<img class="logo-miniatura" src="${club.logo_url}" alt="">` : '<span class="logo-miniatura"></span>'}</td>
        <td>${escapeHtml(club.nombre)}</td>
        <td>${escapeHtml(club.cuit || '-')}</td>
        <td><span class="badge ${club.activo_en_liga ? 'badge-activo' : 'badge-inactivo'}">${club.activo_en_liga ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="editarClub('${club.id}')">Editar</button>
          <button class="btn btn-secundario btn-pequeno" onclick="verUsuariosClub('${club.id}', '${escapeHtml(club.nombre)}')">Usuarios</button>
          <button class="btn ${club.activo_en_liga ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoClub('${club.id}', ${!club.activo_en_liga})">${club.activo_en_liga ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function onElegirLogoClub(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    clubLogoBase64Actual = lector.result;
    const preview = document.getElementById('clubLogoPreview');
    preview.src = clubLogoBase64Actual;
    preview.classList.remove('oculto');
    document.getElementById('clubLogoUrl').value = clubLogoBase64Actual;
  };
  lector.readAsDataURL(archivo);
}

function limpiarFormClub() {
  document.getElementById('clubIdEdicion').value = '';
  document.getElementById('clubNombre').value = '';
  document.getElementById('clubCuit').value = '';
  document.getElementById('clubDireccion').value = '';
  document.getElementById('clubTelefono').value = '';
  document.getElementById('clubEmail').value = '';
  document.getElementById('clubLogoUrl').value = '';
  document.getElementById('clubLogoArchivo').value = '';
  document.getElementById('clubLogoPreview').classList.add('oculto');
  clubLogoBase64Actual = '';
  document.getElementById('clubColorPrimario').value = '#1d4ed8';
  document.getElementById('clubColorPrimarioHex').textContent = '#1d4ed8';
  document.getElementById('clubColorSecundario').value = '#1e3a8a';
  document.getElementById('clubColorSecundarioHex').textContent = '#1e3a8a';
  document.getElementById('clubFormError').classList.add('oculto');
}

function editarClub(clubId) {
  const club = clubesCache.find((c) => c.id === clubId);
  if (!club) return;
  document.getElementById('clubIdEdicion').value = club.id;
  document.getElementById('clubNombre').value = club.nombre || '';
  document.getElementById('clubCuit').value = club.cuit || '';
  document.getElementById('clubDireccion').value = club.direccion || '';
  document.getElementById('clubTelefono').value = club.telefono || '';
  document.getElementById('clubEmail').value = club.email_contacto || '';
  document.getElementById('clubLogoUrl').value = club.logo_url || '';
  clubLogoBase64Actual = club.logo_url || '';
  const preview = document.getElementById('clubLogoPreview');
  if (club.logo_url) {
    preview.src = club.logo_url;
    preview.classList.remove('oculto');
  } else {
    preview.classList.add('oculto');
  }
  document.getElementById('clubLogoArchivo').value = '';
  document.getElementById('clubColorPrimario').value = club.color_primario || '#1d4ed8';
  document.getElementById('clubColorPrimarioHex').textContent = club.color_primario || '#1d4ed8';
  document.getElementById('clubColorSecundario').value = club.color_secundario || '#1e3a8a';
  document.getElementById('clubColorSecundarioHex').textContent = club.color_secundario || '#1e3a8a';
  document.getElementById('clubFormError').classList.add('oculto');
  document.getElementById('formClub').classList.remove('oculto');
}

async function guardarClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('clubFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('clubIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('clubNombre').value.trim(),
    cuit: document.getElementById('clubCuit').value.trim() || undefined,
    direccion: document.getElementById('clubDireccion').value.trim() || undefined,
    telefono: document.getElementById('clubTelefono').value.trim() || undefined,
    email_contacto: document.getElementById('clubEmail').value.trim() || undefined,
    logo_url: document.getElementById('clubLogoUrl').value || undefined,
    color_primario: document.getElementById('clubColorPrimario').value,
    color_secundario: document.getElementById('clubColorSecundario').value
  };

  try {
    if (id) {
      await apiFetch(`/liga/clubes/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/clubes', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
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

// ===================== TORNEOS =====================

async function cargarTorneos() {
  const tbody = document.getElementById('tablaTorneos');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/torneos');
    torneosCache = data.torneos;
    if (!torneosCache.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no cargaste ningún torneo.</td></tr>';
      return;
    }
    tbody.innerHTML = torneosCache.map((t) => `
      <tr>
        <td>${escapeHtml(t.nombre)}</td>
        <td>${escapeHtml(t.deporte)}</td>
        <td><span class="badge badge-activo">${escapeHtml(t.estado || 'planificado')}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="verCategorias('${t.id}', '${escapeHtml(t.nombre)}')">Categorías</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarTorneo(e) {
  e.preventDefault();
  const errorEl = document.getElementById('torneoFormError');
  errorEl.classList.add('oculto');

  const ptsVictoria = Number(document.getElementById('torneoPtsVictoria').value || 3);
  const ptsEmpate = Number(document.getElementById('torneoPtsEmpate').value || 0);

  const cuerpo = {
    nombre: document.getElementById('torneoNombre').value.trim(),
    deporte: document.getElementById('torneoDeporte').value,
    temporada: document.getElementById('torneoTemporada').value.trim() || undefined,
    formato_juego: document.getElementById('torneoFormato').value,
    sistema_puntaje: {
      victoria: ptsVictoria,
      empate: ptsEmpate,
      derrota: 0
    }
  };

  try {
    await apiFetch('/liga/torneos', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formTorneo').classList.add('oculto');
    cargarTorneos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== CATEGORÍAS =====================

function verCategorias(torneoId, nombreTorneo) {
  torneoActualId = torneoId;
  torneoActualNombre = nombreTorneo;
  document.getElementById('panelCategorias').classList.remove('oculto');
  document.getElementById('panelDetalleCategoria').classList.add('oculto');
  document.getElementById('tituloCategorias').textContent = `Categorías de "${nombreTorneo}"`;
  document.getElementById('formCategoria').classList.add('oculto');
  cargarCategorias(torneoId);
}

async function cargarCategorias(torneoId) {
  const tbody = document.getElementById('tablaCategorias');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoId}/categorias`);
    categoriasCache = data.categorias;
    if (!categoriasCache.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay categorías en este torneo.</td></tr>';
      return;
    }
    tbody.innerHTML = categoriasCache.map((c) => `
      <tr>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${escapeHtml(c.genero || '-')}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="verDetalleCategoria('${c.id}', '${escapeHtml(c.nombre)}')">Ver detalle</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarCategoria(e) {
  e.preventDefault();
  const errorEl = document.getElementById('categoriaFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    nombre: document.getElementById('categoriaNombre').value.trim(),
    genero: document.getElementById('categoriaGenero').value || undefined
  };

  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias`, { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formCategoria').classList.add('oculto');
    cargarCategorias(torneoActualId);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== DETALLE DE CATEGORÍA (equipos / fixture / tabla) =====================

function verDetalleCategoria(categoriaId, nombreCategoria) {
  categoriaActualId = categoriaId;
  categoriaActualNombre = nombreCategoria;
  document.getElementById('panelDetalleCategoria').classList.remove('oculto');
  document.getElementById('tituloDetalleCategoria').textContent = `${nombreCategoria} — ${torneoActualNombre}`;
  cambiarTabDetalle('equipos');
}

function cambiarTabDetalle(nombre) {
  const secciones = { equipos: 'subSeccionEquipos', fixture: 'subSeccionFixture', tabla: 'subSeccionTabla' };
  const botones = { equipos: 'tabBtnEquipos', fixture: 'tabBtnFixture', tabla: 'tabBtnTabla' };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'equipos') cargarEquipos();
  if (nombre === 'fixture') cargarPartidos();
  if (nombre === 'tabla') cargarTabla();
}

async function cargarEquipos() {
  const tbody = document.getElementById('tablaEquipos');
  const select = document.getElementById('selectClubInscribir');
  tbody.innerHTML = '<tr><td>Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos`);
    equiposCache = data.equipos;

    if (!equiposCache.length) {
      tbody.innerHTML = '<tr><td>Todavía no hay clubes inscriptos en esta categoría.</td></tr>';
    } else {
      tbody.innerHTML = equiposCache.map((eq) => `<tr><td>${escapeHtml(eq.club_nombre)}</td></tr>`).join('');
    }

    const idsInscriptos = new Set(equiposCache.map((eq) => eq.club_id));
    const disponibles = clubesCache.filter((c) => !idsInscriptos.has(c.id));
    if (!disponibles.length) {
      select.innerHTML = '<option value="">No hay clubes disponibles para inscribir</option>';
    } else {
      select.innerHTML = disponibles.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td>Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function inscribirClub() {
  const errorEl = document.getElementById('equipoFormError');
  errorEl.classList.add('oculto');
  const select = document.getElementById('selectClubInscribir');
  const clubId = select.value;
  if (!clubId) {
    errorEl.textContent = 'No hay ningún club seleccionado para inscribir.';
    errorEl.classList.remove('oculto');
    return;
  }
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos`, {
      method: 'POST',
      body: JSON.stringify({ club_id: clubId })
    });
    cargarEquipos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function cargarPartidos() {
  const tbody = document.getElementById('tablaPartidos');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

  // Aseguramos tener los equipos ya cargados para poblar los selects del form.
  if (!equiposCache.length) {
    try {
      const dataEquipos = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos`);
      equiposCache = dataEquipos.equipos;
    } catch (err) {
      // seguimos igual; el select va a quedar vacío
    }
  }
  const opcionesEquipos = equiposCache.map((eq) => `<option value="${eq.id}">${escapeHtml(eq.club_nombre)}</option>`).join('');
  document.getElementById('partidoLocal').innerHTML = opcionesEquipos;
  document.getElementById('partidoVisitante').innerHTML = opcionesEquipos;

  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos`);
    partidosCache = data.partidos;
    if (!partidosCache.length) {
      tbody.innerHTML = '<tr><td colspan="6">Todavía no hay partidos programados.</td></tr>';
      return;
    }
    tbody.innerHTML = partidosCache.map((p) => `
      <tr>
        <td>${p.jornada != null ? p.jornada : '-'}</td>
        <td>${escapeHtml(p.club_local_nombre)}</td>
        <td>${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'Sin jugar'}</td>
        <td>${escapeHtml(p.club_visitante_nombre)}</td>
        <td><span class="badge ${p.estado === 'jugado' ? 'badge-activo' : 'badge-inactivo'}">${escapeHtml(p.estado || 'programado')}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="cargarResultadoPartido('${p.id}')">Cargar resultado</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarPartido(e) {
  e.preventDefault();
  const errorEl = document.getElementById('partidoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    equipo_local_id: document.getElementById('partidoLocal').value,
    equipo_visitante_id: document.getElementById('partidoVisitante').value,
    jornada: document.getElementById('partidoJornada').value || undefined,
    fecha: document.getElementById('partidoFecha').value || undefined
  };

  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos`, {
      method: 'POST',
      body: JSON.stringify(cuerpo)
    });
    document.getElementById('formPartido').classList.add('oculto');
    cargarPartidos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function cargarResultadoPartido(partidoId) {
  const resultadoLocal = prompt('Goles/puntos del equipo local:');
  if (resultadoLocal === null) return;
  const resultadoVisitante = prompt('Goles/puntos del equipo visitante:');
  if (resultadoVisitante === null) return;

  if (resultadoLocal.trim() === '' || resultadoVisitante.trim() === '' || isNaN(Number(resultadoLocal)) || isNaN(Number(resultadoVisitante))) {
    alert('Los dos resultados tienen que ser números.');
    return;
  }

  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}/resultado`, {
      method: 'PUT',
      body: JSON.stringify({
        resultado_local: Number(resultadoLocal),
        resultado_visitante: Number(resultadoVisitante)
      })
    });
    cargarPartidos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function cargarTabla() {
  const tbody = document.getElementById('tablaPosiciones');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/tabla`);
    const tabla = data.tabla;
    if (!tabla.length) {
      tbody.innerHTML = '<tr><td colspan="9">Todavía no hay datos de tabla para esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = tabla.map((fila) => `
      <tr>
        <td>${escapeHtml(fila.club_nombre)}</td>
        <td>${fila.partidos_jugados}</td>
        <td>${fila.ganados}</td>
        <td>${fila.empatados}</td>
        <td>${fila.perdidos}</td>
        <td>${fila.a_favor}</td>
        <td>${fila.en_contra}</td>
        <td>${fila.diferencia}</td>
        <td>${fila.puntos}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

// ===================== NOTICIAS =====================

async function cargarNoticias() {
  const tbody = document.getElementById('tablaNoticias');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/noticias');
    const noticias = data.noticias;
    if (!noticias.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no publicaste ninguna noticia.</td></tr>';
      return;
    }
    const badgesEstado = { publicada: 'badge-activo', borrador: 'badge-pendiente', archivada: 'badge-inactivo' };
    tbody.innerHTML = noticias.map((n) => `
      <tr>
        <td>${escapeHtml(n.titulo)}</td>
        <td><span class="badge ${badgesEstado[n.estado] || ''}">${escapeHtml(n.estado)}</span></td>
        <td>${n.destacada ? 'Sí' : '-'}</td>
        <td>${new Date(n.publicado_at).toLocaleDateString('es-AR')}</td>
        <td>
          ${n.estado !== 'publicada' ? `<button class="btn btn-secundario btn-pequeno" onclick="cambiarEstadoNoticia('${n.id}', 'publicada')">Publicar</button>` : ''}
          ${n.estado !== 'archivada' ? `<button class="btn btn-secundario btn-pequeno" onclick="cambiarEstadoNoticia('${n.id}', 'archivada')">Archivar</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarNoticia(e) {
  e.preventDefault();
  const errorEl = document.getElementById('noticiaFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    titulo: document.getElementById('noticiaTitulo').value.trim(),
    contenido: document.getElementById('noticiaContenido').value.trim(),
    imagen_url: document.getElementById('noticiaImagenUrl').value.trim() || undefined,
    destacada: document.getElementById('noticiaDestacada').checked
  };

  try {
    await apiFetch('/liga/noticias', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formNoticia').classList.add('oculto');
    cargarNoticias();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function cambiarEstadoNoticia(noticiaId, nuevoEstado) {
  try {
    await apiFetch(`/liga/noticias/${noticiaId}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: nuevoEstado })
    });
    cargarNoticias();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== NOTIFICACIONES =====================

function poblarSelectClubesNotificacion() {
  const select = document.getElementById('notificacionClub');
  const opciones = clubesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  select.innerHTML = '<option value="">Todos los clubes de la Liga</option>' + opciones;
}

async function cargarNotificaciones() {
  const tbody = document.getElementById('tablaNotificaciones');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/notificaciones');
    const notificaciones = data.notificaciones;
    if (!notificaciones.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no enviaste ninguna notificación.</td></tr>';
      return;
    }
    tbody.innerHTML = notificaciones.map((n) => `
      <tr>
        <td>${escapeHtml(n.titulo)}</td>
        <td>${escapeHtml(n.club_nombre || 'Todos los clubes')}</td>
        <td>${escapeHtml(n.tipo)}</td>
        <td>${new Date(n.creado_at).toLocaleDateString('es-AR')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function enviarNotificacion(e) {
  e.preventDefault();
  const errorEl = document.getElementById('notificacionFormError');
  const okEl = document.getElementById('notificacionFormOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const cuerpo = {
    titulo: document.getElementById('notificacionTitulo').value.trim(),
    mensaje: document.getElementById('notificacionMensaje').value.trim(),
    tipo: document.getElementById('notificacionTipo').value,
    club_id: document.getElementById('notificacionClub').value || undefined
  };

  try {
    await apiFetch('/liga/notificaciones', { method: 'POST', body: JSON.stringify(cuerpo) });
    okEl.textContent = 'Notificación enviada correctamente.';
    okEl.classList.remove('oculto');
    document.getElementById('formNotificacion').reset();
    cargarNotificaciones();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== FINANZAS (Gastos e Ingresos) =====================

function poblarSelectClubesIngreso() {
  const select = document.getElementById('ingresoClub');
  const opciones = clubesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  select.innerHTML = '<option value="">Sin asociar a un club</option>' + opciones;
}

function formatearMonto(monto) {
  return '$' + Number(monto).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

async function cargarFinanzas() {
  await Promise.all([cargarIngresos(), cargarGastos()]);
}

async function cargarIngresos() {
  const tbody = document.getElementById('tablaIngresos');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/ingresos');
    const ingresos = data.ingresos;
    const total = ingresos.reduce((acc, i) => acc + Number(i.monto), 0);
    document.getElementById('totalIngresos').textContent = formatearMonto(total);

    if (!ingresos.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no cargaste ningún ingreso.</td></tr>';
      return;
    }
    tbody.innerHTML = ingresos.map((i) => `
      <tr>
        <td>${escapeHtml(i.concepto)}</td>
        <td>${escapeHtml(i.club_nombre || '-')}</td>
        <td>${formatearMonto(i.monto)}</td>
        <td>${new Date(i.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="borrarIngreso('${i.id}')">Borrar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarIngreso(e) {
  e.preventDefault();
  const errorEl = document.getElementById('ingresoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    concepto: document.getElementById('ingresoConcepto').value.trim(),
    monto: document.getElementById('ingresoMonto').value,
    fecha: document.getElementById('ingresoFecha').value || undefined,
    club_id: document.getElementById('ingresoClub').value || undefined,
    categoria: document.getElementById('ingresoCategoria').value.trim() || undefined
  };

  try {
    await apiFetch('/liga/ingresos', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formIngreso').classList.add('oculto');
    cargarIngresos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function borrarIngreso(ingresoId) {
  if (!confirm('¿Borrar este ingreso?')) return;
  try {
    await apiFetch(`/liga/ingresos/${ingresoId}`, { method: 'DELETE' });
    cargarIngresos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function cargarGastos() {
  const tbody = document.getElementById('tablaGastos');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/gastos');
    const gastos = data.gastos;
    const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
    document.getElementById('totalGastos').textContent = formatearMonto(total);

    if (!gastos.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no cargaste ningún gasto.</td></tr>';
      return;
    }
    tbody.innerHTML = gastos.map((g) => `
      <tr>
        <td>${escapeHtml(g.concepto)}</td>
        <td>${escapeHtml(g.categoria || '-')}</td>
        <td>${formatearMonto(g.monto)}</td>
        <td>${new Date(g.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="borrarGasto('${g.id}')">Borrar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarGasto(e) {
  e.preventDefault();
  const errorEl = document.getElementById('gastoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    concepto: document.getElementById('gastoConcepto').value.trim(),
    monto: document.getElementById('gastoMonto').value,
    fecha: document.getElementById('gastoFecha').value || undefined,
    categoria: document.getElementById('gastoCategoria').value.trim() || undefined
  };

  try {
    await apiFetch('/liga/gastos', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formGasto').classList.add('oculto');
    cargarGastos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function borrarGasto(gastoId) {
  if (!confirm('¿Borrar este gasto?')) return;
  try {
    await apiFetch(`/liga/gastos/${gastoId}`, { method: 'DELETE' });
    cargarGastos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== AGENDA =====================

async function cargarAgenda() {
  const tbody = document.getElementById('tablaAgenda');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/agenda');
    const eventos = data.eventos;
    if (!eventos.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no cargaste ningún evento.</td></tr>';
      return;
    }
    tbody.innerHTML = eventos.map((ev) => `
      <tr>
        <td>${new Date(ev.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}${ev.hora ? ' ' + ev.hora.slice(0, 5) : ''}</td>
        <td>${escapeHtml(ev.titulo)}</td>
        <td>${escapeHtml(ev.tipo)}</td>
        <td>${escapeHtml(ev.lugar || '-')}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="borrarEvento('${ev.id}')">Borrar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarEvento(e) {
  e.preventDefault();
  const errorEl = document.getElementById('eventoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    titulo: document.getElementById('eventoTitulo').value.trim(),
    tipo: document.getElementById('eventoTipo').value,
    fecha: document.getElementById('eventoFecha').value,
    hora: document.getElementById('eventoHora').value || undefined,
    lugar: document.getElementById('eventoLugar').value.trim() || undefined,
    descripcion: document.getElementById('eventoDescripcion').value.trim() || undefined
  };

  try {
    await apiFetch('/liga/agenda', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formEvento').classList.add('oculto');
    cargarAgenda();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function borrarEvento(eventoId) {
  if (!confirm('¿Borrar este evento?')) return;
  try {
    await apiFetch(`/liga/agenda/${eventoId}`, { method: 'DELETE' });
    cargarAgenda();
  } catch (err) {
    alert('Error: ' + err.message);
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
