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
let tablaCache = [];
// Fixture agrupado por fecha (jornada), igual que el Panel de Liga.
let partidosFixtureCache = [];
let canchaJuegoFixtureActual = 'clubes';
let jornadasDescripcionFixtureCache = {};
let jornadaFixtureActual = 1;

function init() {
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

  cargarLigaDelTorneo();
  cargarTabla();
}

// Trae la Liga dueña de este Torneo para pintar el header/fondo con sus
// colores (igual que hace el Panel de Liga) y para que el breadcrumb
// vuelva a la Liga real en vez de siempre al listado general.
async function cargarLigaDelTorneo() {
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}`);
    const data = await res.json();
    if (!data.ok) return;
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
  if (nombre === 'fixture') cargarFixture();
  if (nombre === 'goleadores') cargarGoleadoresPublico();
  if (nombre === 'tarjetas') cargarTarjetasPublico();
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
// (ej. "Sábado 29/8/2026"), para la fila del fixture.
function formatearFechaConDiaPartido(fecha) {
  if (!fecha) return null;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return String(fecha);
  const dia = d.toLocaleDateString('es-AR', { timeZone: 'UTC', weekday: 'long' });
  const diaCapitalizado = dia.charAt(0).toUpperCase() + dia.slice(1);
  return `${diaCapitalizado} ${d.toLocaleDateString('es-AR', { timeZone: 'UTC' })}`;
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
  const partidosJornada = partidosFixtureCache.filter((p) => (p.jornada != null ? p.jornada : 0) === jornadaFixtureActual);
  const descripcion = jornadasDescripcionFixtureCache[jornadaFixtureActual];
  document.getElementById('tituloJornadaActualPublico').textContent = `Fecha ${jornadaFixtureActual}${descripcion ? ' — ' + escapeHtml(descripcion) : ''}`;
  document.getElementById('btnJornadaAnteriorPublico').disabled = jornadasDisponibles.indexOf(jornadaFixtureActual) === 0;
  document.getElementById('btnJornadaSiguientePublico').disabled = jornadasDisponibles.indexOf(jornadaFixtureActual) === jornadasDisponibles.length - 1;

  contenedor.innerHTML = partidosJornada.map((p) => {
    const cancha = detallesCanchaPartido(p);
    return `
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
        <div style="margin-top:6px; font-size:12px; color:var(--gris-600);">
          <div style="display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <span>${p.fecha ? `${escapeHtml(formatearFechaConDiaPartido(p.fecha))}${p.hora ? ' · ' + escapeHtml(String(p.hora).slice(0, 5)) : ''}` : 'Sin fecha'}</span>
            ${cancha.direccion ? `<span>${escapeHtml(cancha.direccion)}</span>` : ''}
          </div>
          ${cancha.resumen.length ? `<div style="margin-top:2px;">${cancha.resumen.join(' · ')}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
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
