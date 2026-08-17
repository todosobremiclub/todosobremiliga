// Lógica del Panel de Liga: Clubes + Torneos/Categorías/Equipos/Fixture/Tabla.

let clubesCache = [];
let torneosCache = [];
let categoriasCache = [];
let equiposCache = [];
let partidosCache = [];
let clubLogoBase64Actual = '';
let ligaSlugActual = null;

let paginaClubesActual = 1;
const CLUBES_POR_PAGINA = 25;
let totalClubesActual = 0;

let torneoActualId = null;
let torneoActualNombre = '';
let categoriaActualId = null;
let categoriaActualNombre = '';

// ----- Popups: todas las pantallas de edición/detalle (Club, Usuarios,
// Canchas, Documentos, Notas, Torneo, Categorías, Detalle de categoría,
// Participaciones) se muestran como ventana modal centrada, compartiendo un
// único fondo oscuro (#fondoModalGenerico). -----
function mostrarFondoModal() {
  document.getElementById('fondoModalGenerico').classList.remove('oculto');
}
function ocultarFondoModal() {
  document.getElementById('fondoModalGenerico').classList.add('oculto');
}

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
// Convierte un color hex (#rrggbb) a "r, g, b" para poder armar un rgba()
// con la opacidad que necesitemos en los degradés de fondo.
function hexARgb(hex) {
  const limpio = (hex || '').replace('#', '');
  const valido = /^[0-9a-fA-F]{6}$/.test(limpio) ? limpio : '1d4ed8';
  const r = parseInt(valido.substring(0, 2), 16);
  const g = parseInt(valido.substring(2, 4), 16);
  const b = parseInt(valido.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

async function cargarPerfilLiga() {
  try {
    const data = await apiFetch('/liga/perfil');
    const liga = data.liga;
    ligaSlugActual = liga.slug;
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

    // Fondo "cancha de noche" (mismo estilo que el login) pero con los
    // colores propios de esta Liga en vez de los azul/verde por defecto.
    const rgbPrimario = hexARgb(primario);
    const rgbSecundario = hexARgb(secundario);
    document.body.style.background = `
      radial-gradient(circle at 50% 0%, rgba(${rgbPrimario}, 0.32), transparent 55%),
      radial-gradient(circle at 15% 90%, rgba(${rgbSecundario}, 0.18), transparent 45%),
      radial-gradient(circle at 85% 90%, rgba(${rgbPrimario}, 0.18), transparent 45%),
      linear-gradient(180deg, #0a0e17 0%, #0d1220 55%, #0a0e17 100%)
    `;
  } catch (err) {
    // Si falla, seguimos con el fondo por defecto (azul/verde) del CSS.
  }
}

function conectarEventos() {
  document.getElementById('tabBtnClubes').addEventListener('click', () => cambiarTab('clubes'));
  document.getElementById('tabBtnTorneos').addEventListener('click', () => cambiarTab('torneos'));
  document.getElementById('tabBtnPostulaciones').addEventListener('click', () => cambiarTab('postulaciones'));
  document.getElementById('tabBtnFichajes').addEventListener('click', () => cambiarTab('fichajes'));
  document.getElementById('tabBtnNoticias').addEventListener('click', () => cambiarTab('noticias'));
  document.getElementById('tabBtnNotificaciones').addEventListener('click', () => cambiarTab('notificaciones'));
  document.getElementById('tabBtnFinanzas').addEventListener('click', () => cambiarTab('finanzas'));
  document.getElementById('tabBtnAgenda').addEventListener('click', () => cambiarTab('agenda'));

  // ---- Clubes ----
  document.getElementById('btnMostrarFormClub').addEventListener('click', () => {
    limpiarFormClub();
    document.getElementById('formClub').classList.remove('oculto');
    mostrarFondoModal();
  });
  document.getElementById('btnCancelarFormClub').addEventListener('click', () => {
    document.getElementById('formClub').classList.add('oculto');
    ocultarFondoModal();
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
    ocultarFondoModal();
  });
  document.getElementById('formUsuarioClub').addEventListener('submit', crearUsuarioClub);

  document.getElementById('btnCerrarDocumentosClub').addEventListener('click', () => {
    document.getElementById('panelDocumentosClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formDocumentoClub').addEventListener('submit', subirDocumentoClub);

  document.getElementById('btnCerrarComentariosClub').addEventListener('click', () => {
    document.getElementById('panelComentariosClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formComentarioClub').addEventListener('submit', agregarComentarioClub);

  document.getElementById('btnCerrarParticipacionesClub').addEventListener('click', () => {
    document.getElementById('modalParticipacionesClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('fondoModalGenerico').addEventListener('click', () => {
    // El fondo compartido cierra cualquier popup que esté abierto en ese momento.
    ['formClub', 'panelUsuariosClub', 'panelDocumentosClub', 'panelComentariosClub', 'panelCanchasClub',
     'modalParticipacionesClub', 'formTorneo', 'panelCategorias', 'panelDetalleCategoria'
    ].forEach((id) => document.getElementById(id).classList.add('oculto'));
    ocultarFondoModal();
    torneoActualId = null;
    categoriaActualId = null;
  });
  document.getElementById('btnGuardarParticipaciones').addEventListener('click', guardarParticipaciones);

  // ---- Canchas del club ----
  document.getElementById('btnGestionarCanchas').addEventListener('click', () => {
    const clubId = document.getElementById('clubIdEdicion').value;
    if (clubId) abrirCanchasClub(clubId);
  });
  document.getElementById('btnCerrarCanchasClub').addEventListener('click', () => {
    document.getElementById('panelCanchasClub').classList.add('oculto');
    document.getElementById('formClub').classList.remove('oculto');
  });
  document.getElementById('formCanchaSecundaria').addEventListener('submit', guardarCanchaSecundaria);
  document.getElementById('btnCancelarCanchaSecundaria').addEventListener('click', limpiarFormCanchaSecundaria);

  document.getElementById('buscadorClubes').addEventListener('input', () => {
    paginaClubesActual = 1;
    cargarClubes();
  });
  document.getElementById('btnClubesPaginaAnterior').addEventListener('click', () => {
    if (paginaClubesActual > 1) { paginaClubesActual -= 1; cargarClubes(); }
  });
  document.getElementById('btnClubesPaginaSiguiente').addEventListener('click', () => {
    if (paginaClubesActual * CLUBES_POR_PAGINA < totalClubesActual) { paginaClubesActual += 1; cargarClubes(); }
  });

  document.getElementById('btnDescargarPlantillaClubes').addEventListener('click', descargarPlantillaClubes);
  document.getElementById('btnMostrarCargaMasiva').addEventListener('click', () => {
    document.getElementById('cargaMasivaError').classList.add('oculto');
    document.getElementById('cargaMasivaResultado').innerHTML = '';
    document.getElementById('formCargaMasiva').classList.remove('oculto');
  });
  document.getElementById('btnCancelarCargaMasiva').addEventListener('click', () => {
    document.getElementById('formCargaMasiva').classList.add('oculto');
  });
  document.getElementById('formCargaMasiva').addEventListener('submit', subirCargaMasivaClubes);

  // ---- Postulaciones ----
  document.getElementById('btnCopiarLinkPostulacion').addEventListener('click', () => {
    const input = document.getElementById('linkPostulacionPublica');
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value);
  });
  document.getElementById('filtroEstadoPostulacion').addEventListener('change', cargarPostulaciones);
  document.getElementById('btnCompartirPostulacion').addEventListener('click', compartirLinkPostulacion);
  document.getElementById('btnDescargarQrPostulacion').addEventListener('click', descargarQrPostulacion);

  // ---- Torneos ----
  document.getElementById('btnMostrarFormTorneo').addEventListener('click', () => {
    document.getElementById('formTorneo').reset();
    document.getElementById('torneoIdEdicion').value = '';
    document.getElementById('torneoPtsVictoria').value = 3;
    document.getElementById('torneoPtsEmpate').value = 1;
    document.getElementById('torneoFormError').classList.add('oculto');
    document.getElementById('formTorneo').classList.remove('oculto');
    mostrarFondoModal();
  });
  document.getElementById('btnCancelarFormTorneo').addEventListener('click', () => {
    document.getElementById('formTorneo').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formTorneo').addEventListener('submit', guardarTorneo);

  // ---- Categorías ----
  document.getElementById('btnCerrarCategorias').addEventListener('click', () => {
    document.getElementById('panelCategorias').classList.add('oculto');
    document.getElementById('panelDetalleCategoria').classList.add('oculto');
    torneoActualId = null;
    ocultarFondoModal();
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
    document.getElementById('panelCategorias').classList.remove('oculto');
    categoriaActualId = null;
  });
  document.getElementById('tabBtnEquipos').addEventListener('click', () => cambiarTabDetalle('equipos'));
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTabDetalle('fixture'));
  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTabDetalle('tabla'));
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTabDetalle('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTabDetalle('tarjetas'));

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

  document.getElementById('btnGenerarFixture').addEventListener('click', () => {
    document.getElementById('fixtureAccionError').classList.add('oculto');
    document.getElementById('formGenerarFixture').classList.remove('oculto');
  });
  document.getElementById('btnCancelarGenerarFixture').addEventListener('click', () => {
    document.getElementById('formGenerarFixture').classList.add('oculto');
  });
  document.getElementById('formGenerarFixture').addEventListener('submit', generarFixtureAutomatico);
  document.getElementById('btnVaciarFixture').addEventListener('click', vaciarFixture);

  document.getElementById('btnCerrarCargarResultado').addEventListener('click', cerrarModalResultado);
  document.getElementById('btnCancelarResultado').addEventListener('click', cerrarModalResultado);
  document.getElementById('formResultado').addEventListener('submit', guardarResultadoConEstadisticas);

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
    clubes: 'seccionClubes', torneos: 'seccionTorneos', postulaciones: 'seccionPostulaciones', fichajes: 'seccionFichajes',
    noticias: 'seccionNoticias', notificaciones: 'seccionNotificaciones',
    finanzas: 'seccionFinanzas', agenda: 'seccionAgenda'
  };
  const botones = {
    clubes: 'tabBtnClubes', torneos: 'tabBtnTorneos', postulaciones: 'tabBtnPostulaciones', fichajes: 'tabBtnFichajes',
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
  if (nombre === 'postulaciones') {
    pintarLinkYQrPostulacion();
    cargarPostulaciones();
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
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  const texto = document.getElementById('buscadorClubes').value.trim();
  try {
    const params = new URLSearchParams({ pagina: paginaClubesActual, por_pagina: CLUBES_POR_PAGINA });
    if (texto) params.set('q', texto);
    const data = await apiFetch(`/liga/clubes?${params.toString()}`);
    clubesCache = data.clubes;
    totalClubesActual = data.total;

    const desde = clubesCache.length ? (paginaClubesActual - 1) * CLUBES_POR_PAGINA + 1 : 0;
    const hasta = (paginaClubesActual - 1) * CLUBES_POR_PAGINA + clubesCache.length;
    document.getElementById('paginacionClubesInfo').textContent = `Mostrando ${desde}-${hasta} de ${totalClubesActual} clubes`;
    document.getElementById('btnClubesPaginaAnterior').disabled = paginaClubesActual <= 1;
    document.getElementById('btnClubesPaginaSiguiente').disabled = paginaClubesActual * CLUBES_POR_PAGINA >= totalClubesActual;

    if (!clubesCache.length) {
      tbody.innerHTML = '<tr><td colspan="6">No se encontraron clubes.</td></tr>';
      return;
    }
    tbody.innerHTML = clubesCache.map((club) => `
      <tr style="border-left: 4px solid ${club.color_primario || 'transparent'};">
        <td>${club.logo_url ? `<img class="logo-miniatura" src="${club.logo_url}" alt="">` : '<span class="logo-miniatura"></span>'}</td>
        <td>${escapeHtml(club.nombre)}</td>
        <td>${escapeHtml(club.ciudad || '-')}</td>
        <td>${escapeHtml(club.provincia || '-')}</td>
        <td><span class="badge ${club.activo_en_liga ? 'badge-activo' : 'badge-inactivo'}">${club.activo_en_liga ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="editarClub('${club.id}')">Editar</button>
          <button class="btn btn-secundario btn-pequeno" onclick="verParticipacionesClub('${club.id}', '${escapeHtml(club.nombre)}')">Participaciones</button>
          <button class="btn btn-secundario btn-pequeno" onclick="verUsuariosClub('${club.id}', '${escapeHtml(club.nombre)}')">Usuarios</button>
          <button class="btn btn-secundario btn-pequeno" onclick="abrirDocumentosClub('${club.id}', '${escapeHtml(club.nombre)}')">Documentos</button>
          <button class="btn btn-secundario btn-pequeno" onclick="abrirComentariosClub('${club.id}', '${escapeHtml(club.nombre)}')">Notas</button>
          <button class="btn ${club.activo_en_liga ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoClub('${club.id}', ${!club.activo_en_liga})">${club.activo_en_liga ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-peligro btn-pequeno" onclick="eliminarClub('${club.id}', '${escapeHtml(club.nombre)}')">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function eliminarClub(clubId, nombreClub) {
  if (!confirm(`¿Eliminar a "${nombreClub}" de tu Liga? Se borran también sus inscripciones a categorías (equipos, partidos y tabla de esta Liga). El club NO se borra de otras Ligas en las que participe.`)) {
    return;
  }
  try {
    await apiFetch(`/liga/clubes/${clubId}`, { method: 'DELETE' });
    cargarClubes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function descargarPlantillaClubes() {
  try {
    const res = await fetch('/liga/clubes/plantilla', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-clubes.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function subirCargaMasivaClubes(e) {
  e.preventDefault();
  const errorEl = document.getElementById('cargaMasivaError');
  const resultadoEl = document.getElementById('cargaMasivaResultado');
  errorEl.classList.add('oculto');
  resultadoEl.innerHTML = '';

  const archivo = document.getElementById('cargaMasivaArchivo').files[0];
  if (!archivo) {
    errorEl.textContent = 'Elegí primero el archivo de la plantilla completada.';
    errorEl.classList.remove('oculto');
    return;
  }

  const formData = new FormData();
  formData.append('archivo', archivo);

  try {
    const res = await fetch('/liga/clubes/carga-masiva', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getToken() },
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Error al subir la plantilla');

    let html = `<p class="mensaje-ok">Se crearon ${data.creados} clubes.</p>`;
    if (data.omitidos && data.omitidos.length) {
      html += `<p class="texto-ayuda">Filas omitidas:</p><ul>` +
        data.omitidos.map((o) => `<li>Fila ${o.fila}${o.nombre ? ` (${escapeHtml(o.nombre)})` : ''}: ${escapeHtml(o.motivo)}</li>`).join('') +
        `</ul>`;
    }
    resultadoEl.innerHTML = html;
    document.getElementById('cargaMasivaArchivo').value = '';
    paginaClubesActual = 1;
    cargarClubes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
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
  document.getElementById('clubDireccion').value = '';
  document.getElementById('clubCiudad').value = '';
  document.getElementById('clubProvincia').value = '';
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
  document.getElementById('clubCanchaTecho').value = 'aire_libre';
  document.getElementById('clubCanchaTamanio').value = '';
  document.getElementById('clubCanchaPiso').value = '';
  document.getElementById('clubFormError').classList.add('oculto');
  document.getElementById('btnGestionarCanchas').classList.add('oculto');
  document.getElementById('panelCanchasClub').classList.add('oculto');
}

function editarClub(clubId) {
  const club = clubesCache.find((c) => c.id === clubId);
  if (!club) return;
  document.getElementById('clubIdEdicion').value = club.id;
  document.getElementById('clubNombre').value = club.nombre || '';
  document.getElementById('clubDireccion').value = club.direccion || '';
  document.getElementById('clubCiudad').value = club.ciudad || '';
  document.getElementById('clubProvincia').value = club.provincia || '';
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
  document.getElementById('clubCanchaTecho').value = club.cancha_tipo_techo || 'aire_libre';
  document.getElementById('clubCanchaTamanio').value = club.cancha_tamanio || '';
  document.getElementById('clubCanchaPiso').value = club.cancha_piso || '';
  document.getElementById('clubFormError').classList.add('oculto');
  document.getElementById('formClub').classList.remove('oculto');
  document.getElementById('btnGestionarCanchas').classList.remove('oculto');
  document.getElementById('panelCanchasClub').classList.add('oculto');
  mostrarFondoModal();
}

async function guardarClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('clubFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('clubIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('clubNombre').value.trim(),
    direccion: document.getElementById('clubDireccion').value.trim() || undefined,
    ciudad: document.getElementById('clubCiudad').value.trim() || undefined,
    provincia: document.getElementById('clubProvincia').value.trim() || undefined,
    telefono: document.getElementById('clubTelefono').value.trim() || undefined,
    email_contacto: document.getElementById('clubEmail').value.trim() || undefined,
    logo_url: document.getElementById('clubLogoUrl').value || undefined,
    color_primario: document.getElementById('clubColorPrimario').value,
    color_secundario: document.getElementById('clubColorSecundario').value,
    cancha_tipo_techo: document.getElementById('clubCanchaTecho').value,
    cancha_tamanio: document.getElementById('clubCanchaTamanio').value.trim() || undefined,
    cancha_piso: document.getElementById('clubCanchaPiso').value.trim() || undefined
  };

  try {
    if (id) {
      await apiFetch(`/liga/clubes/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/clubes', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formClub').classList.add('oculto');
    ocultarFondoModal();
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
  mostrarFondoModal();
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

// ----- Documentos del club (los puede subir la Liga o el propio Club) -----

let clubIdDocumentosActual = null;
let documentoArchivoBase64Actual = '';

function abrirDocumentosClub(clubId, nombreClub) {
  clubIdDocumentosActual = clubId;
  document.getElementById('panelDocumentosClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloDocumentosClub').textContent = `Documentos de "${nombreClub}"`;
  document.getElementById('formDocumentoClub').reset();
  document.getElementById('documentoFormError').classList.add('oculto');
  documentoArchivoBase64Actual = '';
  cargarDocumentosClub();
}

async function cargarDocumentosClub() {
  const tbody = document.getElementById('tablaDocumentosClub');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubIdDocumentosActual}/documentos`);
    const documentos = data.documentos;
    if (!documentos.length) {
      tbody.innerHTML = '<tr><td colspan="4">Este club todavía no tiene documentos cargados.</td></tr>';
      return;
    }
    tbody.innerHTML = documentos.map((d) => `
      <tr>
        <td><a href="${d.archivo_url}" download="${escapeHtml(d.nombre)}" target="_blank">${escapeHtml(d.nombre)}</a></td>
        <td>${d.subido_por_rol === 'club' ? 'El Club' : 'La Liga'}</td>
        <td>${new Date(d.creado_at).toLocaleDateString('es-AR')}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="eliminarDocumentoClub('${d.id}')">Eliminar</button></td>
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
      await apiFetch(`/liga/clubes/${clubIdDocumentosActual}/documentos`, {
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
    await apiFetch(`/liga/clubes/${clubIdDocumentosActual}/documentos/${documentoId}`, { method: 'DELETE' });
    cargarDocumentosClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ----- Notas internas de la Liga sobre el club (el Club nunca las ve) -----

let clubIdComentariosActual = null;

function abrirComentariosClub(clubId, nombreClub) {
  clubIdComentariosActual = clubId;
  document.getElementById('panelComentariosClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloComentariosClub').textContent = `Notas internas de "${nombreClub}"`;
  document.getElementById('formComentarioClub').reset();
  document.getElementById('comentarioFormError').classList.add('oculto');
  cargarComentariosClub();
}

async function cargarComentariosClub() {
  const cont = document.getElementById('listaComentariosClub');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubIdComentariosActual}/comentarios`);
    const comentarios = data.comentarios;
    if (!comentarios.length) {
      cont.innerHTML = '<p class="texto-ayuda">Todavía no hay notas para este club.</p>';
      return;
    }
    cont.innerHTML = comentarios.map((c) => `
      <div style="border-bottom:1px solid var(--gris-100); padding:8px 0;">
        <p style="margin:0; font-size:13px;">${escapeHtml(c.comentario)}</p>
        <p class="texto-ayuda" style="margin:2px 0 0;">
          ${escapeHtml(c.autor_nombre || 'Liga')} — ${new Date(c.creado_at).toLocaleString('es-AR')}
          <button class="btn btn-peligro btn-pequeno" style="margin-left:8px;" onclick="eliminarComentarioClub('${c.id}')">Eliminar</button>
        </p>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function agregarComentarioClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('comentarioFormError');
  errorEl.classList.add('oculto');
  const comentario = document.getElementById('comentarioTexto').value.trim();
  try {
    await apiFetch(`/liga/clubes/${clubIdComentariosActual}/comentarios`, {
      method: 'POST',
      body: JSON.stringify({ comentario })
    });
    document.getElementById('formComentarioClub').reset();
    cargarComentariosClub();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarComentarioClub(comentarioId) {
  if (!confirm('¿Eliminar esta nota?')) return;
  try {
    await apiFetch(`/liga/clubes/${clubIdComentariosActual}/comentarios/${comentarioId}`, { method: 'DELETE' });
    cargarComentariosClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

let clubIdParticipacionesActual = null;

async function verParticipacionesClub(clubId, nombreClub) {
  clubIdParticipacionesActual = clubId;
  document.getElementById('modalParticipacionesClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloParticipacionesClub').textContent = `Participaciones de "${nombreClub}"`;
  document.getElementById('participacionesError').classList.add('oculto');
  document.getElementById('participacionesOk').classList.add('oculto');
  const cont = document.getElementById('listaParticipacionesTorneos');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubId}/participaciones-editor`);
    const torneos = data.torneos;
    if (!torneos.length) {
      cont.innerHTML = '<p class="texto-ayuda">Todavía no hay torneos creados en tu Liga.</p>';
      return;
    }
    cont.innerHTML = torneos.map((t) => `
      <div class="panel" style="margin-bottom:10px; box-shadow:none; border:1px solid var(--gris-300);">
        <label style="display:flex; align-items:center; gap:8px; font-weight:600; cursor:pointer;">
          <input type="checkbox" class="chk-torneo-participacion" data-torneo-id="${t.id}"
            ${t.categorias.some((c) => c.inscripta) ? 'checked' : ''}
            ${!t.categorias.length ? 'disabled' : ''}>
          ${escapeHtml(t.nombre)} <span class="texto-ayuda" style="margin:0;">(${escapeHtml(t.deporte)})</span>
        </label>
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; margin-left:24px;">
          ${t.categorias.length ? t.categorias.map((c) => `
            <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:400;">
              <input type="checkbox" class="chk-categoria-participacion" data-torneo-id="${t.id}" value="${c.id}" ${c.inscripta ? 'checked' : ''}>
              ${escapeHtml(c.nombre)}
            </label>
          `).join('') : '<span class="texto-ayuda">Este torneo todavía no tiene categorías.</span>'}
        </div>
      </div>
    `).join('');

    // Tildar/destildar el torneo marca (o desmarca) todas sus categorías por defecto.
    cont.querySelectorAll('.chk-torneo-participacion').forEach((chkTorneo) => {
      chkTorneo.addEventListener('change', () => {
        const torneoId = chkTorneo.dataset.torneoId;
        cont.querySelectorAll(`.chk-categoria-participacion[data-torneo-id="${torneoId}"]`).forEach((chkCat) => {
          chkCat.checked = chkTorneo.checked;
        });
      });
    });
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function guardarParticipaciones() {
  const errorEl = document.getElementById('participacionesError');
  const okEl = document.getElementById('participacionesOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');
  if (!clubIdParticipacionesActual) return;

  const categoriaIds = Array.from(
    document.querySelectorAll('#listaParticipacionesTorneos .chk-categoria-participacion:checked')
  ).map((el) => el.value);

  try {
    const data = await apiFetch(`/liga/clubes/${clubIdParticipacionesActual}/participaciones`, {
      method: 'PUT',
      body: JSON.stringify({ categoria_ids: categoriaIds })
    });
    okEl.textContent = `Guardado: ${data.agregadas} agregada(s), ${data.quitadas} quitada(s).`;
    okEl.classList.remove('oculto');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Canchas del club -----

let clubIdCanchasActual = null;

async function abrirCanchasClub(clubId) {
  clubIdCanchasActual = clubId;
  document.getElementById('formClub').classList.add('oculto');
  document.getElementById('panelCanchasClub').classList.remove('oculto');
  limpiarFormCanchaSecundaria();
  await cargarCanchasClub();
}

async function cargarCanchasClub() {
  const tbody = document.getElementById('tablaCanchasClub');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas`);
    const canchas = data.canchas;
    if (!canchas.length) {
      tbody.innerHTML = '<tr><td colspan="5">Este club todavía no tiene canchas cargadas.</td></tr>';
      return;
    }
    tbody.innerHTML = canchas.map((c) => `
      <tr>
        <td>${escapeHtml(c.nombre || '-')}${c.es_principal ? ' <span class="badge badge-activo">Principal</span>' : ''}</td>
        <td>${c.tipo_techo === 'techada' ? 'Techada' : 'Aire libre'}</td>
        <td>${escapeHtml(c.tamanio || '-')}</td>
        <td>${escapeHtml(c.piso || '-')}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="editarCanchaSecundaria('${c.id}')">Editar</button>
          ${!c.es_principal ? `<button class="btn btn-peligro btn-pequeno" onclick="eliminarCanchaSecundaria('${c.id}')">Eliminar</button>` : ''}
        </td>
      </tr>
    `).join('');
    window.canchasClubCache = canchas;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function limpiarFormCanchaSecundaria() {
  document.getElementById('canchaIdEdicion').value = '';
  document.getElementById('canchaNombre').value = '';
  document.getElementById('canchaTecho').value = 'aire_libre';
  document.getElementById('canchaTamanio').value = '';
  document.getElementById('canchaPiso').value = '';
  document.getElementById('canchaFormError').classList.add('oculto');
  document.getElementById('btnGuardarCanchaSecundaria').textContent = 'Agregar cancha';
  document.getElementById('btnCancelarCanchaSecundaria').classList.add('oculto');
}

function editarCanchaSecundaria(canchaId) {
  const cancha = (window.canchasClubCache || []).find((c) => c.id === canchaId);
  if (!cancha) return;
  document.getElementById('canchaIdEdicion').value = cancha.id;
  document.getElementById('canchaNombre').value = cancha.nombre || '';
  document.getElementById('canchaTecho').value = cancha.tipo_techo || 'aire_libre';
  document.getElementById('canchaTamanio').value = cancha.tamanio || '';
  document.getElementById('canchaPiso').value = cancha.piso || '';
  document.getElementById('btnGuardarCanchaSecundaria').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarCanchaSecundaria').classList.remove('oculto');
}

async function guardarCanchaSecundaria(e) {
  e.preventDefault();
  const errorEl = document.getElementById('canchaFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('canchaIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('canchaNombre').value.trim(),
    tipo_techo: document.getElementById('canchaTecho').value,
    tamanio: document.getElementById('canchaTamanio').value.trim() || undefined,
    piso: document.getElementById('canchaPiso').value.trim() || undefined
  };

  try {
    if (id) {
      await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas`, { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    limpiarFormCanchaSecundaria();
    await cargarCanchasClub();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarCanchaSecundaria(canchaId) {
  if (!confirm('¿Eliminar esta cancha?')) return;
  try {
    await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas/${canchaId}`, { method: 'DELETE' });
    await cargarCanchasClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== POSTULACIONES DE CLUBES =====================

function pintarLinkYQrPostulacion() {
  if (!ligaSlugActual) return;
  const url = `${window.location.origin}/sitio/postulacion.html?slug=${ligaSlugActual}`;
  document.getElementById('linkPostulacionPublica').value = url;
  const contenedor = document.getElementById('qrPostulacionContenedor');
  contenedor.innerHTML = '';
  if (window.QRCode) {
    // eslint-disable-next-line no-new
    new QRCode(contenedor, { text: url, width: 120, height: 120 });
  }
}

async function compartirLinkPostulacion() {
  const url = document.getElementById('linkPostulacionPublica').value;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Postulate como Club', url });
    } catch (err) {
      // el usuario canceló el share nativo, no hacemos nada
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    alert('Link copiado al portapapeles.');
  }
}

function descargarQrPostulacion() {
  const contenedor = document.getElementById('qrPostulacionContenedor');
  const canvas = contenedor.querySelector('canvas');
  const img = contenedor.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `qr-postulacion-${ligaSlugActual || 'liga'}.png`;
  link.click();
}

async function cargarPostulaciones() {
  const tbody = document.getElementById('tablaPostulaciones');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  const estado = document.getElementById('filtroEstadoPostulacion').value;
  try {
    const params = estado ? `?estado=${estado}` : '';
    const data = await apiFetch(`/liga/postulaciones${params}`);
    const postulaciones = data.postulaciones;
    if (!postulaciones.length) {
      tbody.innerHTML = '<tr><td colspan="6">No hay postulaciones en este estado.</td></tr>';
      return;
    }
    const badgesEstado = { pendiente: 'badge-pendiente', aceptada: 'badge-activo', rechazada: 'badge-inactivo' };
    tbody.innerHTML = postulaciones.map((p) => `
      <tr>
        <td>${p.logo_url ? `<img class="logo-miniatura" src="${p.logo_url}" alt="">` : '<span class="logo-miniatura"></span>'}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.ciudad || '-')}${p.provincia ? ` (${escapeHtml(p.provincia)})` : ''}</td>
        <td>${escapeHtml(p.telefono || '-')}<br>${escapeHtml(p.email_contacto || '-')}</td>
        <td><span class="badge ${badgesEstado[p.estado] || ''}">${escapeHtml(p.estado)}</span></td>
        <td>
          ${p.estado === 'pendiente' ? `
            <button class="btn btn-pequeno" onclick="aceptarPostulacion('${p.id}')">Aceptar</button>
            <button class="btn btn-peligro btn-pequeno" onclick="rechazarPostulacion('${p.id}')">Rechazar</button>
          ` : (p.motivo_rechazo ? `<span class="texto-ayuda">Motivo: ${escapeHtml(p.motivo_rechazo)}</span>` : '-')}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function aceptarPostulacion(id) {
  if (!confirm('¿Aceptar esta postulación? Se va a crear el club y quedará anotado en tu Liga.')) return;
  try {
    await apiFetch(`/liga/postulaciones/${id}/aceptar`, { method: 'PATCH' });
    cargarPostulaciones();
    paginaClubesActual = 1;
    cargarClubes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rechazarPostulacion(id) {
  const motivo = prompt('Motivo del rechazo (opcional):');
  if (motivo === null) return;
  try {
    await apiFetch(`/liga/postulaciones/${id}/rechazar`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo_rechazo: motivo.trim() || undefined })
    });
    cargarPostulaciones();
  } catch (err) {
    alert('Error: ' + err.message);
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
          <button class="btn btn-secundario btn-pequeno" onclick="editarTorneo('${t.id}')">Editar</button>
          <button class="btn btn-secundario btn-pequeno" onclick="verCategorias('${t.id}', '${escapeHtml(t.nombre)}')">Categorías</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarTorneo(torneoId) {
  const torneo = torneosCache.find((t) => t.id === torneoId);
  if (!torneo) return;
  document.getElementById('torneoIdEdicion').value = torneo.id;
  document.getElementById('torneoNombre').value = torneo.nombre || '';
  document.getElementById('torneoDeporte').value = torneo.deporte || 'futbol';
  document.getElementById('torneoTemporada').value = torneo.temporada || '';
  document.getElementById('torneoFormato').value = torneo.formato_juego || 'todos_contra_todos';
  const sp = torneo.sistema_puntaje || {};
  document.getElementById('torneoPtsVictoria').value = sp.victoria != null ? sp.victoria : 3;
  document.getElementById('torneoPtsEmpate').value = sp.empate != null ? sp.empate : 1;
  document.getElementById('torneoFormError').classList.add('oculto');
  document.getElementById('formTorneo').classList.remove('oculto');
  mostrarFondoModal();
}

async function guardarTorneo(e) {
  e.preventDefault();
  const errorEl = document.getElementById('torneoFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('torneoIdEdicion').value;
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
    if (id) {
      await apiFetch(`/liga/torneos/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/torneos', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formTorneo').classList.add('oculto');
    ocultarFondoModal();
    cargarTorneos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== CATEGORÍAS =====================

function verCategorias(torneoId, nombreTorneo) {
  torneoActualId = torneoId;
  mostrarFondoModal();
  torneoActualNombre = nombreTorneo;
  document.getElementById('panelCategorias').classList.remove('oculto');
  document.getElementById('panelDetalleCategoria').classList.add('oculto');
  document.getElementById('tituloCategorias').textContent = `Categorías de "${nombreTorneo}"`;
  document.getElementById('formCategoria').classList.add('oculto');
  cargarCategorias(torneoId);
}

async function cargarCategorias(torneoId) {
  const tbody = document.getElementById('tablaCategorias');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoId}/categorias`);
    categoriasCache = data.categorias;
    if (!categoriasCache.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay categorías en este torneo.</td></tr>';
      return;
    }
    tbody.innerHTML = categoriasCache.map((c) => `
      <tr>
        <td>${escapeHtml(c.nombre)}</td>
        <td>${escapeHtml(c.genero || '-')}</td>
        <td>${escapeHtml(c.subcategoria || '-')}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="verDetalleCategoria('${c.id}', '${escapeHtml(c.nombre)}')">Ver detalle</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarCategoria(e) {
  e.preventDefault();
  const errorEl = document.getElementById('categoriaFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    nombre: document.getElementById('categoriaNombre').value.trim(),
    genero: document.getElementById('categoriaGenero').value || undefined,
    subcategoria: document.getElementById('categoriaSubcategoria').value.trim() || undefined
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
  document.getElementById('panelCategorias').classList.add('oculto');
  document.getElementById('panelDetalleCategoria').classList.remove('oculto');
  document.getElementById('tituloDetalleCategoria').textContent = `${nombreCategoria} — ${torneoActualNombre}`;
  document.getElementById('formGenerarFixture').classList.add('oculto');
  document.getElementById('formPartido').classList.add('oculto');
  document.getElementById('fixtureIdaVuelta').checked = false;
  cambiarTabDetalle('equipos');
}

function cambiarTabDetalle(nombre) {
  const secciones = {
    equipos: 'subSeccionEquipos', fixture: 'subSeccionFixture', tabla: 'subSeccionTabla',
    goleadores: 'subSeccionGoleadores', tarjetas: 'subSeccionTarjetas'
  };
  const botones = {
    equipos: 'tabBtnEquipos', fixture: 'tabBtnFixture', tabla: 'tabBtnTabla',
    goleadores: 'tabBtnGoleadores', tarjetas: 'tabBtnTarjetas'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'equipos') cargarEquipos();
  if (nombre === 'fixture') cargarPartidos();
  if (nombre === 'tabla') cargarTabla();
  if (nombre === 'goleadores') cargarGoleadores();
  if (nombre === 'tarjetas') cargarTarjetas();
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
      tbody.innerHTML = equiposCache.map((eq) => `<tr><td>${swatch(eq.club_color_primario)}${escapeHtml(eq.club_nombre)}</td></tr>`).join('');
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
        <td>${swatch(p.club_local_color)}${escapeHtml(p.club_local_nombre)}</td>
        <td>${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'Sin jugar'}</td>
        <td>${swatch(p.club_visitante_color)}${escapeHtml(p.club_visitante_nombre)}</td>
        <td><span class="badge ${p.estado === 'jugado' ? 'badge-activo' : 'badge-inactivo'}">${escapeHtml(p.estado || 'programado')}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="abrirModalResultado('${p.id}')">Cargar resultado</button>
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

async function generarFixtureAutomatico(e) {
  e.preventDefault();
  const errorEl = document.getElementById('fixtureAccionError');
  errorEl.classList.add('oculto');
  const idaVuelta = document.getElementById('fixtureIdaVuelta').checked;
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/fixture/generar`, {
      method: 'POST',
      body: JSON.stringify({ ida_vuelta: idaVuelta })
    });
    document.getElementById('formGenerarFixture').classList.add('oculto');
    alert(`Se generaron ${data.partidos_creados} partidos en ${data.jornadas} jornadas.`);
    cargarPartidos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function vaciarFixture() {
  if (!confirm('¿Vaciar el fixture de esta categoría? Se borran los partidos programados que todavía NO tienen resultado cargado (los ya jugados se conservan).')) {
    return;
  }
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/fixture`, { method: 'DELETE' });
    alert(`Se borraron ${data.borrados} partidos.`);
    cargarPartidos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ----- Modal de carga de resultado + goles/tarjetas por jugador -----

let estadisticasPartidoActualId = null;

async function abrirModalResultado(partidoId) {
  estadisticasPartidoActualId = partidoId;
  const partido = partidosCache.find((p) => p.id === partidoId);
  document.getElementById('resultadoPartidoId').value = partidoId;
  document.getElementById('resultadoFormError').classList.add('oculto');
  document.getElementById('resultadoLocalScore').value = partido && partido.resultado_local != null ? partido.resultado_local : '';
  document.getElementById('resultadoVisitanteScore').value = partido && partido.resultado_visitante != null ? partido.resultado_visitante : '';
  if (partido) {
    document.getElementById('labelResultadoLocal').textContent = `Goles ${partido.club_local_nombre}`;
    document.getElementById('labelResultadoVisitante').textContent = `Goles ${partido.club_visitante_nombre}`;
  }

  const contenedor = document.getElementById('contenedorEstadisticasJugadores');
  contenedor.innerHTML = 'Cargando jugadores...';
  document.getElementById('panelCargarResultado').classList.remove('oculto');
  document.getElementById('fondoModalResultado').classList.remove('oculto');

  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}/jugadores`);
    const estadisticasPorJugador = {};
    (data.estadisticas || []).forEach((e) => { estadisticasPorJugador[e.jugador_id] = e; });

    const bloque = (titulo, jugadores, equipoTorneoId) => `
      <div class="bloque-equipo-stats">
        <h4>${escapeHtml(titulo)} — goles y tarjetas por jugador</h4>
        ${jugadores.length ? jugadores.map((j) => {
          const est = estadisticasPorJugador[j.id] || {};
          return `
            <div class="fila-jugador-stats" data-jugador-id="${j.id}" data-equipo-torneo-id="${equipoTorneoId}">
              <span class="nombre-jugador">${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}${j.numero_camiseta ? ` (#${j.numero_camiseta})` : ''}</span>
              <label>Goles</label><input type="number" min="0" class="stat-goles" value="${est.goles || 0}">
              <label>Am.</label><input type="number" min="0" class="stat-amarillas" value="${est.tarjetas_amarillas || 0}">
              <label>Roj.</label><input type="number" min="0" class="stat-rojas" value="${est.tarjetas_rojas || 0}">
            </div>
          `;
        }).join('') : '<p class="texto-ayuda">Este club todavía no tiene jugadores cargados.</p>'}
      </div>
    `;

    contenedor.innerHTML =
      bloque(partido ? partido.club_local_nombre : 'Equipo local', data.jugadores_local, data.equipo_local_id) +
      bloque(partido ? partido.club_visitante_nombre : 'Equipo visitante', data.jugadores_visitante, data.equipo_visitante_id);
  } catch (err) {
    contenedor.innerHTML = `<p class="mensaje-error">Error cargando jugadores: ${escapeHtml(err.message)}</p>`;
  }
}

function cerrarModalResultado() {
  document.getElementById('panelCargarResultado').classList.add('oculto');
  document.getElementById('fondoModalResultado').classList.add('oculto');
  estadisticasPartidoActualId = null;
}

async function guardarResultadoConEstadisticas(e) {
  e.preventDefault();
  const errorEl = document.getElementById('resultadoFormError');
  errorEl.classList.add('oculto');

  const partidoId = document.getElementById('resultadoPartidoId').value;
  const resultadoLocal = document.getElementById('resultadoLocalScore').value;
  const resultadoVisitante = document.getElementById('resultadoVisitanteScore').value;

  const estadisticas = [];
  document.querySelectorAll('#contenedorEstadisticasJugadores .fila-jugador-stats').forEach((fila) => {
    estadisticas.push({
      jugador_id: fila.dataset.jugadorId,
      equipo_torneo_id: fila.dataset.equipoTorneoId,
      goles: fila.querySelector('.stat-goles').value || 0,
      tarjetas_amarillas: fila.querySelector('.stat-amarillas').value || 0,
      tarjetas_rojas: fila.querySelector('.stat-rojas').value || 0
    });
  });

  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}/resultado`, {
      method: 'PUT',
      body: JSON.stringify({
        resultado_local: Number(resultadoLocal),
        resultado_visitante: Number(resultadoVisitante),
        estadisticas_jugadores: estadisticas
      })
    });
    cerrarModalResultado();
    cargarPartidos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Goleadores y Tarjetas -----

async function cargarGoleadores() {
  const tbody = document.getElementById('tablaGoleadores');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/goleadores`);
    const goleadores = data.goleadores;
    if (!goleadores.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay goles cargados en esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = goleadores.map((g) => `
      <tr>
        <td>${escapeHtml(g.apellido)}, ${escapeHtml(g.nombre)}</td>
        <td>${escapeHtml(g.club_nombre)}</td>
        <td>${g.goles}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cargarTarjetas() {
  const tbody = document.getElementById('tablaTarjetas');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/tarjetas`);
    const tarjetas = data.tarjetas;
    if (!tarjetas.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay tarjetas cargadas en esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = tarjetas.map((t) => `
      <tr>
        <td>${escapeHtml(t.apellido)}, ${escapeHtml(t.nombre)}</td>
        <td>${escapeHtml(t.club_nombre)}</td>
        <td>${t.tarjetas_amarillas}</td>
        <td>${t.tarjetas_rojas}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
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
        <td>${swatch(fila.club_color_primario)}${escapeHtml(fila.club_nombre)}</td>
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

// Chip de color de marca de un club, para usar junto a su nombre en
// listados (equipos, fixture, tabla de posiciones) — así el color del club
// se ve en toda la plataforma y no solo en su propio encabezado.
function swatch(color) {
  if (!color) return '';
  return `<span class="club-swatch" style="background:${color};"></span>`;
}

document.addEventListener('DOMContentLoaded', init);
