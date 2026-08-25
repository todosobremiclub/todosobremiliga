// Página pública de un Torneo: divisiones arriba como botones y, debajo, la
// tabla de posiciones / fixture / goleadores / tarjetas de la división (o
// categoría) elegida. Si una división tiene categorías, hay que
// elegir una para ver su información (no se auto-selecciona ninguna). Si el
// torneo tiene más de una unidad (división sin categorías, o
// categoría) marcada con "suma a tabla general", se agrega al final de
// los botones de división un botón extra "Tabla general".

function getParamsDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    torneoId: params.get('id'),
    nombre: params.get('nombre'),
    categoriaId: params.get('categoriaId'),
    subcategoriaId: params.get('subcategoriaId'),
    tab: params.get('tab')
  };
}

// URL "linda" (/<slug-liga>/<slug-torneo>, sin query string): a diferencia
// de la URL vieja (?id=...), acá no viaja el id real del Torneo -- hay que
// resolverlo contra el backend por los dos slugs.
function getSlugsDeUrlLinda() {
  const segmentos = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (segmentos.length !== 2) return null;
  return { ligaSlug: segmentos[0], torneoSlug: segmentos[1] };
}

let torneoIdActual = null;
let categoriasCache = [];
let categoriaSeleccionadaId = null;
let subcategoriaSeleccionadaId = null;
let mostrandoTablaGeneral = false;
let hayTablaGeneral = false;
let tablaCache = [];
// División/categoría pedidas por URL (ej. al volver desde la página de
// un Equipo) — si vienen, se seleccionan en vez de la primera división por
// defecto.
let categoriaIdDesdeUrl = null;
let subcategoriaIdDesdeUrl = null;
// Pestaña pedida por URL (ej. "fixture", "goleadores", "tarjetas" al entrar
// desde "Mis Torneos" del Panel Club) — si viene, se abre esa en vez de la
// pestaña "Tabla" por defecto. Sólo se usa una vez, al cargar la página.
let tabInicialDesdeUrl = null;
// Fixture agrupado por fecha (jornada), igual que el Panel de Liga.
let partidosFixtureCache = [];
let canchaJuegoFixtureActual = 'clubes';
let jornadasDescripcionFixtureCache = {};
let jornadaFixtureActual = 1;

async function init() {
  const { torneoId, nombre, categoriaId, subcategoriaId, tab } = getParamsDeUrl();
  categoriaIdDesdeUrl = categoriaId;
  subcategoriaIdDesdeUrl = subcategoriaId;
  tabInicialDesdeUrl = tab;

  if (torneoId) {
    // URL vieja (/sitio/torneo.html?id=...): el id ya viaja en la URL.
    torneoIdActual = torneoId;
    if (nombre) document.getElementById('nombreTorneo').textContent = nombre;
    cargarLigaDelTorneo();
  } else {
    // URL "linda" (/<liga>/<torneo>): hay que resolver el id contra el
    // backend antes de poder pedir tabla/fixture/etc.
    const slugs = getSlugsDeUrlLinda();
    if (slugs) await resolverTorneoPorSlugs(slugs.ligaSlug, slugs.torneoSlug);
  }

  if (!torneoIdActual) {
    document.getElementById('nombreTorneo').textContent = 'Torneo no especificado';
    document.getElementById('tabsCategorias').innerHTML = '<p class="sitio-vacio">Falta indicar el Torneo en la URL.</p>';
    return;
  }

  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTab('tabla'));
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTab('fixture'));
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTab('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTab('tarjetas'));
  document.getElementById('btnJornadaAnteriorPublico').addEventListener('click', () => cambiarJornadaFixturePublico(-1));
  document.getElementById('btnJornadaSiguientePublico').addEventListener('click', () => cambiarJornadaFixturePublico(1));

  await cargarCategorias();
  cargarNoticiasTorneo();
}

// Trae la Liga dueña de este Torneo (llegando por la URL vieja, ?id=...)
// para pintar el header/fondo con sus colores (igual que hace el Panel de
// Liga) y para que el breadcrumb vuelva a la Liga real -- con su URL
// "linda" -- en vez de siempre al listado general.
async function cargarLigaDelTorneo() {
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}`);
    const data = await res.json();
    if (!data.ok) return;
    // El nombre del Torneo se pisa acá siempre (venga o no por query string
    // en la URL vieja) para que el título nunca se quede en "Cargando..."
    // -- ej. cuando se llega desde un link que no incluye &nombre=... .
    document.getElementById('nombreTorneo').textContent = data.torneo.nombre;
    aplicarBreadcrumbYTemaDeTorneo(data.torneo);
  } catch (err) {
    // si falla, seguimos con el tema/breadcrumb por defecto
  }
}

// Resuelve el id real del Torneo a partir de los dos slugs de la URL
// "linda" (/<liga>/<torneo>) y deja todo listo para seguir como si hubiera
// llegado el id por query string.
async function resolverTorneoPorSlugs(ligaSlug, torneoSlug) {
  try {
    const res = await fetch(`/web/ligas/${encodeURIComponent(ligaSlug)}/torneos/${encodeURIComponent(torneoSlug)}`);
    const data = await res.json();
    if (!data.ok) return;
    torneoIdActual = data.torneo.id;
    document.getElementById('nombreTorneo').textContent = data.torneo.nombre;
    aplicarBreadcrumbYTemaDeTorneo(data.torneo);
  } catch (err) {
    // si falla, torneoIdActual queda null y init() muestra el mensaje de error
  }
}

function aplicarBreadcrumbYTemaDeTorneo(torneo) {
  aplicarTemaLiga(torneo.color_primario, torneo.color_secundario);
  if (torneo.liga_slug) {
    const link = document.getElementById('linkVolverLiga');
    link.href = `/${encodeURIComponent(torneo.liga_slug)}`;
    link.textContent = `← ${torneo.liga_nombre}`;
  }
  renderFooterLiga({
    logoUrl: torneo.liga_logo_url,
    nombre: torneo.liga_nombre,
    facebookUrl: torneo.facebook_url,
    instagramUrl: torneo.instagram_url,
    youtubeUrl: torneo.youtube_url
  });
}

// Noticias que la Liga segmentó específicamente para este torneo (todas las
// divisiones, salvo que la Liga haya elegido una división puntual).
async function cargarNoticiasTorneo() {
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/noticias`);
    const data = await res.json();
    if (!data.ok || !data.noticias.length) return;

    document.getElementById('bloqueNoticiasTorneo').classList.remove('oculto');
    document.getElementById('listaNoticiasTorneo').innerHTML = data.noticias.map((n) => `
      <div class="noticia-card ${n.destacada ? 'destacada' : ''}">
        <h3>${escapeHtml(n.titulo)}</h3>
        <div class="noticia-fecha">${new Date(n.publicado_at).toLocaleDateString('es-AR')}</div>
        ${n.imagen_url ? `<img src="${escapeHtml(n.imagen_url)}" alt="">` : ''}
        <p class="noticia-contenido">${escapeHtml(n.contenido)}</p>
      </div>
    `).join('');
  } catch (err) {
    // si falla, no se muestra el bloque de noticias; no bloquea el resto de la página
  }
}

// Una unidad (división sin categorías, o cada categoría) suma a la
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
      cont.innerHTML = '<p class="sitio-vacio">Este Torneo todavía no tiene divisiones publicadas.</p>';
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
    // Arranca mostrando la división pedida por URL (ej. al volver desde la
    // página de un Equipo) o, si no vino ninguna, la primera división del
    // torneo. Si esa división tiene categorías hay que elegir una — salvo
    // que también haya venido una categoría puntual por URL.
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
    cont.innerHTML = `<p class="sitio-vacio">Error cargando divisiones: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTabsCategorias() {
  const cont = document.getElementById('tabsCategorias');
  const botonesCategorias = categoriasCache.map((c) => `
    <button class="tab-btn tab-btn-categoria ${c.foto_url ? 'con-foto-fondo' : ''} ${!mostrandoTablaGeneral && categoriaSeleccionadaId === c.id ? 'activo' : ''}" ${c.foto_url ? `style="--foto-fondo: url('${escapeHtml(c.foto_url)}')"` : ''} onclick="seleccionarCategoria('${c.id}')">
      <span class="contenido-tab-categoria">${c.foto_url ? `<img src="${c.foto_url}" alt="" class="foto-mini-tab-categoria">` : ''}${escapeHtml(c.nombre)}</span>
    </button>
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
    mostrarMensajeSinSeleccion('Elegí una categoría para ver su información.');
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
  const tabsValidas = ['tabla', 'fixture', 'goleadores', 'tarjetas'];
  const tabInicial = tabsValidas.includes(tabInicialDesdeUrl) ? tabInicialDesdeUrl : 'tabla';
  tabInicialDesdeUrl = null; // sólo se usa la primera vez
  cambiarTab(tabInicial);
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

// Query string con la categoría elegida (si corresponde), para pasarle a
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
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/tarjetas${qsSubcategoria()}`);
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
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/fixture${qsSubcategoria()}`);
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
// (ej. "Vie 21/08"), cuando la fecha juega en más de un día.
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

// Datos de cancha del partido (dirección del club local, o predio+cancha
// propia de la Liga con si es techada o al aire libre), según cómo juega
// este torneo -- mismo criterio que ya usa el Panel de Liga. Se separa la
// dirección del resto (predio/cancha + techada) porque cada una va en un
// lugar distinto de la fila del fixture y del popup de detalle.
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
        <div style="margin-top:6px; font-size:12px; color:var(--gris-600); display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
          <span>${p.hora ? escapeHtml(String(p.hora).slice(0, 5)) : (p.fecha ? '' : 'Sin horario')}</span>
          ${(cancha.resumen.length || cancha.direccion) ? `
            <div style="text-align:right;">
              ${cancha.resumen.length ? `<div>${cancha.resumen.join(' · ')}</div>` : ''}
              ${cancha.direccion ? `<div style="margin-top:2px;">${escapeHtml(cancha.direccion)}</div>` : ''}
            </div>
          ` : ''}
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
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaSeleccionadaId}/partidos/${partidoId}`);
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
