// Página pública de una División: Tabla de posiciones + Fixture.

function getParamsDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    torneoId: params.get('torneoId'),
    categoriaId: params.get('categoriaId'),
    nombre: params.get('nombre')
  };
}

let torneoIdActual = null;
let categoriaIdActual = null;
let nombreCategoriaActual = '';
let torneoFormatoActual = null;
let tablaCache = [];
// Fixture agrupado por fecha (jornada), igual que el Panel de Liga.
let partidosFixtureCache = [];
let canchaJuegoFixtureActual = 'clubes';
let jornadasDescripcionFixtureCache = {};
let jornadaFixtureActual = 1;

async function init() {
  const { torneoId, categoriaId, nombre } = getParamsDeUrl();
  torneoIdActual = torneoId;
  categoriaIdActual = categoriaId;

  if (nombre) {
    nombreCategoriaActual = nombre;
    document.getElementById('nombreCategoria').textContent = nombre;
  }

  if (!torneoId || !categoriaId) {
    document.getElementById('nombreCategoria').textContent = 'División no especificada';
    document.getElementById('tablaPosiciones').innerHTML = '<tr><td colspan="9">Faltan datos en la URL.</td></tr>';
    return;
  }

  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTab('tabla'));
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTab('fixture'));
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTab('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTab('tarjetas'));
  document.getElementById('btnJornadaAnteriorPublico').addEventListener('click', () => cambiarJornadaFixturePublico(-1));
  document.getElementById('btnJornadaSiguientePublico').addEventListener('click', () => cambiarJornadaFixturePublico(1));

  // Hace falta saber el formato del torneo ANTES de decidir si la primera
  // pestaña muestra la tabla de posiciones o el cuadro de la llave -- por
  // eso se espera este fetch antes de cargar el contenido de la pestaña.
  await cargarLigaDelTorneo();
  actualizarEtiquetaTablaLlave();
  if (esFormatoLlave()) cargarLlaveBracketPublico(); else cargarTabla();
}

// "Eliminación directa" y "Eliminación directa con reenganche": el torneo
// ES la llave, no tiene tabla de posiciones (ver mismo criterio en el
// Panel de Liga, liga.js).
function esFormatoLlave() {
  return ['eliminacion_directa', 'eliminacion_reenganche'].includes(torneoFormatoActual);
}

function actualizarEtiquetaTablaLlave() {
  document.getElementById('tabBtnTabla').textContent = esFormatoLlave() ? 'Llave' : 'Tabla de posiciones';
}

// Trae la Liga dueña de este Torneo para pintar el header/fondo con sus
// colores (igual que hace el Panel de Liga) y para que el breadcrumb
// vuelva a la Liga real en vez de siempre al listado general. También trae
// el formato del torneo, que decide si esta división muestra tabla de
// posiciones o el cuadro de la llave.
async function cargarLigaDelTorneo() {
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}`);
    const data = await res.json();
    if (!data.ok) return;
    torneoFormatoActual = data.torneo.formato_juego;
    aplicarTemaLiga(data.torneo.color_primario, data.torneo.color_secundario);
    if (data.torneo.liga_slug) {
      const link = document.getElementById('linkVolverLiga');
      link.href = `/sitio/liga.html?slug=${encodeURIComponent(data.torneo.liga_slug)}`;
      link.textContent = `← ${data.torneo.liga_nombre}`;
    }
    renderFooterLiga({
      logoUrl: data.torneo.liga_logo_url,
      nombre: data.torneo.liga_nombre,
      facebookUrl: data.torneo.facebook_url,
      instagramUrl: data.torneo.instagram_url,
      youtubeUrl: data.torneo.youtube_url
    });
  } catch (err) {
    // si falla, seguimos con el tema/breadcrumb por defecto
  }
}

function cambiarTab(nombre) {
  const secciones = { tabla: 'seccionTabla', fixture: 'seccionFixture', goleadores: 'seccionGoleadores', tarjetas: 'seccionTarjetas' };
  const botones = { tabla: 'tabBtnTabla', fixture: 'tabBtnFixture', goleadores: 'tabBtnGoleadores', tarjetas: 'tabBtnTarjetas' };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'tabla') {
    const esLlave = esFormatoLlave();
    document.getElementById('wrapTablaPosicionesPublico').classList.toggle('oculto', esLlave);
    document.getElementById('wrapLlaveBracketPublico').classList.toggle('oculto', !esLlave);
    if (esLlave) cargarLlaveBracketPublico(); else cargarTabla();
  }
  if (nombre === 'fixture') cargarFixture();
  if (nombre === 'goleadores') cargarGoleadoresPublico();
  if (nombre === 'tarjetas') cargarTarjetasPublico();
}

const NOMBRES_FASE_LLAVE_PUBLICO = {
  final: 'la Final', semifinal: 'Semifinales', cuartos: 'Cuartos de final',
  octavos: 'Octavos de final', dieciseisavos: 'Dieciseisavos de final', treintaidosavos: 'Treintaidosavos de final'
};

// Mismo criterio que determinarGanador() del backend, sólo para decidir a
// quién resaltar en negrita -- si está empatado sin penales cargados,
// devuelve null (no se resalta a nadie todavía).
function determinarGanadorClientePublico(p) {
  if (p.resultado_local == null || p.resultado_visitante == null) return null;
  if (p.resultado_local > p.resultado_visitante) return p.equipo_local_torneo_id;
  if (p.resultado_visitante > p.resultado_local) return p.equipo_visitante_torneo_id;
  const detalle = p.detalle_resultado || {};
  const penLocal = detalle.penales_local;
  const penVisitante = detalle.penales_visitante;
  if (penLocal != null && penVisitante != null && penLocal !== penVisitante) {
    return penLocal > penVisitante ? p.equipo_local_torneo_id : p.equipo_visitante_torneo_id;
  }
  return null;
}

// Devuelve el marcador chiquito que va al lado del nombre de un equipo
// cuando llegó a ESTE partido sin jugar la ronda anterior (pase libre o
// reenganche) -- así se ve el cruce "libre" directamente en el lugar del
// cuadro donde ocurre, sin depender de una nota aparte.
function marcaOrigenLlavePublico(motivo) {
  return motivo === 'reenganche'
    ? ' <span title="Reenganchado a esta ronda" style="font-size:10px; font-weight:400; color:#60a5fa;">(reenganchado)</span>'
    : ' <span title="Pasó libre a esta ronda" style="font-size:10px; font-weight:400; color:#94a3b8;">(libre)</span>';
}

// Último dibujo de conectores hecho (para poder volver a trazarlos si la
// ventana cambia de tamaño y las tarjetas se corren de lugar).
let ultimoDibujoLlavePublico = null;

async function cargarLlaveBracketPublico() {
  const contenedor = document.getElementById('contenedorLlaveBracketPublico');
  contenedor.innerHTML = '<p class="sitio-vacio">Cargando...</p>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/llave`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Error al cargar la llave');
    renderLlaveBracketPublico(data.partidos || [], data.avances || []);
  } catch (err) {
    contenedor.innerHTML = `<p class="sitio-vacio">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderLlaveBracketPublico(partidos, avances) {
  const contenedor = document.getElementById('contenedorLlaveBracketPublico');
  if (!partidos.length) {
    contenedor.innerHTML = '<p class="sitio-vacio">Todavía no se generó la llave de esta división.</p>';
    return;
  }

  const porJornada = new Map();
  partidos.forEach((p) => {
    const j = p.jornada || 1;
    if (!porJornada.has(j)) porJornada.set(j, []);
    porJornada.get(j).push(p);
  });
  const jornadas = [...porJornada.keys()].sort((a, b) => a - b);
  jornadas.forEach((j) => porJornada.get(j).sort((a, b) => (a.orden_llave ?? 0) - (b.orden_llave ?? 0)));

  // De dónde viene cada equipo al llegar a la jornada J: o bien de un
  // partido real (ganó en la ronda anterior), o bien de un pase libre /
  // reenganche (llave_avances, sin partido). Con esto se puede dibujar el
  // cruce real entre rondas sin asumir ningún orden fijo -- funciona igual
  // para "Eliminación directa" (cruces fijos) que para "con reenganche"
  // (cruces al azar en cada ronda).
  const origenPorEquipoYJornada = new Map();
  avances.forEach((a) => {
    origenPorEquipoYJornada.set(`${a.equipo_torneo_id}|${a.jornada}`, { tipo: 'avance', motivo: a.motivo });
  });
  jornadas.forEach((j) => {
    porJornada.get(j).forEach((p) => {
      const jugado = p.estado === 'jugado';
      const ganadorId = jugado ? determinarGanadorClientePublico(p) : null;
      if (ganadorId) origenPorEquipoYJornada.set(`${ganadorId}|${j + 1}`, { tipo: 'partido', partidoId: p.id });
    });
  });

  // Pases libres/reenganches cuya ronda de destino TODAVÍA no se generó
  // (no hay partido donde mostrar el marcador inline): esos sí se listan
  // aparte, debajo de la ronda anterior, como antes.
  const avancesPendientesPorRonda = new Map();
  avances.forEach((a) => {
    if (porJornada.has(a.jornada)) return;
    const rondaAnterior = a.jornada - 1;
    if (!avancesPendientesPorRonda.has(rondaAnterior)) avancesPendientesPorRonda.set(rondaAnterior, []);
    avancesPendientesPorRonda.get(rondaAnterior).push(a);
  });

  const columnas = jornadas.map((j) => {
    const partidosRonda = porJornada.get(j);
    const faseNombrada = partidosRonda[0].fase && partidosRonda[0].fase !== 'reenganche'
      ? (NOMBRES_FASE_LLAVE_PUBLICO[partidosRonda[0].fase] || partidosRonda[0].fase)
      : `Fecha ${j}`;

    const tarjetas = partidosRonda.map((p) => {
      const jugado = p.estado === 'jugado';
      const ganadorId = jugado ? determinarGanadorClientePublico(p) : null;
      const origenLocal = origenPorEquipoYJornada.get(`${p.equipo_local_torneo_id}|${j}`);
      const origenVisitante = origenPorEquipoYJornada.get(`${p.equipo_visitante_torneo_id}|${j}`);
      const marcaLocal = origenLocal && origenLocal.tipo === 'avance' ? marcaOrigenLlavePublico(origenLocal.motivo) : '';
      const marcaVisitante = origenVisitante && origenVisitante.tipo === 'avance' ? marcaOrigenLlavePublico(origenVisitante.motivo) : '';
      return `
        <div class="panel" data-match-id="${p.id}" style="padding:5px 8px; min-width:168px; font-size:11.5px; border-radius:6px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <span style="display:flex; align-items:center; gap:5px; overflow:hidden; font-weight:${ganadorId === p.equipo_local_torneo_id ? '700' : '400'};">${escudoClub(p.club_local_logo_url, p.club_local_color)}<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.club_local_nombre)}</span>${marcaLocal}</span>
            <span style="white-space:nowrap; font-weight:700;">${jugado ? p.resultado_local : '-'}</span>
          </div>
          <div style="height:1px; background:rgba(148,163,184,0.25); margin:4px 0;"></div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
            <span style="display:flex; align-items:center; gap:5px; overflow:hidden; font-weight:${ganadorId === p.equipo_visitante_torneo_id ? '700' : '400'};">${escudoClub(p.club_visitante_logo_url, p.club_visitante_color)}<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.club_visitante_nombre)}</span>${marcaVisitante}</span>
            <span style="white-space:nowrap; font-weight:700;">${jugado ? p.resultado_visitante : '-'}</span>
          </div>
        </div>`;
    }).join('');

    const avancesPendientes = avancesPendientesPorRonda.get(j) || [];
    const notasAvances = avancesPendientes.map((a) => {
      const etiqueta = a.motivo === 'reenganche' ? 'Reenganchado' : 'Pasa libre';
      return `<p class="sitio-vacio" style="margin:3px 0; font-size:11px;">↳ ${escapeHtml(a.club_nombre)} — ${etiqueta} a la próxima ronda</p>`;
    }).join('');

    return `
      <div class="col-llave" style="min-width:178px; flex:0 0 auto;">
        <h4 style="margin:0 0 8px; font-size:11.5px; text-transform:uppercase; letter-spacing:0.4px; text-align:center; background:rgba(148,163,184,0.15); border-radius:4px; padding:4px 0;">${escapeHtml(faseNombrada)}</h4>
        <div style="display:flex; flex-direction:column; flex-wrap:wrap; align-content:flex-start; gap:8px; max-height:640px;">${tarjetas}</div>
        ${notasAvances}
      </div>`;
  }).join('');

  // Campeón: la última ronda, con un solo partido, ya jugado -- se muestra
  // como un bloque propio al final, destacado con la copa, en vez de un
  // simple texto.
  let columnaCampeon = '';
  const ultimaJornada = jornadas[jornadas.length - 1];
  const partidosUltima = porJornada.get(ultimaJornada);
  if (partidosUltima.length === 1 && partidosUltima[0].estado === 'jugado') {
    const ganadorId = determinarGanadorClientePublico(partidosUltima[0]);
    if (ganadorId) {
      const esLocal = ganadorId === partidosUltima[0].equipo_local_torneo_id;
      const nombreCampeon = esLocal ? partidosUltima[0].club_local_nombre : partidosUltima[0].club_visitante_nombre;
      const logoCampeon = esLocal ? partidosUltima[0].club_local_logo_url : partidosUltima[0].club_visitante_logo_url;
      const colorCampeon = esLocal ? partidosUltima[0].club_local_color : partidosUltima[0].club_visitante_color;
      columnaCampeon = `
        <div class="col-llave" style="min-width:150px; flex:0 0 auto; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:14px 10px; border-radius:8px; background:linear-gradient(180deg, rgba(250,204,21,0.16), rgba(250,204,21,0.04)); border:1px solid rgba(250,204,21,0.35);">
          <div style="font-size:36px; line-height:1;">🏆</div>
          <div style="margin-top:8px;">${escudoClub(logoCampeon, colorCampeon)}</div>
          <p style="margin:6px 0 0; font-weight:700; text-align:center; font-size:13px;">${escapeHtml(nombreCampeon)}</p>
          <p class="sitio-vacio" style="margin:2px 0 0; font-size:11px; text-transform:uppercase; letter-spacing:0.4px;">Campeón</p>
        </div>`;
    }
  }

  contenedor.innerHTML = `
    <div id="llaveBracketScrollPublico" style="position:relative;">
      <svg id="llaveBracketSvgPublico" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; overflow:visible;"></svg>
      <div style="display:flex; gap:14px; align-items:flex-start; position:relative;">${columnas}${columnaCampeon}</div>
    </div>`;

  ultimoDibujoLlavePublico = { origenPorEquipoYJornada, jornadas, porJornada };
  dibujarConectoresLlavePublico();
}

// Dibuja, sobre el SVG superpuesto al cuadro, una línea desde cada partido
// "padre" (de donde salió un equipo ganador) hasta el partido donde ese
// equipo juega la ronda siguiente. No asume ningún orden fijo entre rondas
// -- funciona igual para cruces fijos (Eliminación directa) que para
// cruces al azar (con reenganche), porque se arma a partir de quién ganó
// cada partido realmente, no de una posición esperada.
function dibujarConectoresLlavePublico() {
  if (!ultimoDibujoLlavePublico) return;
  const { origenPorEquipoYJornada, jornadas, porJornada } = ultimoDibujoLlavePublico;
  const svg = document.getElementById('llaveBracketSvgPublico');
  const cont = document.getElementById('llaveBracketScrollPublico');
  if (!svg || !cont) return;
  const contRect = cont.getBoundingClientRect();

  const cruces = [];
  jornadas.forEach((j) => {
    porJornada.get(j).forEach((p) => {
      [p.equipo_local_torneo_id, p.equipo_visitante_torneo_id].forEach((equipoId) => {
        const origen = origenPorEquipoYJornada.get(`${equipoId}|${j}`);
        if (origen && origen.tipo === 'partido') cruces.push({ desdePartidoId: origen.partidoId, haciaPartidoId: p.id });
      });
    });
  });

  const paths = cruces.map(({ desdePartidoId, haciaPartidoId }) => {
    const elDesde = cont.querySelector(`[data-match-id="${desdePartidoId}"]`);
    const elHacia = cont.querySelector(`[data-match-id="${haciaPartidoId}"]`);
    if (!elDesde || !elHacia) return '';
    const r1 = elDesde.getBoundingClientRect();
    const r2 = elHacia.getBoundingClientRect();
    const x1 = r1.right - contRect.left;
    const y1 = r1.top + r1.height / 2 - contRect.top;
    const x2 = r2.left - contRect.left;
    const y2 = r2.top + r2.height / 2 - contRect.top;
    const xMedio = (x1 + x2) / 2;
    // Línea en "codo" (horizontal-vertical-horizontal), el clásico trazo de
    // llave de torneo, en vez de una curva.
    return `<path d="M ${x1} ${y1} H ${xMedio} V ${y2} H ${x2}" fill="none" stroke="#94a3b8" stroke-width="1.6" opacity="0.6" />`;
  }).join('');

  svg.innerHTML = paths;
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => dibujarConectoresLlavePublico());
}

async function cargarGoleadoresPublico() {
  const tbody = document.getElementById('tablaGoleadoresPublico');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/goleadores`);
    const data = await res.json();
    if (!data.ok || !data.goleadores.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay goles cargados en esta división.</td></tr>';
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
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/tarjetas`);
    const data = await res.json();
    if (!data.ok || !data.tarjetas.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay tarjetas cargadas en esta división.</td></tr>';
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
    categoriaId: categoriaIdActual,
    equipoTorneoId,
    nombre: clubNombre || ''
  });
  window.location.href = `/sitio/equipo.html?${params.toString()}`;
}

async function cargarTabla() {
  const tbody = document.getElementById('tablaPosiciones');
  tbody.innerHTML = '<tr><td colspan="10">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/tabla`);
    const data = await res.json();
    if (!data.ok || !data.tabla.length) {
      tbody.innerHTML = '<tr><td colspan="10">Todavía no hay datos de tabla para esta división.</td></tr>';
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

function jornadasDisponiblesFixturePublico() {
  return Array.from(new Set(partidosFixtureCache.map((p) => (p.jornada != null ? p.jornada : 0)))).sort((a, b) => a - b);
}

async function cargarFixture() {
  const navegador = document.getElementById('navegadorJornadasPublico');
  const contenedor = document.getElementById('contenedorPartidosJornadaPublico');
  navegador.classList.add('oculto');
  contenedor.innerHTML = '<p class="sitio-vacio">Cargando...</p>';
  try {
    if (!tablaCache.length) await cargarTabla();
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/fixture`);
    const data = await res.json();
    if (!data.ok || !data.partidos.length) {
      contenedor.innerHTML = '<p class="sitio-vacio">Todavía no hay partidos programados.</p>';
      return;
    }
    partidosFixtureCache = data.partidos;
    canchaJuegoFixtureActual = data.cancha_juego;
    jornadasDescripcionFixtureCache = {};
    (data.jornadas || []).forEach((j) => { jornadasDescripcionFixtureCache[j.jornada] = j.descripcion; });

    const jornadasDisponibles = jornadasDisponiblesFixturePublico();
    jornadaFixtureActual = 1;
    if (!jornadasDisponibles.includes(jornadaFixtureActual)) jornadaFixtureActual = jornadasDisponibles[0];
    navegador.classList.remove('oculto');
    renderJornadaFixturePublico(jornadasDisponibles);
  } catch (err) {
    contenedor.innerHTML = `<p class="sitio-vacio">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function cambiarJornadaFixturePublico(delta) {
  const jornadasDisponibles = jornadasDisponiblesFixturePublico();
  const idx = jornadasDisponibles.indexOf(jornadaFixtureActual);
  const nuevoIdx = idx + delta;
  if (nuevoIdx < 0 || nuevoIdx >= jornadasDisponibles.length) return;
  jornadaFixtureActual = jornadasDisponibles[nuevoIdx];
  renderJornadaFixturePublico(jornadasDisponibles);
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

// Igual que formatearFechaPartido pero anteponiendo el día de la semana
// (ej. "Sábado 29/8/2026"), usado en el popup de detalle de un partido.
function formatearFechaConDiaPartido(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  const dia = d.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long' });
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${diaCapitalizado} ${d.toLocaleDateString('es-AR', { timeZone: 'UTC' })}`;
}

// Versión corta para el separador entre días dentro de una misma jornada
// (ej. "Vie 21/08"), cuando esa fecha juega en más de un día.
function formatearIndicadorDia(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long' });
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  const mes = d.toLocaleDateString('es-AR', { timeZone: 'UTC', month: 'long' });
  const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);
  return `${diaCapitalizado} ${d.getUTCDate()} de ${mesCapitalizado}`;
}

// Se separa la dirección del resto (predio/cancha + techada) porque cada
// una va en un lugar distinto de la fila del fixture y del popup de detalle.
function detallesCanchaPartido(p) {
  const resumen = [];
  let direccion = '';
  if (canchaJuegoFixtureActual === 'propias_liga') {
    if (p.predio_nombre) resumen.push(`${escapeHtml(p.predio_nombre)}${p.cancha_predio_nombre ? ' - ' + escapeHtml(p.cancha_predio_nombre) : ''}`);
    direccion = [p.predio_direccion, p.predio_ciudad, p.predio_provincia].filter(Boolean).join(', ');
    if (p.cancha_predio_techo) resumen.push(p.cancha_predio_techo === 'techada' ? 'Techada' : 'Aire libre');
  } else {
    direccion = p.club_local_direccion || '';
    if (p.club_local_cancha_techo) resumen.push(p.club_local_cancha_techo === 'techada' ? 'Techada' : 'Aire libre');
  }
  return { resumen, direccion };
}

function renderJornadaFixturePublico(jornadasDisponibles) {
  const contenedor = document.getElementById('contenedorPartidosJornadaPublico');
  // El backend ya ordena por fecha y hora (ORDER BY p.fecha, p.hora), así
  // que dentro de la jornada los partidos ya vienen del más próximo al
  // último -- acá sólo hay que agrupar visualmente por día cuando la misma
  // jornada se juega en más de una fecha (ej. viernes/sábado/domingo).
  const partidosJornada = partidosFixtureCache.filter((p) => (p.jornada != null ? p.jornada : 0) === jornadaFixtureActual);
  const descripcion = jornadasDescripcionFixtureCache[jornadaFixtureActual];
  document.getElementById('tituloJornadaActualPublico').textContent = `Fecha ${jornadaFixtureActual}${descripcion ? ' — ' + escapeHtml(descripcion) : ''}`;
  document.getElementById('btnJornadaAnteriorPublico').disabled = jornadasDisponibles.indexOf(jornadaFixtureActual) === 0;
  document.getElementById('btnJornadaSiguientePublico').disabled = jornadasDisponibles.indexOf(jornadaFixtureActual) === jornadasDisponibles.length - 1;

  let diaAnterior;
  const filas = [];
  partidosJornada.forEach((p) => {
    const indicadorDia = p.fecha ? formatearIndicadorDia(p.fecha) : 'Sin fecha';
    if (indicadorDia !== diaAnterior) {
      filas.push(`<div class="separador-dia-fixture">${escapeHtml(indicadorDia)}</div>`);
      diaAnterior = indicadorDia;
    }

    const cancha = detallesCanchaPartido(p);
    filas.push(`
      <div class="panel fila-partido-clickable" style="margin-bottom:10px;" onclick="abrirDetallePartido('${p.id}')">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:170px;">
            ${escudoClub(p.club_local_logo_url, p.club_local_color)}<strong>${escapeHtml(p.club_local_nombre)}${posicionEntreParentesisHtml(p.equipo_local_torneo_id)}</strong>
          </div>
          <div style="font-weight:700; white-space:nowrap;">
            ${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'vs'}${(p.no_presento_local || p.no_presento_visitante) ? ' <span class="badge badge-pendiente" title="Resultado por incomparecencia">W.O.</span>' : ''}
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:170px; justify-content:flex-end; text-align:right;">
            <strong>${escapeHtml(p.club_visitante_nombre)}${posicionEntreParentesisHtml(p.equipo_visitante_torneo_id)}</strong>${escudoClub(p.club_visitante_logo_url, p.club_visitante_color)}
          </div>
        </div>
        <div style="margin-top:6px; font-size:12px; color:var(--gris-600); display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:170px; text-align:left;">
            ${cancha.resumen.length ? `<div>${cancha.resumen.join(' · ')}</div>` : ''}
            ${cancha.direccion ? `<div style="margin-top:2px;">${escapeHtml(cancha.direccion)}</div>` : ''}
          </div>
          <div style="white-space:nowrap; text-align:center;">${p.hora ? escapeHtml(String(p.hora).slice(0, 5)) : (p.fecha ? '' : 'Sin horario')}</div>
          <div style="flex:1; min-width:170px;"></div>
        </div>
      </div>
    `);
  });
  contenedor.innerHTML = filas.join('');
}

// ----- Popup de detalle de un partido -----

async function abrirDetallePartido(partidoId) {
  document.getElementById('fondoModalPartido').classList.remove('oculto');
  document.getElementById('panelDetallePartido').classList.remove('oculto');
  const contenido = document.getElementById('detallePartidoContenido');
  contenido.innerHTML = '<p class="sitio-vacio">Cargando...</p>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/partidos/${partidoId}`);
    const data = await res.json();
    if (!data.ok) {
      contenido.innerHTML = '<p class="sitio-vacio">No se pudo cargar el partido.</p>';
      return;
    }
    contenido.innerHTML = renderDetallePartidoHtml(data.partido, data.estadisticas);
  } catch (err) {
    contenido.innerHTML = `<p class="sitio-vacio">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function cerrarDetallePartido() {
  document.getElementById('fondoModalPartido').classList.add('oculto');
  document.getElementById('panelDetallePartido').classList.add('oculto');
}

function renderDetallePartidoHtml(p, estadisticas) {
  const cancha = detallesCanchaPartido(p);
  const goleadores = estadisticas.filter((e) => e.goles > 0);
  const tarjetas = estadisticas.filter((e) => e.tarjetas_amarillas > 0 || e.tarjetas_rojas > 0);

  return `
    <div style="text-align:center; margin-bottom:12px;">
      <div style="display:flex; align-items:center; justify-content:center; gap:20px; flex-wrap:wrap;">
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px; min-width:110px;">
          ${p.club_local_logo_url ? `<img src="${escapeHtml(p.club_local_logo_url)}" alt="" style="width:56px; height:56px; object-fit:contain; border-radius:8px;">` : swatch(p.club_local_color)}
          <strong>${escapeHtml(p.club_local_nombre)}</strong>
        </div>
        <div style="font-size:34px; font-weight:800; font-family: var(--fuente-deportiva);">
          ${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'vs'}
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; gap:8px; min-width:110px;">
          ${p.club_visitante_logo_url ? `<img src="${escapeHtml(p.club_visitante_logo_url)}" alt="" style="width:56px; height:56px; object-fit:contain; border-radius:8px;">` : swatch(p.club_visitante_color)}
          <strong>${escapeHtml(p.club_visitante_nombre)}</strong>
        </div>
      </div>
      ${(p.no_presento_local || p.no_presento_visitante) ? '<p style="margin:10px 0 0;"><span class="badge badge-pendiente">Resultado por incomparecencia (W.O.)</span></p>' : ''}
    </div>
    <p style="text-align:center; color:var(--gris-600); margin:6px 0;">
      ${p.jornada != null ? `Fecha ${p.jornada} · ` : ''}${p.fecha ? escapeHtml(formatearFechaPartido(p.fecha)) : 'Sin fecha'}${p.hora ? ' · ' + escapeHtml(String(p.hora).slice(0, 5)) : ''}
    </p>
    ${cancha.resumen.length || cancha.direccion ? `
      <div style="text-align:center; color:var(--gris-600); font-size:13px; margin:0 0 14px;">
        ${cancha.resumen.length ? `<p style="margin:0;">${cancha.resumen.join(' · ')}</p>` : ''}
        ${cancha.direccion ? `<p style="margin:2px 0 0;">${escapeHtml(cancha.direccion)}</p>` : ''}
      </div>
    ` : '<div style="margin-bottom:14px;"></div>'}

    ${goleadores.length ? `
      <h3 style="margin-bottom:6px;">Goleadores</h3>
      <table><thead><tr><th>Jugador</th><th>Club</th><th>Goles</th></tr></thead>
      <tbody>${goleadores.map((g) => `<tr><td>${escapeHtml(g.apellido)}, ${escapeHtml(g.nombre)}</td><td>${escapeHtml(g.club_nombre)}</td><td>${g.goles}</td></tr>`).join('')}</tbody></table>
    ` : ''}

    ${tarjetas.length ? `
      <h3 style="margin:14px 0 6px;">Tarjetas</h3>
      <table><thead><tr><th>Jugador</th><th>Club</th><th>Amarillas</th><th>Rojas</th></tr></thead>
      <tbody>${tarjetas.map((t) => `<tr><td>${escapeHtml(t.apellido)}, ${escapeHtml(t.nombre)}</td><td>${escapeHtml(t.club_nombre)}</td><td>${t.tarjetas_amarillas}</td><td>${t.tarjetas_rojas}</td></tr>`).join('')}</tbody></table>
    ` : ''}

    ${!goleadores.length && !tarjetas.length ? '<p class="sitio-vacio" style="text-align:center;">Todavía no hay goleadores ni tarjetas cargados para este partido.</p>' : ''}
  `;
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
