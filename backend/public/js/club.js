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

function init() {
  const usuario = requerirRol(['club_admin', 'super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  conectarEventos();
  cargarJugadores();
}

function conectarEventos() {
  document.getElementById('tabBtnJugadores').addEventListener('click', () => cambiarTab('jugadores'));
  document.getElementById('tabBtnFichajes').addEventListener('click', () => cambiarTab('fichajes'));
  document.getElementById('tabBtnNotificaciones').addEventListener('click', () => cambiarTab('notificaciones'));
  document.getElementById('tabBtnDocumentos').addEventListener('click', () => cambiarTab('documentos'));
  document.getElementById('formDocumentoClub').addEventListener('submit', subirDocumentoClub);

  document.getElementById('btnMostrarFormJugador').addEventListener('click', () => {
    document.getElementById('formJugador').reset();
    document.getElementById('jugadorFotoUrl').value = '';
    document.getElementById('jugadorFotoPreview').classList.add('oculto');
    document.getElementById('jugadorFormError').classList.add('oculto');
    document.getElementById('formJugador').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormJugador').addEventListener('click', () => {
    document.getElementById('formJugador').classList.add('oculto');
  });
  document.getElementById('jugadorFotoArchivo').addEventListener('change', onElegirFotoJugador);
  document.getElementById('formJugador').addEventListener('submit', guardarJugador);

  document.getElementById('buscadorJugadores').addEventListener('input', renderJugadores);
  document.getElementById('filtroAnioNacimientoJugadores').addEventListener('change', renderJugadores);
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
  document.getElementById('formSolicitarFichaje').addEventListener('submit', enviarSolicitudFichaje);

  document.getElementById('buscadorFichajes').addEventListener('input', renderFichajes);
  document.getElementById('filtroTorneoFichajes').addEventListener('change', () => {
    poblarFiltroCategoriaFichajes();
    renderFichajes();
  });
  document.getElementById('filtroCategoriaFichajes').addEventListener('change', renderFichajes);
  document.getElementById('btnCerrarVerCarnet').addEventListener('click', cerrarCarnet);
}

function cambiarTab(nombre) {
  const secciones = {
    jugadores: 'seccionJugadores', fichajes: 'seccionFichajes',
    notificaciones: 'seccionNotificaciones', documentos: 'seccionDocumentos'
  };
  const botones = {
    jugadores: 'tabBtnJugadores', fichajes: 'tabBtnFichajes',
    notificaciones: 'tabBtnNotificaciones', documentos: 'tabBtnDocumentos'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'fichajes') cargarFichajes();
  if (nombre === 'notificaciones') cargarNotificacionesClub();
  if (nombre === 'documentos') cargarDocumentosClub();
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

// ===================== JUGADORES =====================

async function cargarJugadores() {
  const tbody = document.getElementById('tablaJugadores');
  tbody.innerHTML = '<tr><td colspan="8">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/jugadores');
    jugadoresCache = data.jugadores;
    jugadoresSeleccionados.clear();
    poblarFiltroAnioNacimiento();
    renderJugadores();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Error: ${escapeHtml(err.message)}</td></tr>`;
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

  const lista = jugadoresCache.filter((j) => {
    if (texto) {
      const nombreCompleto = `${j.nombre} ${j.apellido}`.toLowerCase();
      if (!nombreCompleto.includes(texto)) return false;
    }
    if (anio && String(j.anio_nacimiento || '') !== anio) return false;
    return true;
  });

  if (!jugadoresCache.length) {
    tbody.innerHTML = '<tr><td colspan="8">Todavía no cargaste ningún jugador.</td></tr>';
    return;
  }
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="8">No se encontraron jugadores con ese filtro.</td></tr>';
    return;
  }
  tbody.innerHTML = lista.map((j) => `
    <tr>
      <td><input type="checkbox" class="check-jugador" data-jugador-id="${j.id}" onchange="toggleSeleccionJugador('${j.id}', this.checked)" ${jugadoresSeleccionados.has(j.id) ? 'checked' : ''}></td>
      <td>${fotoJugadorHtml(j.foto_url, 'foto-jugador-mini')}</td>
      <td>${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}</td>
      <td>${escapeHtml(j.dni)}</td>
      <td>${formatearFecha(j.fecha_nacimiento)}</td>
      <td>${j.numero_camiseta != null ? j.numero_camiseta : '-'}</td>
      <td><span class="badge ${j.activo ? 'badge-activo' : 'badge-inactivo'}">${j.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <button class="btn btn-secundario btn-pequeno" onclick="abrirSolicitarFichaje('${j.id}', '${escapeHtml(j.nombre)} ${escapeHtml(j.apellido)}')">Pedir fichaje</button>
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
    foto_url: document.getElementById('jugadorFotoUrl').value || undefined
  };

  try {
    await apiFetch('/club/jugadores', { method: 'POST', body: JSON.stringify(cuerpo) });
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
  selectTorneo.innerHTML = '';
  selectTorneo.disabled = true;
  selectCategoria.innerHTML = '';
  selectCategoria.disabled = true;

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
  selectCategoria.innerHTML = '';
  selectCategoria.disabled = true;

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
  const torneoId = selectTorneo.value;
  if (!torneoId) {
    selectCategoria.innerHTML = '';
    selectCategoria.disabled = true;
    return;
  }

  selectCategoria.innerHTML = '<option value="">Cargando...</option>';
  selectCategoria.disabled = true;
  try {
    const res = await fetch(`/web/torneos/${torneoId}/categorias`);
    const data = await res.json();
    if (!data.ok || !data.categorias.length) {
      selectCategoria.innerHTML = '<option value="">Sin categorías</option>';
      return;
    }
    selectCategoria.innerHTML = '<option value="">Elegí una categoría...</option>' +
      data.categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    selectCategoria.disabled = false;
  } catch (err) {
    selectCategoria.innerHTML = '<option value="">Error cargando categorías</option>';
  }
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

  if (!ligaId || !torneoId || !categoriaId) {
    errorEl.textContent = 'Tenés que elegir una Liga, un Torneo y una Categoría.';
    errorEl.classList.remove('oculto');
    return;
  }
  if (!fichajeJugadorIdsActual.length) {
    errorEl.textContent = 'No hay ningún jugador seleccionado.';
    errorEl.classList.remove('oculto');
    return;
  }

  // Uno o varios jugadores (fichaje masivo), todos a la misma Liga/Torneo/
  // Categoría; si alguno falla (ej: ya estaba fichado) seguimos con el resto
  // y avisamos al final quiénes no se pudieron mandar.
  const fallidos = [];
  for (const jugadorId of fichajeJugadorIdsActual) {
    try {
      await apiFetch(`/club/jugadores/${jugadorId}/fichajes`, {
        method: 'POST',
        body: JSON.stringify({
          liga_id: ligaId,
          torneo_id: torneoId,
          categoria_id: categoriaId
        })
      });
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
    okEl.textContent = `Se envió correctamente la solicitud de fichaje para ${exitosos} jugador(es). Queda(n) pendiente(s) de aprobación de la Liga.`;
    okEl.classList.remove('oculto');
  }
}

// ===================== FICHAJES Y CARNETS =====================

async function cargarFichajes() {
  const tbody = document.getElementById('tablaFichajes');
  tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/fichajes');
    fichajesCache = data.fichajes;
    poblarFiltroTorneoFichajes();
    poblarFiltroCategoriaFichajes();
    renderFichajes();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function poblarFiltroTorneoFichajes() {
  const select = document.getElementById('filtroTorneoFichajes');
  const actual = select.value;
  const torneos = [];
  const vistos = new Set();
  fichajesCache.forEach((f) => {
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
  const torneoId = document.getElementById('filtroTorneoFichajes').value;
  const actual = select.value;
  const categorias = [];
  const vistos = new Set();
  fichajesCache.forEach((f) => {
    if (torneoId && f.torneo_id !== torneoId) return;
    if (f.categoria_id && !vistos.has(f.categoria_id)) {
      vistos.add(f.categoria_id);
      categorias.push({ id: f.categoria_id, nombre: f.categoria_nombre });
    }
  });
  categorias.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre || '-')}</option>`).join('');
  if (categorias.some((c) => c.id === actual)) select.value = actual;
}

function renderFichajes() {
  const tbody = document.getElementById('tablaFichajes');
  const texto = (document.getElementById('buscadorFichajes').value || '').trim().toLowerCase();
  const torneoId = document.getElementById('filtroTorneoFichajes').value;
  const categoriaId = document.getElementById('filtroCategoriaFichajes').value;

  const lista = fichajesCache.filter((f) => {
    if (texto) {
      const nombreCompleto = `${f.jugador_nombre} ${f.jugador_apellido}`.toLowerCase();
      if (!nombreCompleto.includes(texto)) return false;
    }
    if (torneoId && f.torneo_id !== torneoId) return false;
    if (categoriaId && f.categoria_id !== categoriaId) return false;
    return true;
  });

  if (!fichajesCache.length) {
    tbody.innerHTML = '<tr><td colspan="7">Todavía no pediste ningún fichaje.</td></tr>';
    return;
  }
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="7">No se encontraron fichajes con ese filtro.</td></tr>';
    return;
  }

  const badgesEstado = { pendiente: 'badge-pendiente', aprobado: 'badge-activo', rechazado: 'badge-inactivo' };
  tbody.innerHTML = lista.map((f) => {
    let carnetHtml = '-';
    if (f.carnet_codigo_qr) {
      carnetHtml = `<button class="btn btn-secundario btn-pequeno" onclick="abrirCarnet('${f.id}')">Ver carnet</button>`;
    } else if (f.estado === 'rechazado' && f.motivo_rechazo) {
      carnetHtml = `<span class="carnet-info">Motivo: ${escapeHtml(f.motivo_rechazo)}</span>`;
    }
    return `
      <tr>
        <td>${fotoJugadorHtml(f.jugador_foto_url, 'foto-jugador-mini')}</td>
        <td>${escapeHtml(f.jugador_nombre)} ${escapeHtml(f.jugador_apellido)}</td>
        <td>${escapeHtml(f.liga_nombre)}</td>
        <td>${escapeHtml(f.torneo_nombre || '-')}</td>
        <td>${escapeHtml(f.categoria_nombre || '-')}</td>
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
          <div><span>Categoría</span><span>${escapeHtml(f.categoria_nombre || '-')}</span></div>
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
