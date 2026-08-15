// Lógica del Panel de Liga: Clubes + Torneos/Categorías/Equipos/Fixture/Tabla.

let clubesCache = [];
let torneosCache = [];
let categoriasCache = [];
let equiposCache = [];
let partidosCache = [];

let torneoActualId = null;
let torneoActualNombre = '';
let categoriaActualId = null;
let categoriaActualNombre = '';

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
  document.getElementById('tabBtnNoticias').addEventListener('click', () => cambiarTab('noticias'));
  document.getElementById('tabBtnNotificaciones').addEventListener('click', () => cambiarTab('notificaciones'));

  // ---- Clubes ----
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
}

function cambiarTab(nombre) {
  const secciones = {
    clubes: 'seccionClubes', torneos: 'seccionTorneos',
    noticias: 'seccionNoticias', notificaciones: 'seccionNotificaciones'
  };
  const botones = {
    clubes: 'tabBtnClubes', torneos: 'tabBtnTorneos',
    noticias: 'tabBtnNoticias', notificaciones: 'tabBtnNotificaciones'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'torneos' && !torneosCache.length) {
    cargarTorneos();
  }
  if (nombre === 'noticias') cargarNoticias();
  if (nombre === 'notificaciones') cargarNotificaciones();
}

// ===================== CLUBES (sin cambios) =====================

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

function escapeHtml(texto) {
  if (texto == null) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);
