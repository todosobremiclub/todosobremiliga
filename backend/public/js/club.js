// Lógica del Panel de Club: Jugadores + Fichajes/Carnets.

let jugadoresCache = [];
let ligasClubCache = [];

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
    document.getElementById('jugadorFormError').classList.add('oculto');
    document.getElementById('formJugador').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormJugador').addEventListener('click', () => {
    document.getElementById('formJugador').classList.add('oculto');
  });
  document.getElementById('formJugador').addEventListener('submit', guardarJugador);

  document.getElementById('btnCerrarSolicitarFichaje').addEventListener('click', () => {
    document.getElementById('panelSolicitarFichaje').classList.add('oculto');
  });
  document.getElementById('fichajeLiga').addEventListener('change', onCambioLigaFichaje);
  document.getElementById('fichajeTorneo').addEventListener('change', onCambioTorneoFichaje);
  document.getElementById('formSolicitarFichaje').addEventListener('submit', enviarSolicitudFichaje);
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
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/jugadores');
    jugadoresCache = data.jugadores;
    if (!jugadoresCache.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no cargaste ningún jugador.</td></tr>';
      return;
    }
    tbody.innerHTML = jugadoresCache.map((j) => `
      <tr>
        <td>${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}</td>
        <td>${escapeHtml(j.dni)}</td>
        <td>${j.numero_camiseta != null ? j.numero_camiseta : '-'}</td>
        <td><span class="badge ${j.activo ? 'badge-activo' : 'badge-inactivo'}">${j.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="abrirSolicitarFichaje('${j.id}', '${escapeHtml(j.nombre)} ${escapeHtml(j.apellido)}')">Pedir fichaje</button>
          <button class="btn ${j.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoJugador('${j.id}', ${!j.activo})">${j.activo ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
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
    foto_url: document.getElementById('jugadorFotoUrl').value.trim() || undefined
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
  document.getElementById('panelSolicitarFichaje').classList.remove('oculto');
  document.getElementById('tituloSolicitarFichaje').textContent = `Pedir fichaje de "${nombreCompleto}"`;
  document.getElementById('fichajeJugadorId').value = jugadorId;
  document.getElementById('fichajeFormError').classList.add('oculto');
  document.getElementById('fichajeFormOk').classList.add('oculto');
  document.getElementById('formSolicitarFichaje').reset();
  document.getElementById('fichajeJugadorId').value = jugadorId;

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

  const jugadorId = document.getElementById('fichajeJugadorId').value;
  const ligaId = document.getElementById('fichajeLiga').value;
  const torneoId = document.getElementById('fichajeTorneo').value;
  const categoriaId = document.getElementById('fichajeCategoria').value;

  if (!ligaId || !torneoId || !categoriaId) {
    errorEl.textContent = 'Tenés que elegir una Liga, un Torneo y una Categoría.';
    errorEl.classList.remove('oculto');
    return;
  }

  try {
    await apiFetch(`/club/jugadores/${jugadorId}/fichajes`, {
      method: 'POST',
      body: JSON.stringify({
        liga_id: ligaId,
        torneo_id: torneoId,
        categoria_id: categoriaId
      })
    });
    okEl.textContent = 'Solicitud de fichaje enviada correctamente. Quedó pendiente de aprobación de la Liga.';
    okEl.classList.remove('oculto');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== FICHAJES Y CARNETS =====================

async function cargarFichajes() {
  const tbody = document.getElementById('tablaFichajes');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/club/fichajes');
    const fichajes = data.fichajes;
    if (!fichajes.length) {
      tbody.innerHTML = '<tr><td colspan="6">Todavía no pediste ningún fichaje.</td></tr>';
      return;
    }
    const badgesEstado = { pendiente: 'badge-pendiente', aprobado: 'badge-activo', rechazado: 'badge-inactivo' };
    tbody.innerHTML = fichajes.map((f) => {
      let carnetHtml = '-';
      if (f.carnet_codigo_qr) {
        const vigenteBadge = f.carnet_activo
          ? '<span class="badge badge-activo">Vigente</span>'
          : '<span class="badge badge-inactivo">No vigente</span>';
        carnetHtml = `<div class="carnet-info"><span class="carnet-codigo">${escapeHtml(f.carnet_codigo_qr)}</span><br>${vigenteBadge}</div>`;
      } else if (f.estado === 'rechazado' && f.motivo_rechazo) {
        carnetHtml = `<span class="carnet-info">Motivo: ${escapeHtml(f.motivo_rechazo)}</span>`;
      }
      return `
        <tr>
          <td>${escapeHtml(f.jugador_nombre)} ${escapeHtml(f.jugador_apellido)}</td>
          <td>${escapeHtml(f.liga_nombre)}</td>
          <td>${escapeHtml(f.torneo_nombre || '-')}</td>
          <td>${escapeHtml(f.categoria_nombre || '-')}</td>
          <td><span class="badge ${badgesEstado[f.estado] || ''}">${escapeHtml(f.estado)}</span></td>
          <td>${carnetHtml}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
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
