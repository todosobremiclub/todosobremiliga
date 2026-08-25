// Página pública de un Equipo (perfil de club dentro de un torneo/división):
// últimos resultados, próximos partidos, resultados, plantel del club y
// goleadores/tarjetas de todo el torneo.

function getParamsDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    torneoId: params.get('torneoId'),
    categoriaId: params.get('categoriaId'),
    equipoTorneoId: params.get('equipoTorneoId'),
    nombre: params.get('nombre')
  };
}

let torneoIdActual = null;
let categoriaIdActual = null;
let equipoTorneoIdActual = null;
let clubIdActual = null;

async function init() {
  const { torneoId, categoriaId, equipoTorneoId, nombre } = getParamsDeUrl();
  torneoIdActual = torneoId;
  categoriaIdActual = categoriaId;
  equipoTorneoIdActual = equipoTorneoId;

  if (nombre) document.getElementById('nombreEquipo').textContent = nombre;

  if (!torneoId || !categoriaId || !equipoTorneoId) {
    document.getElementById('nombreEquipo').textContent = 'Equipo no especificado';
    document.getElementById('tablaProximos').innerHTML = '<tr><td colspan="4">Faltan datos en la URL.</td></tr>';
    return;
  }

  document.getElementById('linkVolverCategoria').href = `/sitio/torneo.html?id=${torneoId}&categoriaId=${categoriaId}`;

  document.getElementById('tabBtnProximos').addEventListener('click', () => cambiarTab('proximos'));
  document.getElementById('tabBtnResultados').addEventListener('click', () => cambiarTab('resultados'));
  document.getElementById('tabBtnPlantel').addEventListener('click', () => cambiarTab('plantel'));
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTab('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTab('tarjetas'));

  await cargarEquipo();
  await cargarFixtureEquipo();
}

function cambiarTab(nombre) {
  const secciones = {
    proximos: 'seccionProximos', resultados: 'seccionResultados', plantel: 'seccionPlantel',
    goleadores: 'seccionGoleadoresEquipo', tarjetas: 'seccionTarjetasEquipo'
  };
  const botones = {
    proximos: 'tabBtnProximos', resultados: 'tabBtnResultados', plantel: 'tabBtnPlantel',
    goleadores: 'tabBtnGoleadores', tarjetas: 'tabBtnTarjetas'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'plantel') cargarPlantel();
  if (nombre === 'goleadores') cargarGoleadoresEquipo();
  if (nombre === 'tarjetas') cargarTarjetasEquipo();
}

async function cargarEquipo() {
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/equipos/${equipoTorneoIdActual}`);
    const data = await res.json();
    if (!data.ok) {
      document.getElementById('nombreEquipo').textContent = 'Equipo no encontrado';
      return;
    }
    const equipo = data.equipo;
    clubIdActual = equipo.club_id;
    document.getElementById('nombreEquipo').textContent = equipo.club_nombre;
    document.title = `${equipo.club_nombre} - Todo Sobre mi Liga`;
    aplicarTemaLiga(equipo.color_primario, equipo.color_secundario);
    if (equipo.club_logo_url) {
      const logoEl = document.getElementById('equipoLogo');
      logoEl.src = equipo.club_logo_url;
      logoEl.classList.remove('oculto');
    }
  } catch (err) {
    document.getElementById('nombreEquipo').textContent = 'Error cargando el equipo';
  }
}

// El backend devuelve la fecha como fecha/hora ISO completa (ej.
// "2026-08-01T00:00:00.000Z"); hay que parsearla en UTC para no perder un
// día y mostrarla en formato local legible (ej. "1/8/2026").
function formatearFechaPartido(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  return d.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

function renderUltimos5Html(ultimos5) {
  if (!ultimos5 || !ultimos5.length) return '<span class="texto-ayuda">Todavía no jugó partidos con resultado cargado.</span>';
  const clases = { V: 'badge-ultimo-v', E: 'badge-ultimo-e', P: 'badge-ultimo-p' };
  return `<div class="ultimos5">${ultimos5.map((r) => `<span class="badge-ultimo ${clases[r] || ''}">${r}</span>`).join('')}</div>`;
}

let partidosEquipoCache = [];

async function cargarFixtureEquipo() {
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/equipos/${equipoTorneoIdActual}/fixture`);
    const data = await res.json();
    partidosEquipoCache = data.ok ? data.partidos : [];
  } catch (err) {
    partidosEquipoCache = [];
  }

  const jugados = partidosEquipoCache
    .filter((p) => p.resultado_local != null && p.resultado_visitante != null)
    .sort((a, b) => new Date(b.fecha || 0) - new Date(a.fecha || 0));
  const ultimos5 = jugados.slice(0, 5).map((p) => resultadoDelEquipo(p));
  document.getElementById('equipoUltimas5').innerHTML = renderUltimos5Html(ultimos5);

  renderProximos();
  renderResultados(jugados);
}

// 'V' | 'E' | 'P' desde el punto de vista del equipo actual.
function resultadoDelEquipo(p) {
  const esLocal = p.equipo_local_id === equipoTorneoIdActual;
  const golesPropios = esLocal ? p.resultado_local : p.resultado_visitante;
  const golesRival = esLocal ? p.resultado_visitante : p.resultado_local;
  if (golesPropios === golesRival) return 'E';
  return golesPropios > golesRival ? 'V' : 'P';
}

function nombreRival(p) {
  const esLocal = p.equipo_local_id === equipoTorneoIdActual;
  return {
    nombre: esLocal ? p.club_visitante_nombre : p.club_local_nombre,
    color: esLocal ? p.club_visitante_color : p.club_local_color,
    logoUrl: esLocal ? p.club_visitante_logo_url : p.club_local_logo_url,
    lv: esLocal ? 'L' : 'V'
  };
}

function renderProximos() {
  const tbody = document.getElementById('tablaProximos');
  const proximos = partidosEquipoCache
    .filter((p) => p.resultado_local == null || p.resultado_visitante == null)
    .sort((a, b) => new Date(a.fecha || '9999-12-31') - new Date(b.fecha || '9999-12-31'));
  if (!proximos.length) {
    tbody.innerHTML = '<tr><td colspan="4">No hay próximos partidos programados.</td></tr>';
    return;
  }
  tbody.innerHTML = proximos.map((p) => {
    const rival = nombreRival(p);
    return `
      <tr>
        <td>${p.fecha ? escapeHtml(formatearFechaPartido(p.fecha)) : '-'}</td>
        <td>${rival.lv}</td>
        <td>${escudoClub(rival.logoUrl, rival.color)}${escapeHtml(rival.nombre)}</td>
        <td>${p.hora ? escapeHtml(String(p.hora).slice(0, 5)) : '-'}</td>
      </tr>
    `;
  }).join('');
}

function renderResultados(jugados) {
  const tbody = document.getElementById('tablaResultados');
  if (!jugados.length) {
    tbody.innerHTML = '<tr><td colspan="4">Todavía no hay resultados cargados.</td></tr>';
    return;
  }
  tbody.innerHTML = jugados.map((p) => {
    const rival = nombreRival(p);
    const resultado = p.equipo_local_id === equipoTorneoIdActual
      ? `${p.resultado_local} - ${p.resultado_visitante}`
      : `${p.resultado_visitante} - ${p.resultado_local}`;
    return `
      <tr>
        <td>${p.fecha ? escapeHtml(formatearFechaPartido(p.fecha)) : '-'}</td>
        <td>${rival.lv}</td>
        <td>${escudoClub(rival.logoUrl, rival.color)}${escapeHtml(rival.nombre)}</td>
        <td>${resultado}</td>
      </tr>
    `;
  }).join('');
}

function calcularEdad(anioNacimiento) {
  if (!anioNacimiento) return '-';
  const anioActual = new Date().getFullYear();
  return anioActual - anioNacimiento;
}

// Foto del jugador si tiene una cargada; si no, el escudo del club (en vez
// de dejar el casillero vacío).
function fotoOEscudoJugadorHtml(j) {
  if (j.foto_url) return `<img src="${j.foto_url}" alt="" class="foto-jugador-mini">`;
  if (j.club_logo_url) return `<img src="${j.club_logo_url}" alt="" class="foto-jugador-mini escudo-jugador-mini">`;
  return '';
}

// El backend devuelve fecha_nacimiento como fecha/hora ISO completa (ej.
// "1990-05-14T00:00:00.000Z"), así que hay que parsearla directo: si se le
// vuelve a agregar un "T00:00:00" queda una fecha inválida ("Invalid Date").
function formatearFechaNacimiento(fecha) {
  if (!fecha) return '-';
  const fechaObj = new Date(fecha);
  if (Number.isNaN(fechaObj.getTime())) return '-';
  return fechaObj.toLocaleDateString('es-AR', { timeZone: 'UTC' });
}

async function cargarPlantel() {
  const tbody = document.getElementById('tablaPlantel');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  if (!clubIdActual) {
    tbody.innerHTML = '<tr><td colspan="6">No se pudo identificar el club.</td></tr>';
    return;
  }
  try {
    const res = await fetch(`/web/clubes/${clubIdActual}/jugadores`);
    const data = await res.json();
    if (!data.ok || !data.jugadores.length) {
      tbody.innerHTML = '<tr><td colspan="6">Este club todavía no tiene jugadores cargados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.jugadores.map((j) => `
      <tr>
        <td>${fotoOEscudoJugadorHtml(j)}</td>
        <td>${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}</td>
        <td>${escapeHtml(j.posicion || '-')}</td>
        <td>${j.numero_camiseta != null ? j.numero_camiseta : '-'}</td>
        <td>${calcularEdad(j.anio_nacimiento)}</td>
        <td>${formatearFechaNacimiento(j.fecha_nacimiento)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cargarGoleadoresEquipo() {
  const tbody = document.getElementById('tablaGoleadoresEquipo');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/goleadores`);
    const data = await res.json();
    if (!data.ok || !data.goleadores.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay goles cargados en este torneo.</td></tr>';
      return;
    }
    tbody.innerHTML = data.goleadores.map((g) => `
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

async function cargarTarjetasEquipo() {
  const tbody = document.getElementById('tablaTarjetasEquipo');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/tarjetas`);
    const data = await res.json();
    if (!data.ok || !data.tarjetas.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay tarjetas cargadas en este torneo.</td></tr>';
      return;
    }
    tbody.innerHTML = data.tarjetas.map((t) => `
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

function swatch(color) {
  if (!color) return '';
  return `<span class="club-swatch" style="background:${color};"></span>`;
}

// Escudo del club si tiene logo cargado; si no, el punto de color como
// respaldo (mismo criterio que antes para clubes sin logo todavía).
function escudoClub(logoUrl, color) {
  if (logoUrl) return `<img src="${logoUrl}" alt="" class="club-escudo-mini">`;
  return swatch(color);
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
