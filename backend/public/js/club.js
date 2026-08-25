// Lógica del Panel de Club: Jugadores + Fichajes/Carnets.

const ICONO_PERSONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

// Foto de un jugador/socio en listados y en el carnet digital: si no tiene
// foto cargada, en vez de dejar el círculo vacío se simula una foto de
// carnet (silueta genérica de persona) para que se vea como un carnet real
// al que todavía no se le subió la fotito.
function fotoJugadorHtml(fotoUrl, clase) {
  if (fotoUrl) return `<img src="${fotoUrl}" alt="" class="${clase}">`;
  return `<span class="${clase} sin-foto">${ICONO_PERSONA}</span>`;
}

let jugadoresCache = [];
let ligasClubCache = [];
let fichajesCache = [];
let jugadoresSeleccionados = new Set();
let fichajeJugadorIdsActual = [];
let categoriasFichajeCache = [];
let jugadorIdEdicion = null;
let actividadesCache = [];
let categoriasSocioCache = [];
let miClubId = null;

function init() {
  const usuario = requerirRol(['club_admin', 'super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  conectarEventos();
  cargarJugadores();
  cargarOpcionesActividadCategoria();
  actualizarBadgeSolicitudesPendientes();
}

function conectarEventos() {
  document.getElementById('tabBtnJugadores').addEventListener('click', () => cambiarTab('jugadores'));
  document.getElementById('tabBtnFichajes').addEventListener('click', () => cambiarTab('fichajes'));
  document.getElementById('tabBtnMisTorneos').addEventListener('click', () => cambiarTab('misTorneos'));
  document.getElementById('tabBtnNotificaciones').addEventListener('click', () => cambiarTab('notificaciones'));
  document.getElementById('tabBtnDocumentos').addEventListener('click', () => cambiarTab('documentos'));
  document.getElementById('tabBtnConfiguracion').addEventListener('click', () => cambiarTab('configuracion'));
  document.getElementById('formDocumentoClub').addEventListener('submit', subirDocumentoClub);

  document.getElementById('btnVerSolicitudesSocios').addEventListener('click', abrirSolicitudesSocios);
  document.getElementById('btnCerrarSolicitudesSocios').addEventListener('click', cerrarSolicitudesSocios);
  document.getElementById('formActividad').addEventListener('submit', agregarActividad);
  document.getElementById('formCategoriaSocio').addEventListener('submit', agregarCategoriaSocio);
  document.getElementById('btnCompartirRegistroSocios').addEventListener('click', compartirLinkRegistroSocios);
  document.getElementById('btnDescargarQrSocios').addEventListener('click', descargarQrRegistroSocios);

  document.getElementById('btnMostrarFormJugador').addEventListener('click', () => {
    jugadorIdEdicion = null;
    document.getElementById('formJugador').reset();
    document.getElementById('jugadorFotoUrl').value = '';
    document.getElementById('jugadorFotoPreview').classList.add('oculto');
    document.getElementById('jugadorFormError').classList.add('oculto');
    document.querySelector('#formJugador button[type="submit"]').textContent = 'Guardar';
    document.getElementById('formJugador').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormJugador').addEventListener('click', () => {
    jugadorIdEdicion = null;
    document.getElementById('formJugador').classList.add('oculto');
  });
  document.getElementById('jugadorFotoArchivo').addEventListener('change', onElegirFotoJugador);
  document.getElementById('formJugador').addEventListener('submit', guardarJugador);

  document.getElementById('buscadorJugadores').addEventListener('input', renderJugadores);
  document.getElementById('filtroAnioNacimientoJugadores').addEventListener('change', renderJugadores);
  document.getElementById('filtroActividadJugadores').addEventListener('change', renderJugadores);
  document.getElementById('filtroCategoriaSocioJugadores').addEventListener('change', renderJugadores);
  document.getElementById('checkTodosJugadores').addEventListener('change', (e) => {
    const marcar = e.target.checked;
    document.querySelectorAll('.check-jugador').forEach((chk) => {
      chk.checked = marcar;
      toggleSeleccionJugador(chk.dataset.jugadorId, marcar);
    });
  });
  document.getElementById('btnMostrarFichajeMasivo').addEventListener('click', abrirFichajeMasivo);

  document.getElementById('btnCerrarSolicitarFichaje').addEventListener('click', () => {
    document.getElementById('panelSolicitarFichaje').classList.add('oculto');
  });
  document.getElementById('fichajeLiga').addEventListener('change', onCambioLigaFichaje);
  document.getElementById('fichajeTorneo').addEventListener('change', onCambioTorneoFichaje);
  document.getElementById('fichajeCategoria').addEventListener('change', onCambioCategoriaFichaje);
  document.getElementById('formSolicitarFichaje').addEventListener('submit', enviarSolicitudFichaje);

  document.getElementById('buscadorFichajes').addEventListener('input', renderFichajes);
  document.getElementById('filtroLigaFichajes').addEventListener('change', () => {
    poblarFiltroTorneoFichajes();
    poblarFiltroCategoriaFichajes();
    poblarFiltroSubcategoriaFichajes();
    renderFichajes();
  });
  document.getElementById('filtroTorneoFichajes').addEventListener('change', () => {
    poblarFiltroCategoriaFichajes();
    poblarFiltroSubcategoriaFichajes();
    renderFichajes();
  });
  document.getElementById('filtroCategoriaFichajes').addEventListener('change', () => {
    poblarFiltroSubcategoriaFichajes();
    renderFichajes();
  });
  document.getElementById('filtroSubcategoriaFichajes').addEventListener('change', renderFichajes);
  document.getElementById('btnCerrarVerCarnet').addEventListener('click', cerrarCarnet);
}

function cambiarTab(nombre) {
  const secciones = {
    jugadores: 'seccionJugadores', fichajes: 'seccionFichajes', misTorneos: 'seccionMisTorneos',
    notificaciones: 'seccionNotificaciones', documentos: 'seccionDocumentos', configuracion: 'seccionConfiguracion'
  };
  const botones = {
    jugadores: 'tabBtnJugadores', fichajes: 'tabBtnFichajes', misTorneos: 'tabBtnMisTorneos',
    notificaciones: 'tabBtnNotificaciones', documentos: 'tabBtnDocumentos', configuracion: 'tabBtnConfiguracion'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'fichajes') cargarFichajes();
  if (nombre === 'misTorneos') cargarMisTorneos();
  if (nombre === 'notificaciones') cargarNotificacionesClub();
  if (nombre === 'documentos') cargarDocumentosClub();
  if (nombre === 'configuracion') cargarConfiguracion();
}

// ===================== MIS TORNEOS =====================

async function cargarMisTorneos() {
  const contenedor = document.getElementById('listaMisTorneos');
  contenedor.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch('/club/torneos');
    renderMisTorneos(data.torneos);
  } catch (err) {
    contenedor.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderMisTorneos(torneos) {
  const contenedor = document.getElementById('listaMisTorneos');
  if (!torneos.length) {
    contenedor.innerHTML = '<p class="texto-ayuda">Tu club todavía no está inscripto en ningún torneo.</p>';
    return;
  }

  const ligasOrdenadas = Array.from(new Set(torneos.map((t) => t.liga_nombre)));

  contenedor.innerHTML = ligasOrdenadas.map((ligaNombre) => {
    const deLaLiga = torneos.filter((t) => t.liga_nombre === ligaNombre);
    const tarjetas = deLaLiga.map((t) => {
      const urlTorneo = (tab) => {
        const params = new URLSearchParams({ id: t.torneo_id, nombre: t.torneo_nombre, categoriaId: t.categoria_id, tab });
        if (t.subcategoria_id) params.set('subcategoriaId', t.subcategoria_id);
        return `/sitio/torneo.html?${params.toString()}`;
      };
      const divisionTexto = t.subcategoria_nombre ? `${t.categoria_nombre} · ${t.subcategoria_nombre}` : t.categoria_nombre;
      const jugadores = t.jugadores || [];
      const listaJugadores = jugadores.length
        ? `<ul class="lista-jugadores-fichados-club">${jugadores.slice(0, 6).map((j) => `<li>${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}</li>`).join('')}${jugadores.length > 6 ? `<li>... y ${jugadores.length - 6} más</li>` : ''}</ul>`
        : '';
      return `
        <div class="tarjeta-torneo-club">
          <h4>${escapeHtml(t.torneo_nombre)}</h4>
          <div class="division-torneo-club">${escapeHtml(divisionTexto)}</div>
          <div class="jugadores-fichados-club">
            <strong>${t.jugadores_fichados}</strong> jugador(es) fichado(s)
            ${listaJugadores}
          </div>
          <div class="links-torneo-club">
            <a href="${urlTorneo('tabla')}" target="_blank">Tabla</a>
            <a href="${urlTorneo('fixture')}" target="_blank">Fixture</a>
            <a href="${urlTorneo('goleadores')}" target="_blank">Goleadores</a>
            <a href="${urlTorneo('tarjetas')}" target="_blank">Tarjetas</a>
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="grupo-liga-torneos">
        <h3>${escapeHtml(ligaNombre)}</h3>
        <div class="grid-torneos-club">${tarjetas}</div>
      </div>
    `;
  }).join('');
}

// ===================== DOCUMENTOS =====================

async function cargarDocumentosClub() {
  const tbody = document.getElementById('tablaDocumentosClub');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/documentos');
    const documentos = data.documentos;
    if (!documentos.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay documentos cargados.</td></tr>';
      return;
    }
    tbody.innerHTML = documentos.map((d) => `
      <tr>
        <td><a href="${d.archivo_url}" download="${escapeHtml(d.nombre)}" target="_blank">${escapeHtml(d.nombre)}</a></td>
        <td>${d.subido_por_rol === 'club' ? 'Tu Club' : 'La Liga'}</td>
        <td>${new Date(d.creado_at).toLocaleDateString('es-AR')}</td>
        <td>${d.subido_por_rol === 'club' ? `<button class="btn btn-peligro btn-pequeno" onclick="eliminarDocumentoClub('${d.id}')">Eliminar</button>` : '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function subirDocumentoClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('documentoFormError');
  errorEl.classList.add('oculto');

  const nombre = document.getElementById('documentoNombre').value.trim();
  const archivo = document.getElementById('documentoArchivo').files[0];
  if (!archivo) {
    errorEl.textContent = 'Elegí un archivo.';
    errorEl.classList.remove('oculto');
    return;
  }

  const lector = new FileReader();
  lector.onload = async () => {
    try {
      await apiFetch('/club/documentos', {
        method: 'POST',
        body: JSON.stringify({ nombre, archivo_url: lector.result })
      });
      document.getElementById('formDocumentoClub').reset();
      cargarDocumentosClub();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('oculto');
    }
  };
  lector.readAsDataURL(archivo);
}

async function eliminarDocumentoClub(documentoId) {
  if (!confirm('¿Eliminar este documento?')) return;
  try {
    await apiFetch(`/club/documentos/${documentoId}`, { method: 'DELETE' });
    cargarDocumentosClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== CONFIGURACIÓN (Actividades / Categorías / QR socios) =====================

async function cargarOpcionesActividadCategoria() {
  try {
    const [actividades, categorias] = await Promise.all([
      apiFetch('/club/configuracion/actividades'),
      apiFetch('/club/configuracion/categorias')
    ]);
    actividadesCache = actividades.actividades.filter((a) => a.activo);
    categoriasSocioCache = categorias.categorias.filter((c) => c.activo);
    const selectActividad = document.getElementById('jugadorActividad');
    selectActividad.innerHTML = '<option value="">Sin especificar</option>' +
      actividadesCache.map((a) => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
    const selectCategoria = document.getElementById('jugadorCategoriaSocio');
    selectCategoria.innerHTML = '<option value="">Sin especificar</option>' +
      categoriasSocioCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    poblarFiltroActividad();
    poblarFiltroCategoriaSocio();
  } catch (err) {
    // si falla, el jugador se puede seguir cargando igual sin estos campos
  }
}

function poblarFiltroActividad() {
  const select = document.getElementById('filtroActividadJugadores');
  const valorActual = select.value;
  const activas = actividadesCache.filter((a) => a.activo);
  select.innerHTML = '<option value="">Todas las actividades</option>' +
    activas.map((a) => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
  if (activas.some((a) => a.id === valorActual)) select.value = valorActual;
}

function poblarFiltroCategoriaSocio() {
  const select = document.getElementById('filtroCategoriaSocioJugadores');
  const valorActual = select.value;
  const activas = categoriasSocioCache.filter((c) => c.activo);
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    activas.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  if (activas.some((c) => c.id === valorActual)) select.value = valorActual;
}

async function cargarConfiguracion() {
  await Promise.all([cargarActividades(), cargarCategoriasSocio(), pintarLinkYQrRegistroSocios()]);
}

async function cargarActividades() {
  const tbody = document.getElementById('tablaActividades');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/configuracion/actividades');
    actividadesCache = data.actividades;
    if (!actividadesCache.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no cargaste ninguna actividad.</td></tr>';
    } else {
      tbody.innerHTML = actividadesCache.map((a) => `
        <tr>
          <td>${escapeHtml(a.nombre)}</td>
          <td><span class="badge ${a.activo ? 'badge-activo' : 'badge-inactivo'}">${a.activo ? 'Activa' : 'Inactiva'}</span></td>
          <td>
            <button class="btn ${a.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoActividad('${a.id}', ${!a.activo})">${a.activo ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-peligro btn-pequeno" onclick="eliminarActividad('${a.id}')">Eliminar</button>
          </td>
        </tr>
      `).join('');
    }
    // refresca también los <select> del form de jugador y del filtro con la lista activa
    const selectActividad = document.getElementById('jugadorActividad');
    selectActividad.innerHTML = '<option value="">Sin especificar</option>' +
      actividadesCache.filter((a) => a.activo).map((a) => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
    poblarFiltroActividad();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function agregarActividad(e) {
  e.preventDefault();
  const errorEl = document.getElementById('actividadFormError');
  errorEl.classList.add('oculto');
  const input = document.getElementById('nombreNuevaActividad');
  try {
    await apiFetch('/club/configuracion/actividades', { method: 'POST', body: JSON.stringify({ nombre: input.value.trim() }) });
    input.value = '';
    cargarActividades();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function toggleActivoActividad(id, nuevoValor) {
  try {
    await apiFetch(`/club/configuracion/actividades/${id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo: nuevoValor }) });
    cargarActividades();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarActividad(id) {
  if (!confirm('¿Eliminar esta actividad?')) return;
  try {
    await apiFetch(`/club/configuracion/actividades/${id}`, { method: 'DELETE' });
    cargarActividades();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function cargarCategoriasSocio() {
  const tbody = document.getElementById('tablaCategoriasSocio');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/configuracion/categorias');
    categoriasSocioCache = data.categorias;
    if (!categoriasSocioCache.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no cargaste ninguna categoría.</td></tr>';
    } else {
      tbody.innerHTML = categoriasSocioCache.map((c) => `
        <tr>
          <td>${escapeHtml(c.nombre)}</td>
          <td><span class="badge ${c.activo ? 'badge-activo' : 'badge-inactivo'}">${c.activo ? 'Activa' : 'Inactiva'}</span></td>
          <td>
            <button class="btn ${c.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoCategoriaSocio('${c.id}', ${!c.activo})">${c.activo ? 'Desactivar' : 'Activar'}</button>
            <button class="btn btn-peligro btn-pequeno" onclick="eliminarCategoriaSocio('${c.id}')">Eliminar</button>
          </td>
        </tr>
      `).join('');
    }
    const selectCategoria = document.getElementById('jugadorCategoriaSocio');
    selectCategoria.innerHTML = '<option value="">Sin especificar</option>' +
      categoriasSocioCache.filter((c) => c.activo).map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    poblarFiltroCategoriaSocio();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function agregarCategoriaSocio(e) {
  e.preventDefault();
  const errorEl = document.getElementById('categoriaSocioFormError');
  errorEl.classList.add('oculto');
  const input = document.getElementById('nombreNuevaCategoriaSocio');
  try {
    await apiFetch('/club/configuracion/categorias', { method: 'POST', body: JSON.stringify({ nombre: input.value.trim() }) });
    input.value = '';
    cargarCategoriasSocio();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function toggleActivoCategoriaSocio(id, nuevoValor) {
  try {
    await apiFetch(`/club/configuracion/categorias/${id}/activo`, { method: 'PATCH', body: JSON.stringify({ activo: nuevoValor }) });
    cargarCategoriasSocio();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarCategoriaSocio(id) {
  if (!confirm('¿Eliminar esta categoría?')) return;
  try {
    await apiFetch(`/club/configuracion/categorias/${id}`, { method: 'DELETE' });
    cargarCategoriasSocio();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// El QR se genera en tamaño grande (640x640) directamente, aunque nunca se
// muestre en pantalla (el contenedor queda oculto con display:none) — así la
// descarga sale nítida y no hace falta agrandar un canvas chico. Mismo
// patrón que usa el Panel Liga para el QR de postulación de clubes.
async function pintarLinkYQrRegistroSocios() {
  if (!miClubId) {
    try {
      const data = await apiFetch('/club/configuracion/mi-club');
      miClubId = data.club_id;
    } catch (err) {
      return;
    }
  }
  const url = `${window.location.origin}/sitio/socio.html?club_id=${miClubId}`;
  document.getElementById('linkRegistroSocios').value = url;
  const contenedor = document.getElementById('qrRegistroSociosContenedor');
  contenedor.innerHTML = '';
  if (window.QRCode) {
    // eslint-disable-next-line no-new
    new QRCode(contenedor, { text: url, width: 640, height: 640 });
  }
}

async function compartirLinkRegistroSocios() {
  const url = document.getElementById('linkRegistroSocios').value;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Registrate como socio', url });
    } catch (err) {
      // el usuario canceló el share nativo, no hacemos nada
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    alert('Link copiado al portapapeles.');
  }
}

function descargarQrRegistroSocios() {
  const contenedor = document.getElementById('qrRegistroSociosContenedor');
  const canvas = contenedor.querySelector('canvas');
  const img = contenedor.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = 'qr-registro-socios.png';
  link.click();
}

// ===================== SOLICITUDES DE SOCIOS (autorregistro) =====================

async function actualizarBadgeSolicitudesPendientes() {
  try {
    const data = await apiFetch('/club/jugadores/solicitudes');
    const badge = document.getElementById('badgeSolicitudesPendientes');
    if (data.solicitudes.length) {
      badge.textContent = data.solicitudes.length;
      badge.classList.remove('oculto');
    } else {
      badge.classList.add('oculto');
    }
  } catch (err) {
    // sin bloquear la pantalla si esto falla
  }
}

function abrirSolicitudesSocios() {
  document.getElementById('panelSolicitudesSocios').classList.remove('oculto');
  document.getElementById('fondoModalSolicitudesSocios').classList.remove('oculto');
  cargarSolicitudesSocios();
}

function cerrarSolicitudesSocios() {
  document.getElementById('panelSolicitudesSocios').classList.add('oculto');
  document.getElementById('fondoModalSolicitudesSocios').classList.add('oculto');
}

async function cargarSolicitudesSocios() {
  const tbody = document.getElementById('tablaSolicitudesSocios');
  tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/jugadores/solicitudes');
    if (!data.solicitudes.length) {
      tbody.innerHTML = '<tr><td colspan="7">No hay solicitudes pendientes.</td></tr>';
      return;
    }
    tbody.innerHTML = data.solicitudes.map((s) => `
      <tr>
        <td>${escapeHtml(s.apellido)}, ${escapeHtml(s.nombre)}</td>
        <td>${escapeHtml(s.dni)}</td>
        <td>${formatearFecha(s.fecha_nacimiento)}</td>
        <td>${escapeHtml(s.actividad_nombre || '-')}</td>
        <td>${escapeHtml(s.categoria_socio_nombre || '-')}</td>
        <td>${escapeHtml(s.telefono || s.email || '-')}</td>
        <td>
          <button class="btn btn-pequeno" onclick="aprobarSolicitudSocio('${s.id}')">Aprobar</button>
          <button class="btn btn-peligro btn-pequeno" onclick="rechazarSolicitudSocio('${s.id}')">Rechazar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function aprobarSolicitudSocio(id) {
  try {
    await apiFetch(`/club/jugadores/solicitudes/${id}/aprobar`, { method: 'POST' });
    cargarSolicitudesSocios();
    actualizarBadgeSolicitudesPendientes();
    cargarJugadores();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rechazarSolicitudSocio(id) {
  const motivo = prompt('Motivo del rechazo (opcional):') || undefined;
  try {
    await apiFetch(`/club/jugadores/solicitudes/${id}/rechazar`, { method: 'POST', body: JSON.stringify({ motivo }) });
    cargarSolicitudesSocios();
    actualizarBadgeSolicitudesPendientes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== JUGADORES =====================

async function cargarJugadores() {
  const tbody = document.getElementById('tablaJugadores');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/jugadores');
    jugadoresCache = data.jugadores;
    jugadoresSeleccionados.clear();
    poblarFiltroAnioNacimiento();
    renderJugadores();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function poblarFiltroAnioNacimiento() {
  const select = document.getElementById('filtroAnioNacimientoJugadores');
  const anioActual = select.value;
  const anios = Array.from(new Set(jugadoresCache.map((j) => j.anio_nacimiento).filter(Boolean))).sort((a, b) => b - a);
  select.innerHTML = '<option value="">Todos los años de nacimiento</option>' +
    anios.map((a) => `<option value="${a}">${a}</option>`).join('');
  if (anios.includes(Number(anioActual))) select.value = anioActual;
}

function formatearFecha(fecha) {
  if (!fecha) return '-';
  // Idem liga.js: el backend puede devolver "YYYY-MM-DD" o fecha/hora ISO
  // completa según la consulta; sólo agregamos la hora si todavía no la
  // tiene, para no generar una fecha inválida.
  const fechaObj = String(fecha).includes('T') ? new Date(fecha) : new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(fechaObj.getTime())) return '-';
  return fechaObj.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function renderJugadores() {
  const tbody = document.getElementById('tablaJugadores');
  const texto = (document.getElementById('buscadorJugadores').value || '').trim().toLowerCase();
  const anio = document.getElementById('filtroAnioNacimientoJugadores').value;
  const actividadId = document.getElementById('filtroActividadJugadores').value;
  const categoriaId = document.getElementById('filtroCategoriaSocioJugadores').value;

  const lista = jugadoresCache.filter((j) => {
    if (texto) {
      const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase();
      if (!nombreCompleto.includes(texto)) return false;
    }
    if (anio && String(j.anio_nacimiento || '') !== anio) return false;
    if (actividadId && j.actividad_id !== actividadId) return false;
    if (categoriaId && j.categoria_socio_id !== categoriaId) return false;
    return true;
  });

  if (!jugadoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="9">Todavía no cargaste ningún jugador.</td></tr>';
    return;
  }
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="9">No se encontraron jugadores con ese filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map((j) => `
    <tr>
      <td><input type="checkbox" class="check-jugador" data-jugador-id="${j.id}" onchange="toggleSeleccionJugador('${j.id}', this.checked)" ${jugadoresSeleccionados.has(j.id) ? 'checked' : ''}></td>
      <td>${fotoJugadorHtml(j.foto_url, 'foto-jugador-mini')}</td>
      <td>${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}</td>
      <td>${escapeHtml(j.dni)}</td>
      <td>${formatearFecha(j.fecha_nacimiento)}</td>
      <td>${j.anio_nacimiento != null ? j.anio_nacimiento : '-'}</td>
      <td>${j.numero_camiseta != null ? j.numero_camiseta : '-'}</td>
      <td><span class="badge ${j.activo ? 'badge-activo' : 'badge-inactivo'}">${j.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-secundario btn-pequeno" onclick="abrirSolicitarFichaje('${j.id}', '${escapeHtml(j.nombre)} ${escapeHtml(j.apellido)}')">Pedir fichaje</button>
        <button class="btn btn-secundario btn-pequeno" onclick="abrirEditarJugador('${j.id}')">Editar</button>
        <button class="btn ${j.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoJugador('${j.id}', ${!j.activo})">${j.activo ? 'Desactivar' : 'Activar'}</button>
      </td>
    </tr>
  `).join('');
}

function toggleSeleccionJugador(jugadorId, marcado) {
  if (marcado) jugadoresSeleccionados.add(jugadorId);
  else jugadoresSeleccionados.delete(jugadorId);
}

function onElegirFotoJugador(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    const base64 = lector.result;
    const preview = document.getElementById('jugadorFotoPreview');
    preview.src = base64;
    preview.classList.remove('oculto');
    document.getElementById('jugadorFotoUrl').value = base64;
  };
  lector.readAsDataURL(archivo);
}

function abrirEditarJugador(jugadorId) {
  const j = jugadoresCache.find((x) => x.id === jugadorId);
  if (!j) return;
  jugadorIdEdicion = jugadorId;
  document.getElementById('jugadorFormError').classList.add('oculto');
  document.getElementById('jugadorNombre').value = j.nombre || '';
  document.getElementById('jugadorApellido').value = j.apellido || '';
  document.getElementById('jugadorDni').value = j.dni || '';
  document.getElementById('jugadorFechaNacimiento').value = j.fecha_nacimiento ? String(j.fecha_nacimiento).slice(0, 10) : '';
  document.getElementById('jugadorPosicion').value = j.posicion || '';
  document.getElementById('jugadorNumero').value = j.numero_camiseta != null ? j.numero_camiseta : '';
  document.getElementById('jugadorTelefono').value = j.telefono || '';
  document.getElementById('jugadorEmail').value = j.email || '';
  document.getElementById('jugadorActividad').value = j.actividad_id || '';
  document.getElementById('jugadorCategoriaSocio').value = j.categoria_socio_id || '';
  document.getElementById('jugadorFotoUrl').value = j.foto_url || '';
  const preview = document.getElementById('jugadorFotoPreview');
  if (j.foto_url) {
    preview.src = j.foto_url;
    preview.classList.remove('oculto');
  } else {
    preview.classList.add('oculto');
  }
  document.querySelector('#formJugador button[type="submit"]').textContent = 'Guardar cambios';
  document.getElementById('formJugador').classList.remove('oculto');
}

async function guardarJugador(e) {
  e.preventDefault();
  const errorEl = document.getElementById('jugadorFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    nombre: document.getElementById('jugadorNombre').value.trim(),
    apellido: document.getElementById('jugadorApellido').value.trim(),
    dni: document.getElementById('jugadorDni').value.trim(),
    fecha_nacimiento: document.getElementById('jugadorFechaNacimiento').value || undefined,
    posicion: document.getElementById('jugadorPosicion').value.trim() || undefined,
    numero_camiseta: document.getElementById('jugadorNumero').value || undefined,
    telefono: document.getElementById('jugadorTelefono').value.trim() || undefined,
    email: document.getElementById('jugadorEmail').value.trim() || undefined,
    actividad_id: document.getElementById('jugadorActividad').value || undefined,
    categoria_socio_id: document.getElementById('jugadorCategoriaSocio').value || undefined,
    foto_url: document.getElementById('jugadorFotoUrl').value || undefined
  };

  try {
    if (jugadorIdEdicion) {
      await apiFetch(`/club/jugadores/${jugadorIdEdicion}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/club/jugadores', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    jugadorIdEdicion = null;
    document.getElementById('formJugador').classList.add('oculto');
    cargarJugadores();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function toggleActivoJugador(jugadorId, nuevoValor) {
  try {
    await apiFetch(`/club/jugadores/${jugadorId}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: nuevoValor })
    });
    cargarJugadores();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== SOLICITAR FICHAJE =====================

async function abrirSolicitarFichaje(jugadorId, nombreCompleto) {
  await abrirPopupFichaje(`Pedir fichaje de "${nombreCompleto}"`, [jugadorId]);
}

function abrirFichajeMasivo() {
  const ids = Array.from(jugadoresSeleccionados);
  if (!ids.length) {
    alert('Tildá al menos un jugador en el listado para pedir un fichaje masivo.');
    return;
  }
  const nombres = jugadoresCache.filter((j) => ids.includes(j.id)).map((j) => `${j.nombre} ${j.apellido}`);
  abrirPopupFichaje(`Fichaje masivo para ${ids.length} jugador(es): ${nombres.join(', ')}`, ids);
}

async function abrirPopupFichaje(titulo, jugadorIds) {
  fichajeJugadorIdsActual = jugadorIds;
  document.getElementById('panelSolicitarFichaje').classList.remove('oculto');
  document.getElementById('tituloSolicitarFichaje').textContent = titulo;
  document.getElementById('fichajeFormError').classList.add('oculto');
  document.getElementById('fichajeFormOk').classList.add('oculto');
  document.getElementById('formSolicitarFichaje').reset();

  const selectTorneo = document.getElementById('fichajeTorneo');
  const selectCategoria = document.getElementById('fichajeCategoria');
  const selectSubcategoria = document.getElementById('fichajeSubcategoria');
  selectTorneo.innerHTML = '';
  selectTorneo.disabled = true;
  selectCategoria.innerHTML = '';
  selectCategoria.disabled = true;
  selectSubcategoria.innerHTML = '';
  selectSubcategoria.disabled = true;
  categoriasFichajeCache = [];

  const selectLiga = document.getElementById('fichajeLiga');
  selectLiga.innerHTML = '<option value="">Cargando...</option>';
  try {
    if (!ligasClubCache.length) {
      const data = await apiFetch('/club/ligas');
      ligasClubCache = data.ligas;
    }
    if (!ligasClubCache.length) {
      selectLiga.innerHTML = '<option value="">Tu club todavía no participa en ninguna Liga</option>';
      return;
    }
    selectLiga.innerHTML = '<option value="">Seleccioná una Liga</option>' +
      ligasClubCache.map((l) => `<option value="${l.id}" data-slug="${escapeHtml(l.slug)}">${escapeHtml(l.nombre)}</option>`).join('');
  } catch (err) {
    selectLiga.innerHTML = '<option value="">Error cargando Ligas</option>';
  }
}

async function onCambioLigaFichaje() {
  const selectLiga = document.getElementById('fichajeLiga');
  const selectTorneo = document.getElementById('fichajeTorneo');
  const selectCategoria = document.getElementById('fichajeCategoria');
  const selectSubcategoria = document.getElementById('fichajeSubcategoria');
  selectCategoria.innerHTML = '';
  selectCategoria.disabled = true;
  selectSubcategoria.innerHTML = '';
  selectSubcategoria.disabled = true;
  categoriasFichajeCache = [];

  const opcionElegida = selectLiga.options[selectLiga.selectedIndex];
  const slug = opcionElegida ? opcionElegida.dataset.slug : null;
  if (!slug) {
    selectTorneo.innerHTML = '';
    selectTorneo.disabled = true;
    return;
  }

  selectTorneo.innerHTML = '<option value="">Cargando...</option>';
  selectTorneo.disabled = true;
  try {
    const res = await fetch(`/web/ligas/${slug}/torneos`);
    const data = await res.json();
    if (!data.ok || !data.torneos.length) {
      selectTorneo.innerHTML = '<option value="">Esta Liga todavía no tiene torneos</option>';
      return;
    }
    selectTorneo.innerHTML = '<option value="">Seleccioná un Torneo</option>' +
      data.torneos.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)} (${escapeHtml(t.deporte)})</option>`).join('');
    selectTorneo.disabled = false;
  } catch (err) {
    selectTorneo.innerHTML = '<option value="">Error cargando torneos</option>';
  }
}

async function onCambioTorneoFichaje() {
  const selectTorneo = document.getElementById('fichajeTorneo');
  const selectCategoria = document.getElementById('fichajeCategoria');
  const selectSubcategoria = document.getElementById('fichajeSubcategoria');
  const torneoId = selectTorneo.value;
  selectSubcategoria.innerHTML = '';
  selectSubcategoria.disabled = true;
  if (!torneoId) {
    selectCategoria.innerHTML = '';
    selectCategoria.disabled = true;
    categoriasFichajeCache = [];
    return;
  }

  selectCategoria.innerHTML = '<option value="">Cargando...</option>';
  selectCategoria.disabled = true;
  try {
    const res = await fetch(`/web/torneos/${torneoId}/categorias`);
    const data = await res.json();
    categoriasFichajeCache = data.ok ? data.categorias : [];
    if (!data.ok || !data.categorias.length) {
      selectCategoria.innerHTML = '<option value="">Sin divisiones</option>';
      return;
    }
    selectCategoria.innerHTML = '<option value="">Elegí una división...</option>' +
      data.categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    selectCategoria.disabled = false;
  } catch (err) {
    selectCategoria.innerHTML = '<option value="">Error cargando divisiones</option>';
  }
}

function onCambioCategoriaFichaje() {
  const categoriaId = document.getElementById('fichajeCategoria').value;
  const selectSubcategoria = document.getElementById('fichajeSubcategoria');
  const categoria = categoriasFichajeCache.find((c) => c.id === categoriaId);
  const subcategorias = categoria ? (categoria.subcategorias || []) : [];
  if (!subcategorias.length) {
    selectSubcategoria.innerHTML = '';
    selectSubcategoria.disabled = true;
    selectSubcategoria.required = false;
    return;
  }
  selectSubcategoria.innerHTML = '<option value="">Elegí una categoría...</option>' +
    subcategorias.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
  selectSubcategoria.disabled = false;
  selectSubcategoria.required = true;
}

async function enviarSolicitudFichaje(e) {
  e.preventDefault();
  const errorEl = document.getElementById('fichajeFormError');
  const okEl = document.getElementById('fichajeFormOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const ligaId = document.getElementById('fichajeLiga').value;
  const torneoId = document.getElementById('fichajeTorneo').value;
  const categoriaId = document.getElementById('fichajeCategoria').value;
  const selectSubcategoria = document.getElementById('fichajeSubcategoria');
  const subcategoriaId = selectSubcategoria.value;

  if (!ligaId || !torneoId || !categoriaId) {
    errorEl.textContent = 'Tenés que elegir una Liga, un Torneo y una División.';
    errorEl.classList.remove('oculto');
    return;
  }
  if (selectSubcategoria.required && !subcategoriaId) {
    errorEl.textContent = 'Esa división tiene categorías: tenés que elegir una.';
    errorEl.classList.remove('oculto');
    return;
  }
  if (!fichajeJugadorIdsActual.length) {
    errorEl.textContent = 'No hay ningún jugador seleccionado.';
    errorEl.classList.remove('oculto');
    return;
  }

  // Uno o varios jugadores (fichaje masivo), todos a la misma Liga/Torneo/
  // División; si alguno falla (ej: ya estaba fichado) seguimos con el resto
  // y avisamos al final quiénes no se pudieron mandar.
  const fallidos = [];
  const avisos = [];
  for (const jugadorId of fichajeJugadorIdsActual) {
    try {
      const respuesta = await apiFetch(`/club/jugadores/${jugadorId}/fichajes`, {
        method: 'POST',
        body: JSON.stringify({
          liga_id: ligaId,
          torneo_id: torneoId,
          categoria_id: categoriaId,
          subcategoria_id: subcategoriaId || undefined
        })
      });
      if (respuesta.aviso_otros_fichajes && respuesta.aviso_otros_fichajes.length) {
        const jugador = jugadoresCache.find((j) => j.id === jugadorId);
        const nombreJugador = jugador ? `${jugador.nombre} ${jugador.apellido}` : jugadorId;
        const otros = respuesta.aviso_otros_fichajes
          .map((o) => `${o.torneo_nombre}${o.categoria_nombre ? ' - ' + o.categoria_nombre : ''}${o.subcategoria_nombre ? ' (' + o.subcategoria_nombre + ')' : ''} (${o.club_nombre})`)
          .join(', ');
        avisos.push(`${nombreJugador} ya figura fichado en: ${otros}`);
      }
    } catch (err) {
      const jugador = jugadoresCache.find((j) => j.id === jugadorId);
      fallidos.push(`${jugador ? `${jugador.nombre} ${jugador.apellido}` : jugadorId}: ${err.message}`);
    }
  }

  if (fallidos.length) {
    errorEl.innerHTML = `No se pudieron enviar ${fallidos.length} solicitud(es):<br>` + fallidos.map((f) => escapeHtml(f)).join('<br>');
    errorEl.classList.remove('oculto');
  }
  const exitosos = fichajeJugadorIdsActual.length - fallidos.length;
  if (exitosos > 0) {
    let mensaje = `Se envió correctamente la solicitud de fichaje para ${exitosos} jugador(es). Queda(n) pendiente(s) de aprobación de la Liga.`;
    if (avisos.length) {
      mensaje += '<br><br>⚠ Aviso: ' + avisos.map((a) => escapeHtml(a)).join('<br>⚠ Aviso: ');
    }
    okEl.innerHTML = mensaje;
    okEl.classList.remove('oculto');
  }
}

// ===================== FICHAJES Y CARNETS =====================

async function cargarFichajes() {
  const tbody = document.getElementById('tablaFichajes');
  tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/fichajes');
    fichajesCache = data.fichajes;
    poblarFiltroLigaFichajes();
    poblarFiltroTorneoFichajes();
    poblarFiltroCategoriaFichajes();
    poblarFiltroSubcategoriaFichajes();
    renderFichajes();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function poblarFiltroLigaFichajes() {
  const select = document.getElementById('filtroLigaFichajes');
  const actual = select.value;
  const ligas = [];
  const vistos = new Set();
  fichajesCache.forEach((f) => {
    if (f.liga_id && !vistos.has(f.liga_id)) {
      vistos.add(f.liga_id);
      ligas.push({ id: f.liga_id, nombre: f.liga_nombre });
    }
  });
  ligas.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  select.innerHTML = '<option value="">Todas las ligas</option>' +
    ligas.map((l) => `<option value="${l.id}">${escapeHtml(l.nombre || '-')}</option>`).join('');
  if (ligas.some((l) => l.id === actual)) select.value = actual;
}

function poblarFiltroTorneoFichajes() {
  const select = document.getElementById('filtroTorneoFichajes');
  const ligaId = document.getElementById('filtroLigaFichajes').value;
  const actual = select.value;
  const torneos = [];
  const vistos = new Set();
  fichajesCache.forEach((f) => {
    if (ligaId && f.liga_id !== ligaId) return;
    if (f.torneo_id && !vistos.has(f.torneo_id)) {
      vistos.add(f.torneo_id);
      torneos.push({ id: f.torneo_id, nombre: f.torneo_nombre });
    }
  });
  torneos.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  select.innerHTML = '<option value="">Todos los torneos</option>' +
    torneos.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre || '-')}</option>`).join('');
  if (torneos.some((t) => t.id === actual)) select.value = actual;
}

function poblarFiltroCategoriaFichajes() {
  const select = document.getElementById('filtroCategoriaFichajes');
  const ligaId = document.getElementById('filtroLigaFichajes').value;
  const torneoId = document.getElementById('filtroTorneoFichajes').value;
  const actual = select.value;
  const categorias = [];
  const vistos = new Set();
  fichajesCache.forEach((f) => {
    if (ligaId && f.liga_id !== ligaId) return;
    if (torneoId && f.torneo_id !== torneoId) return;
    if (f.categoria_id && !vistos.has(f.categoria_id)) {
      vistos.add(f.categoria_id);
      categorias.push({ id: f.categoria_id, nombre: f.categoria_nombre });
    }
  });
  categorias.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  select.innerHTML = '<option value="">Todas las divisiones</option>' +
    categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre || '-')}</option>`).join('');
  if (categorias.some((c) => c.id === actual)) select.value = actual;
}

function poblarFiltroSubcategoriaFichajes() {
  const select = document.getElementById('filtroSubcategoriaFichajes');
  const ligaId = document.getElementById('filtroLigaFichajes').value;
  const torneoId = document.getElementById('filtroTorneoFichajes').value;
  const categoriaId = document.getElementById('filtroCategoriaFichajes').value;
  const actual = select.value;
  const subcategorias = [];
  const vistos = new Set();
  fichajesCache.forEach((f) => {
    if (ligaId && f.liga_id !== ligaId) return;
    if (torneoId && f.torneo_id !== torneoId) return;
    if (categoriaId && f.categoria_id !== categoriaId) return;
    if (f.subcategoria_id && !vistos.has(f.subcategoria_id)) {
      vistos.add(f.subcategoria_id);
      subcategorias.push({ id: f.subcategoria_id, nombre: f.subcategoria_nombre });
    }
  });
  subcategorias.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    subcategorias.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre || '-')}</option>`).join('');
  if (subcategorias.some((s) => s.id === actual)) select.value = actual;
}

function renderFichajes() {
  const tbody = document.getElementById('tablaFichajes');
  const texto = (document.getElementById('buscadorFichajes').value || '').trim().toLowerCase();
  const ligaId = document.getElementById('filtroLigaFichajes').value;
  const torneoId = document.getElementById('filtroTorneoFichajes').value;
  const categoriaId = document.getElementById('filtroCategoriaFichajes').value;
  const subcategoriaId = document.getElementById('filtroSubcategoriaFichajes').value;

  const lista = fichajesCache.filter((f) => {
    if (texto) {
      const nombreCompleto = `${f.jugador_nombre} ${f.jugador_apellido}`.toLowerCase();
      if (!nombreCompleto.includes(texto)) return false;
    }
    if (ligaId && f.liga_id !== ligaId) return false;
    if (torneoId && f.torneo_id !== torneoId) return false;
    if (categoriaId && f.categoria_id !== categoriaId) return false;
    if (subcategoriaId && f.subcategoria_id !== subcategoriaId) return false;
    return true;
  });

  if (!fichajesCache.length) {
    tbody.innerHTML = '<tr><td colspan="8">Todavía no pediste ningún fichaje.</td></tr>';
    return;
  }
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8">No se encontraron fichajes con ese filtro.</td></tr>';
    return;
  }

  const badgesEstado = { pendiente: 'badge-pendiente', aprobado: 'badge-activo', rechazado: 'badge-inactivo' };
  tbody.innerHTML = lista.map((f) => {
    let carnetHtml = '-';
    if (f.carnet_codigo_qr) {
      carnetHtml = `<button class="btn btn-secundario btn-pequeno" onclick="abrirCarnet('${f.id}')">Ver carnet</button>`;
    } else if (f.estado === 'rechazado' && f.motivo_rechazo) {
      carnetHtml = `<span class="carnet-info">Motivo: ${escapeHtml(f.motivo_rechazo)}</span>`;
    } else if (f.estado === 'aprobado') {
      carnetHtml = '<span class="carnet-info">Todavía sin generar, avisale a la Liga</span>';
    }
    return `
      <tr>
        <td>${fotoJugadorHtml(f.jugador_foto_url, 'foto-jugador-mini')}</td>
        <td>${escapeHtml(f.jugador_nombre)} ${escapeHtml(f.jugador_apellido)}</td>
        <td>${escapeHtml(f.liga_nombre)}</td>
        <td>${escapeHtml(f.torneo_nombre || '-')}</td>
        <td>${escapeHtml(f.categoria_nombre || '-')}</td>
        <td>${escapeHtml(f.subcategoria_nombre || '-')}</td>
        <td><span class="badge ${badgesEstado[f.estado] || ''}">${escapeHtml(f.estado)}</span></td>
        <td>${carnetHtml}</td>
      </tr>
    `;
  }).join('');
}

function esCarnetVigente(f) {
  if (!f.carnet_activo) return false;
  if (!f.carnet_vigente_hasta) return true;
  return new Date(f.carnet_vigente_hasta) >= new Date();
}

function abrirCarnet(fichajeId) {
  const f = fichajesCache.find((x) => x.id === fichajeId);
  if (!f) return;

  const vigente = esCarnetVigente(f);
  const colorClub = f.club_color_primario || '#1a73e8';
  const vigenteBadge = vigente
    ? '<span class="badge badge-activo">Vigente</span>'
    : '<span class="badge badge-inactivo">Vencido</span>';

  document.getElementById('tarjetaCarnet').innerHTML = `
    <div class="tarjeta-carnet">
      <div class="carnet-header" style="background:${colorClub};">
        ${f.club_logo_url ? `<img src="${f.club_logo_url}" alt="">` : ''}
        <strong>${escapeHtml(f.club_nombre || '-')}</strong>
      </div>
      <div class="carnet-cuerpo">
        ${fotoJugadorHtml(f.jugador_foto_url, 'carnet-foto')}
        <p class="carnet-nombre">${escapeHtml(f.jugador_nombre)} ${escapeHtml(f.jugador_apellido)}</p>
        <div class="carnet-datos">
          <div><span>DNI</span><span>${escapeHtml(f.jugador_dni || '-')}</span></div>
          <div><span>Fecha de nacimiento</span><span>${formatearFecha(f.jugador_fecha_nacimiento)}</span></div>
          <div><span>Liga</span><span>${escapeHtml(f.liga_nombre || '-')}</span></div>
          <div><span>Torneo</span><span>${escapeHtml(f.torneo_nombre || '-')}</span></div>
          <div><span>División</span><span>${escapeHtml(f.categoria_nombre || '-')}</span></div>
          ${f.subcategoria_nombre ? `<div><span>Categoría</span><span>${escapeHtml(f.subcategoria_nombre)}</span></div>` : ''}
        </div>
        <div class="carnet-qr" id="carnetQrContainer"></div>
        <p class="carnet-codigo-texto">${escapeHtml(f.carnet_codigo_qr)}</p>
        <p>${vigenteBadge}</p>
      </div>
    </div>
  `;

  const qrContainer = document.getElementById('carnetQrContainer');
  qrContainer.innerHTML = '';
  if (window.QRCode && f.carnet_codigo_qr) {
    new QRCode(qrContainer, { text: f.carnet_codigo_qr, width: 140, height: 140 });
  }

  document.getElementById('panelVerCarnet').classList.remove('oculto');
  document.getElementById('fondoModalVerCarnet').classList.remove('oculto');
}

function cerrarCarnet() {
  document.getElementById('panelVerCarnet').classList.add('oculto');
  document.getElementById('fondoModalVerCarnet').classList.add('oculto');
}

// ===================== NOTIFICACIONES =====================

async function cargarNotificacionesClub() {
  const tbody = document.getElementById('tablaNotificacionesClub');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/notificaciones');
    const notificaciones = data.notificaciones;
    if (!notificaciones.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no recibiste ninguna notificación.</td></tr>';
      return;
    }
    tbody.innerHTML = notificaciones.map((n) => `
      <tr style="${n.leida ? '' : 'font-weight:600;'}">
        <td>${escapeHtml(n.liga_nombre)}</td>
        <td>${escapeHtml(n.titulo)}</td>
        <td>${escapeHtml(n.mensaje)}</td>
        <td>${new Date(n.creado_at).toLocaleDateString('es-AR')}</td>
        <td>${n.leida
          ? '<span class="badge badge-activo">Leída</span>'
          : `<button class="btn btn-secundario btn-pequeno" onclick="marcarNotificacionLeida('${n.id}')">Marcar leída</button>`}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function marcarNotificacionLeida(notificacionId) {
  try {
    await apiFetch(`/club/notificaciones/${notificacionId}/leida`, { method: 'PATCH' });
    cargarNotificacionesClub();
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
