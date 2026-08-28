// Carrusel de Noticias del sitio público: se usa igual en liga.html,
// torneo.html, club.html e index.html — 3 tarjetas visibles a la vez (mismo
// tamaño siempre, 2 en tablet y 1 en mobile), con flechas + puntos si hay
// más noticias que tarjetas visibles, "Ver más" cuando el texto no entra o
// hay video, y un popup con la noticia completa (texto entero + imagen +
// video de YouTube embebido).
//
// "Siguiente"/"Anterior" DESLIZAN de a una tarjeta por vez (no saltan a una
// página nueva) — todas las tarjetas viven en una sola fila flex más ancha
// que el visor, y se la corre con transform: translateX. Así "Siguiente"
// siempre deja 2 tarjetas conocidas + 1 nueva a la vista, en vez de saltar a
// una página que puede quedar casi vacía cuando el total no es múltiplo de
// la cantidad visible.
//
// Cada página sólo tiene que llamar a renderCarruselNoticias('idDelContenedor', noticias)
// después de traer las noticias de su endpoint correspondiente, y agregar en
// su HTML el popup compartido (ver public/sitio/liga.html como referencia:
// #fondoModalNoticiaCompleta + #modalNoticiaCompleta).

const NOTICIAS_UMBRAL_VER_MAS = 220; // caracteres de contenido a partir de los cuales se corta con "Ver más"
const NOTICIAS_CARRUSEL_GAP = 16; // debe coincidir con el "gap" de .carrusel-noticias-fila en css

// Estado por contenedor: permite que una página tenga más de un carrusel de
// noticias (hoy ninguna lo necesita, pero no cuesta nada dejarlo genérico).
const _estadoCarruselesNoticias = {};

function escaparHtmlNoticias(texto) {
  if (texto == null) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Extrae el ID del video de cualquier formato de link de YouTube (watch?v=,
// youtu.be/, /embed/, /shorts/). Devuelve null si no lo reconoce.
function youtubeVideoId(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    let id = null;
    if (host === 'youtu.be') {
      id = u.pathname.slice(1);
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v');
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2];
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/')[2];
    }
    return id || null;
  } catch (err) {
    return null;
  }
}

function youtubeEmbedUrl(url) {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
}

// Miniatura del video (la misma que usa YouTube en sus propias vistas
// previas) — se usa como imagen de la tarjeta cuando la noticia tiene video
// pero no subió una foto propia.
function youtubeThumbnailUrl(url) {
  const id = youtubeVideoId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

// Cuántas tarjetas se ven a la vez según el ancho del visor — mismos cortes
// que las media queries de .carrusel-noticias-fila en css (860px/560px).
function tarjetasVisiblesCarrusel(anchoViewport) {
  if (anchoViewport < 560) return 1;
  if (anchoViewport < 860) return 2;
  return 3;
}

function renderCarruselNoticias(containerId, noticias) {
  const contenedor = document.getElementById(containerId);
  if (!contenedor) return;
  if (!noticias || !noticias.length) {
    contenedor.innerHTML = '<p class="sitio-vacio">Todavía no hay noticias publicadas.</p>';
    return;
  }

  _estadoCarruselesNoticias[containerId] = { noticias, indice: 0, visibles: 3 };

  contenedor.innerHTML = `
    <div class="carrusel-noticias-viewport" id="${containerId}_viewport">
      <div class="carrusel-noticias-fila" id="${containerId}_fila">
        ${noticias.map((n, i) => tarjetaNoticiaCarruselHtml(containerId, n, i)).join('')}
      </div>
    </div>
    <div class="carrusel-noticias-nav oculto" id="${containerId}_nav">
      <button type="button" class="btn btn-secundario btn-pequeno" id="${containerId}_btnAnterior">← Anterior</button>
      <span class="carrusel-noticias-puntos" id="${containerId}_puntos"></span>
      <button type="button" class="btn btn-secundario btn-pequeno" id="${containerId}_btnSiguiente">Siguiente →</button>
    </div>
  `;
  document.getElementById(`${containerId}_btnAnterior`).addEventListener('click', () => moverCarruselNoticias(containerId, -1));
  document.getElementById(`${containerId}_btnSiguiente`).addEventListener('click', () => moverCarruselNoticias(containerId, 1));

  // El ancho de cada tarjeta depende del ancho real del visor (recalcula
  // también si la ventana cambia de tamaño, ej. al rotar el celular).
  let temporizadorResize = null;
  window.addEventListener('resize', () => {
    clearTimeout(temporizadorResize);
    temporizadorResize = setTimeout(() => actualizarAnchoCarruselNoticias(containerId), 150);
  });

  actualizarAnchoCarruselNoticias(containerId);
}

function moverCarruselNoticias(containerId, delta) {
  const estado = _estadoCarruselesNoticias[containerId];
  if (!estado) return;
  const indiceMaximo = Math.max(0, estado.noticias.length - estado.visibles);
  estado.indice = Math.max(0, Math.min(indiceMaximo, estado.indice + delta));
  aplicarPosicionCarruselNoticias(containerId);
}

// Recalcula cuántas tarjetas entran (según el ancho actual) y el ancho en
// píxeles de cada una, y se lo aplica a todas las tarjetas de la fila.
function actualizarAnchoCarruselNoticias(containerId) {
  const estado = _estadoCarruselesNoticias[containerId];
  const viewport = document.getElementById(`${containerId}_viewport`);
  const fila = document.getElementById(`${containerId}_fila`);
  if (!estado || !viewport || !fila) return;

  const anchoViewport = viewport.clientWidth;
  const visibles = tarjetasVisiblesCarrusel(anchoViewport);
  estado.visibles = visibles;
  estado.anchoCard = (anchoViewport - NOTICIAS_CARRUSEL_GAP * (visibles - 1)) / visibles;

  Array.from(fila.children).forEach((card) => {
    card.style.width = `${estado.anchoCard}px`;
  });

  // Si al achicarse la ventana el índice actual ya no entra (quedó fuera de
  // rango porque ahora hay menos tarjetas visibles), se recorta.
  const indiceMaximo = Math.max(0, estado.noticias.length - visibles);
  estado.indice = Math.min(estado.indice, indiceMaximo);

  aplicarPosicionCarruselNoticias(containerId);
}

function aplicarPosicionCarruselNoticias(containerId) {
  const estado = _estadoCarruselesNoticias[containerId];
  const fila = document.getElementById(`${containerId}_fila`);
  const nav = document.getElementById(`${containerId}_nav`);
  if (!estado || !fila || !nav) return;

  const { noticias, indice, visibles, anchoCard } = estado;
  const indiceMaximo = Math.max(0, noticias.length - visibles);
  const corrimiento = indice * ((anchoCard || 0) + NOTICIAS_CARRUSEL_GAP);
  fila.style.transform = `translateX(-${corrimiento}px)`;

  if (indiceMaximo > 0) {
    nav.classList.remove('oculto');
    document.getElementById(`${containerId}_btnAnterior`).disabled = indice <= 0;
    document.getElementById(`${containerId}_btnSiguiente`).disabled = indice >= indiceMaximo;
    const puntos = document.getElementById(`${containerId}_puntos`);
    puntos.innerHTML = Array.from({ length: indiceMaximo + 1 }).map((_, i) =>
      `<span class="punto-carrusel ${i === indice ? 'activo' : ''}"></span>`
    ).join('');
  } else {
    nav.classList.add('oculto');
  }
}

function tarjetaNoticiaCarruselHtml(containerId, n, indice) {
  const tieneVideo = !!youtubeEmbedUrl(n.video_youtube_url);
  const textoLargo = (n.contenido || '').length > NOTICIAS_UMBRAL_VER_MAS;
  const mostrarVerMas = textoLargo || tieneVideo;

  // Si tiene foto propia se usa esa (con un botón de play encima si además
  // tiene video); si no tiene foto pero sí video, se usa la miniatura del
  // video de YouTube como imagen de portada de la tarjeta.
  const srcImagen = n.imagen_url || (tieneVideo ? youtubeThumbnailUrl(n.video_youtube_url) : null);
  // Si tiene video, la miniatura se puede clickear ahí mismo para
  // reproducirlo adentro de la tarjeta (sin tener que abrir "Ver más").
  const idWrapVideo = `${containerId}_video_${indice}`;
  const imagenHtml = srcImagen ? `
    <div class="noticia-imagen-wrap" id="${idWrapVideo}" ${tieneVideo ? `onclick="reproducirVideoEnTarjeta('${containerId}', ${indice})" style="cursor:pointer;"` : ''}>
      <img src="${escaparHtmlNoticias(srcImagen)}" alt="">
      ${tieneVideo ? '<span class="noticia-play-badge">▶</span>' : ''}
    </div>
  ` : '';

  return `
    <div class="noticia-card noticia-card-carrusel ${n.destacada ? 'destacada' : ''}">
      <h3>${escaparHtmlNoticias(n.titulo)}</h3>
      <div class="noticia-fecha">${new Date(n.publicado_at).toLocaleDateString('es-AR')}</div>
      ${imagenHtml}
      <p class="noticia-contenido noticia-contenido-clamp">${escaparHtmlNoticias(n.contenido)}</p>
      ${mostrarVerMas ? `<button type="button" class="link-ver-mas-noticia" onclick="verNoticiaCompleta('${containerId}', ${indice})">Ver más</button>` : ''}
    </div>
  `;
}

// Reproduce el video de YouTube de una noticia directo en la tarjeta del
// carrusel (sin abrir el popup de "Ver más"): reemplaza la miniatura +
// botón de play por un iframe embebido con autoplay, respetando la
// proporción 16:9 (misma técnica que usa el popup completo).
function reproducirVideoEnTarjeta(containerId, indice) {
  const estado = _estadoCarruselesNoticias[containerId];
  const n = estado && estado.noticias[indice];
  if (!n) return;
  const embedUrl = youtubeEmbedUrl(n.video_youtube_url);
  if (!embedUrl) return;

  const wrap = document.getElementById(`${containerId}_video_${indice}`);
  if (!wrap) return;
  wrap.removeAttribute('onclick');
  wrap.style.cursor = '';
  wrap.className = 'noticia-video-embed';
  wrap.innerHTML = `<iframe src="${escaparHtmlNoticias(embedUrl)}?autoplay=1" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
}

// Abre el popup compartido (#modalNoticiaCompleta) con el texto entero,
// la imagen y el video (si tiene) de la noticia en cuestión.
function verNoticiaCompleta(containerId, indice) {
  const estado = _estadoCarruselesNoticias[containerId];
  if (!estado) return;
  const n = estado.noticias[indice];
  if (!n) return;

  document.getElementById('tituloNoticiaCompleta').textContent = n.titulo;
  document.getElementById('fechaNoticiaCompleta').textContent = new Date(n.publicado_at).toLocaleDateString('es-AR');

  const imagen = document.getElementById('imagenNoticiaCompleta');
  if (n.imagen_url) {
    imagen.src = n.imagen_url;
    imagen.classList.remove('oculto');
  } else {
    imagen.classList.add('oculto');
    imagen.removeAttribute('src');
  }

  const embedUrl = youtubeEmbedUrl(n.video_youtube_url);
  const contenedorVideo = document.getElementById('videoNoticiaCompleta');
  contenedorVideo.innerHTML = embedUrl
    ? `<iframe src="${escaparHtmlNoticias(embedUrl)}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`
    : '';

  document.getElementById('contenidoNoticiaCompleta').textContent = n.contenido;

  document.getElementById('fondoModalNoticiaCompleta').classList.remove('oculto');
  document.getElementById('modalNoticiaCompleta').classList.remove('oculto');
}

function cerrarNoticiaCompleta() {
  document.getElementById('fondoModalNoticiaCompleta').classList.add('oculto');
  document.getElementById('modalNoticiaCompleta').classList.add('oculto');
  // Sacamos el iframe al cerrar para que el video se pause (no solo se oculte).
  document.getElementById('videoNoticiaCompleta').innerHTML = '';
}
