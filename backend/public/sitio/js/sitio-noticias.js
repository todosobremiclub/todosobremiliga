// Carrusel de Noticias del sitio público: se usa igual en liga.html,
// torneo.html, club.html e index.html — 2 tarjetas por vez (mismo tamaño
// siempre), con flechas + puntos si hay más de 2, "Ver más" cuando el texto
// no entra o hay video, y un popup con la noticia completa (texto entero +
// imagen + video de YouTube embebido).
//
// Cada página sólo tiene que llamar a renderCarruselNoticias('idDelContenedor', noticias)
// después de traer las noticias de su endpoint correspondiente, y agregar en
// su HTML el popup compartido (ver public/sitio/liga.html como referencia:
// #fondoModalNoticiaCompleta + #modalNoticiaCompleta).

const NOTICIAS_POR_PAGINA_CARRUSEL = 2;
const NOTICIAS_UMBRAL_VER_MAS = 220; // caracteres de contenido a partir de los cuales se corta con "Ver más"

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

// Convierte cualquier formato de link de YouTube (watch?v=, youtu.be/,
// /embed/, /shorts/) a su URL de embed. Devuelve null si no lo reconoce.
function youtubeEmbedUrl(url) {
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
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch (err) {
    return null;
  }
}

function renderCarruselNoticias(containerId, noticias) {
  const contenedor = document.getElementById(containerId);
  if (!contenedor) return;
  if (!noticias || !noticias.length) {
    contenedor.innerHTML = '<p class="sitio-vacio">Todavía no hay noticias publicadas.</p>';
    return;
  }

  _estadoCarruselesNoticias[containerId] = { noticias, pagina: 0 };

  contenedor.innerHTML = `
    <div class="carrusel-noticias-fila" id="${containerId}_fila"></div>
    <div class="carrusel-noticias-nav oculto" id="${containerId}_nav">
      <button type="button" class="btn btn-secundario btn-pequeno" id="${containerId}_btnAnterior">← Anterior</button>
      <span class="carrusel-noticias-puntos" id="${containerId}_puntos"></span>
      <button type="button" class="btn btn-secundario btn-pequeno" id="${containerId}_btnSiguiente">Siguiente →</button>
    </div>
  `;
  document.getElementById(`${containerId}_btnAnterior`).addEventListener('click', () => cambiarPaginaCarruselNoticias(containerId, -1));
  document.getElementById(`${containerId}_btnSiguiente`).addEventListener('click', () => cambiarPaginaCarruselNoticias(containerId, 1));

  renderPaginaCarruselNoticias(containerId);
}

function cambiarPaginaCarruselNoticias(containerId, delta) {
  const estado = _estadoCarruselesNoticias[containerId];
  if (!estado) return;
  const totalPaginas = Math.ceil(estado.noticias.length / NOTICIAS_POR_PAGINA_CARRUSEL);
  estado.pagina = Math.max(0, Math.min(totalPaginas - 1, estado.pagina + delta));
  renderPaginaCarruselNoticias(containerId);
}

function renderPaginaCarruselNoticias(containerId) {
  const estado = _estadoCarruselesNoticias[containerId];
  if (!estado) return;
  const { noticias, pagina } = estado;
  const fila = document.getElementById(`${containerId}_fila`);
  const nav = document.getElementById(`${containerId}_nav`);
  const puntos = document.getElementById(`${containerId}_puntos`);
  const totalPaginas = Math.ceil(noticias.length / NOTICIAS_POR_PAGINA_CARRUSEL);
  const inicio = pagina * NOTICIAS_POR_PAGINA_CARRUSEL;
  const visibles = noticias.slice(inicio, inicio + NOTICIAS_POR_PAGINA_CARRUSEL);

  fila.innerHTML = visibles.map((n, i) => tarjetaNoticiaCarruselHtml(containerId, n, inicio + i)).join('');

  if (totalPaginas > 1) {
    nav.classList.remove('oculto');
    document.getElementById(`${containerId}_btnAnterior`).disabled = pagina <= 0;
    document.getElementById(`${containerId}_btnSiguiente`).disabled = pagina >= totalPaginas - 1;
    puntos.innerHTML = Array.from({ length: totalPaginas }).map((_, i) =>
      `<span class="punto-carrusel ${i === pagina ? 'activo' : ''}"></span>`
    ).join('');
  } else {
    nav.classList.add('oculto');
  }
}

function tarjetaNoticiaCarruselHtml(containerId, n, indice) {
  const tieneVideo = !!youtubeEmbedUrl(n.video_youtube_url);
  const textoLargo = (n.contenido || '').length > NOTICIAS_UMBRAL_VER_MAS;
  const mostrarVerMas = textoLargo || tieneVideo;
  return `
    <div class="noticia-card noticia-card-carrusel ${n.destacada ? 'destacada' : ''}">
      <h3>${escaparHtmlNoticias(n.titulo)}</h3>
      <div class="noticia-fecha">${new Date(n.publicado_at).toLocaleDateString('es-AR')}</div>
      ${n.imagen_url ? `<img src="${escaparHtmlNoticias(n.imagen_url)}" alt="">` : ''}
      ${tieneVideo ? '<span class="noticia-video-badge">🎬 Con video</span>' : ''}
      <p class="noticia-contenido noticia-contenido-clamp">${escaparHtmlNoticias(n.contenido)}</p>
      ${mostrarVerMas ? `<button type="button" class="link-ver-mas-noticia" onclick="verNoticiaCompleta('${containerId}', ${indice})">Ver más</button>` : ''}
    </div>
  `;
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
