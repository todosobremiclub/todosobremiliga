// Página pública de un Torneo: categorías arriba como botones y, debajo, la
// tabla de posiciones / fixture / goleadores / tarjetas de la categoría (o
// subcategoría) elegida. Si una categoría tiene subcategorías, hay que
// elegir una para ver su información (no se auto-selecciona ninguna). Si el
// torneo tiene más de una unidad (categoría sin subcategorías, o
// subcategoría) marcada con "suma a tabla general", se agrega al final de
// los botones de categoría un botón extra "Tabla general".

function getParamsDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    torneoId: params.get('id'),
    nombre: params.get('nombre'),
    categoriaId: params.get('categoriaId'),
    subcategoriaId: params.get('subcategoriaId')
  };
}

let torneoIdActual = null;
let categoriasCache = [];
let categoriaSeleccionadaId = null;
let subcategoriaSeleccionadaId = null;
let mostrandoTablaGeneral = false;
let hayTablaGeneral = false;
let tablaCache = [];
// Categoría/subcategoría pedidas por URL (ej. al volver desde la página de
// un Equipo) — si vienen, se seleccionan en vez de la primera categoría por
// defecto.
let categoriaIdDesdeUrl = null;
let subcategoriaIdDesdeUrl = null;

async function init() {
  const { torneoId, nombre, categoriaId, subcategoriaId } = getParamsDeUrl();
  torneoIdActual = torneoId;
  categoriaIdDesdeUrl = categoriaId;
  subcategoriaIdDesdeUrl = subcategoriaId;

  if (nombre) document.getElementById('nombreTorneo').textContent = nombre;

  if (!torneoId) {
    document.getElementById('nombreTorneo').textContent = 'Torneo no especificado';
    document.getElementById('tabsCategorias').innerHTML = '<p class="sitio-vacio">Falta indicar el Torneo en la URL.</p>';
    return;
  }

  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTab('tabla'));
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTab('fixture'));
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTab('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTab('tarjetas'));

  await cargarCategorias();
}

// Una unidad (categoría sin subcategorías, o cada subcategoría) suma a la
// tabla general salvo que se haya destildado explícitamente esa opción.
function sumaTablaGeneral(unidad) {
  return unidad.suma_tabla_general !== false;
}

async function cargarCategorias() {
  const cont = document.getElementById('tabsCategorias');
  cont.innerHTML = '<p class="sitio-vacio">Cargando...</p>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias`);
    const data = await res.json();
    if (!data.ok || !data.categorias.length) {
      cont.innerHTML = '<p class="sitio-vacio">Este Torneo todavía no tiene categorías publicadas.</p>';
      return;
    }
    categoriasCache = data.categorias;

    const unidadesSumables = categoriasCache.reduce((acc, c) => {
      if (c.subcategorias && c.subcategorias.length) {
        return acc + c.subcategorias.filter(sumaTablaGeneral).length;
      }
      return acc + (sumaTablaGeneral(c) ? 1 : 0);
    }, 0);
    hayTablaGeneral = unidadesSumables >= 2;

    renderTabsCategorias();
    // Arranca mostrando la categoría pedida por URL (ej. al volver desde la
    // página de un Equipo) o, si no vino ninguna, la primera categoría del
    // torneo. Si esa categoría tiene subcategorías hay que elegir una — salvo
    // que también haya venido una subcategoría puntual por URL.
    const categoriaInicialId = (categoriaIdDesdeUrl && categoriasCache.some((c) => c.id === categoriaIdDesdeUrl))
      ? categoriaIdDesdeUrl
      : categoriasCache[0].id;
    seleccionarCategoria(categoriaInicialId);
    if (subcategoriaIdDesdeUrl) {
      const categoria = categoriasCache.find((c) => c.id === categoriaInicialId);
      if (categoria && categoria.subcategorias && categoria.subcategorias.some((s) => s.id === subcategoriaIdDesdeUrl)) {
        seleccionarSubcategoria(subcategoriaIdDesdeUrl);
      }
    }
  } catch (err) {
    cont.innerHTML = `<p class="sitio-vacio">Error cargando categorías: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTabsCategorias() {
  const cont = document.getElementById('tabsCategorias');
  const botonesCategorias = categoriasCache.map((c) => `
    <button class="tab-btn tab-btn-categoria ${!mostrandoTablaGeneral && categoriaSeleccionadaId === c.id ? 'activo' : ''}" onclick="seleccionarCategoria('${c.id}')">${c.foto_url ? `<img src="${c.foto_url}" alt="" class="foto-mini-tab-categoria">` : ''}${escapeHtml(c.nombre)}</button>
  `).join('');
  const botonGeneral = hayTablaGeneral
    ? `<button class="tab-btn tab-btn-categoria tab-btn-general ${mostrandoTablaGeneral ? 'activo' : ''}" onclick="seleccionarTablaGeneral()">Tabla general</button>`
    : '';
  cont.innerHTML = botonesCategorias + botonGeneral;
}

function renderTabsSubcategorias() {
  const cont = document.getElementById('tabsSubcategorias');
  const categoria = categoriasCache.find((c) => c.id === categoriaSeleccionadaId);
  if (mostrandoTablaGeneral || !categoria || !categoria.subcategorias || !categoria.subcategorias.length) {
    cont.classList.add('oculto');
    cont.innerHTML = '';
    return;
  }
  cont.classList.remove('oculto');
  cont.innerHTML = categoria.subcategorias.map((s) => `
    <button class="tab-btn ${subcategoriaSeleccionadaId === s.id ? 'activo' : ''}" onclick="seleccionarSubcategoria('${s.id}')">${escapeHtml(s.nombre)}</button>
  `).join('');
}

function seleccionarCategoria(categoriaId) {
  mostrandoTablaGeneral = false;
  categoriaSeleccionadaId = categoriaId;
  subcategoriaSeleccionadaId = null;
  tablaCache = [];
  renderTabsCategorias();
  renderTabsSubcategorias();

  const categoria = categoriasCache.find((c) => c.id === categoriaId);
  if (categoria && categoria.subcategorias && categoria.subcategorias.length) {
    mostrarMensajeSinSeleccion('Elegí una subcategoría para ver su información.');
  } else {
    mostrarBloqueContenidoCategoria();
  }
}

function seleccionarSubcategoria(subcategoriaId) {
  subcategoriaSeleccionadaId = subcategoriaId;
  tablaCache = [];
  renderTabsSubcategorias();
  mostrarBloqueContenidoCategoria();
}

function seleccionarTablaGeneral() {
  mostrandoTablaGeneral = true;
  renderTabsCategorias();
  document.getElementById('tabsSubcategorias').classList.add('oculto');
  document.getElementById('mensajeSinSeleccion').classList.add('oculto');
  document.getElementById('bloqueContenidoCategoria').classList.add('oculto');
  document.getElementById('bloqueTablaGeneral').classList.remove('oculto');
  cargarTablaGeneral();
}

function mostrarMensajeSinSeleccion(texto) {
  document.getElementById('bloqueContenidoCategoria').classList.add('oculto');
  document.getElementById('bloqueTablaGeneral').classList.add('oculto');
  const mensaje = document.getElementById('mensajeSinSeleccion');
  mensaje.textContent = texto;
  mensaje.classList.remove('oculto');
}

function mostrarBloqueContenidoCategoria() {
  document.getElementById('mensajeSinSeleccion').classList.add('oculto');
  document.getElementById('bloqueTablaGeneral').classList.add('oculto');
  document.getElementById('bloqueContenidoCategoria').classList.remove('oculto');
  cambiarTab('tabla');
}

function cambiarTab(nombre) {
  const secciones = { tabla: 'seccionTabla', fixture: 'seccionFixture', goleadores: 'seccionGoleadores', tarjetas: 'seccionTarjetas' };
  const botones = { tabla: 'tabBtnTabla', fixture: 'tabBtnFixture', goleadores: 'tabBtnGoleadores', tarjetas: 'tabBtnTarjetas' };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'tabla') cargarTabla();
  if (nombre === 'fixture') cargarFixture();
  if (nombre === 'goleadores') cargarGoleadoresPublico();
  if (nombre === 'tarjetas') cargarTarjetasPublico();
}

// Query string con la subcategoría elegida (si corresponde), para pasarle a
// los endpoints públicos de tabla/fixture/goleadores/tarjetas.
function qsSubcategoria() {
  return subcategoriaSeleccionadaId ? `?subcategoria_id=${subcategoriaSeleccionadaId}` : '';
}

async function cargarGoleadoresPublico() {
  const tbody = document.getElementById('tablaGoleadoresPublico');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/goleadores${qsSubcategoria()}`);
    const data = await res.json();
    if (!data.ok || !data.goleadores.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay goles cargados en esta categoría.</td></tr>';
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

async function cargarTarjetasPublico() {
  const tbody = document.getElementById('tablaTarjetasPublico');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/tarjetas${qsSubcategoria()}`);
    const data = await res.json();
    if (!data.ok || !data.tarjetas.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay tarjetas cargadas en esta categoría.</td></tr>';
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

function renderUltimos5Html(ultimos5) {
  if (!ultimos5 || !ultimos5.length) return '-';
  const clases = { V: 'badge-ultimo-v', E: 'badge-ultimo-e', P: 'badge-ultimo-p' };
  return `<div class="ultimos5">${ultimos5.map((r) => `<span class="badge-ultimo ${clases[r] || ''}">${r}</span>`).join('')}</div>`;
}

function posicionActualEquipo(equipoTorneoId) {
  if (!equipoTorneoId || !tablaCache.length) return null;
  const idx = tablaCache.findIndex((f) => f.equipo_torneo_id === equipoTorneoId);
  return idx === -1 ? null : idx + 1;
}

function posicionEntreParentesisHtml(equipoTorneoId) {
  const pos = posicionActualEquipo(equipoTorneoId);
  return pos ? ` (${pos}°)` : '';
}

function irAEquipo(equipoTorneoId, clubNombre) {
  if (!equipoTorneoId) return;
  const params = new URLSearchParams({
    torneoId: torneoIdActual,
    categoriaId: categoriaSeleccionadaId,
    equipoTorneoId,
    nombre: clubNombre || ''
  });
  window.location.href = `/sitio/equipo.html?${params.toString()}`;
}

async function cargarTabla() {
  const tbody = document.getElementById('tablaPosiciones');
  tbody.innerHTML = '<tr><td colspan="10">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/tabla${qsSubcategoria()}`);
    const data = await res.json();
    if (!data.ok || !data.tabla.length) {
      tablaCache = [];
      tbody.innerHTML = '<tr><td colspan="10">Todavía no hay datos de tabla para esta categoría.</td></tr>';
      return;
    }
    tablaCache = data.tabla;
    tbody.innerHTML = data.tabla.map((fila) => `
      <tr class="fila-equipo-clickable" onclick="irAEquipo('${fila.equipo_torneo_id}', '${escapeHtml(fila.club_nombre).replace(/'/g, "\\'")}')">
        <td>${escudoClub(fila.club_logo_url, fila.club_color_primario)}${escapeHtml(fila.club_nombre)}</td>
        <td>${fila.partidos_jugados}</td>
        <td>${fila.ganados}</td>
        <td>${fila.empatados}</td>
        <td>${fila.perdidos}</td>
        <td>${fila.a_favor}</td>
        <td>${fila.en_contra}</td>
        <td>${fila.diferencia}</td>
        <td>${fila.puntos}</td>
        <td>${renderUltimos5Html(fila.ultimos5)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cargarFixture() {
  const tbody = document.getElementById('tablaFixture');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    if (!tablaCache.length) await cargarTabla();
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/fixture${qsSubcategoria()}`);
    const data = await res.json();
    if (!data.ok || !data.partidos.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no hay partidos programados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.partidos.map((p) => `
      <tr>
        <td>${p.jornada != null ? p.jornada : '-'}</td>
        <td>${escudoClub(p.club_local_logo_url, p.club_local_color)}${escapeHtml(p.club_local_nombre)}${posicionEntreParentesisHtml(p.equipo_local_torneo_id)}</td>
        <td>${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'vs'}${(p.no_presento_local || p.no_presento_visitante) ? ' <span class="badge badge-pendiente" title="Resultado por incomparecencia">W.O.</span>' : ''}</td>
        <td>${escudoClub(p.club_visitante_logo_url, p.club_visitante_color)}${escapeHtml(p.club_visitante_nombre)}${posicionEntreParentesisHtml(p.equipo_visitante_torneo_id)}</td>
        <td>${p.fecha ? escapeHtml(p.fecha) : '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cargarTablaGeneral() {
  const tbody = document.getElementById('tablaGeneralTorneo');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/tabla-general`);
    const data = await res.json();
    if (!data.ok || !data.tabla.length) {
      tbody.innerHTML = '<tr><td colspan="9">Todavía no hay datos para la tabla general.</td></tr>';
      return;
    }
    tbody.innerHTML = data.tabla.map((f) => `
      <tr>
        <td>${escudoClub(f.club_logo_url, f.club_color_primario)}${escapeHtml(f.club_nombre)}</td>
        <td>${f.partidos_jugados}</td>
        <td>${f.ganados}</td>
        <td>${f.empatados}</td>
        <td>${f.perdidos}</td>
        <td>${f.a_favor}</td>
        <td>${f.en_contra}</td>
        <td>${f.diferencia}</td>
        <td><strong>${f.puntos}</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(err.message)}</td></tr>`;
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
