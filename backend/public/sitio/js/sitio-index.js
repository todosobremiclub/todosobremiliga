// Home del sitio público: listado de Ligas activas + noticias globales.

let ligasCache = [];

async function init() {
  await cargarLigas();
  cargarNoticiasGlobales();
  configurarBuscadorLigas();
}

async function cargarLigas() {
  const contenedor = document.getElementById('listaLigas');
  try {
    const res = await fetch('/web/ligas');
    const data = await res.json();
    if (!data.ok || !data.ligas.length) {
      ligasCache = [];
      contenedor.innerHTML = '<p class="sitio-vacio">Todavía no hay Ligas publicadas.</p>';
      return;
    }
    ligasCache = data.ligas;
    renderLigas(ligasCache);
  } catch (err) {
    contenedor.innerHTML = `<p class="sitio-vacio">Error cargando Ligas: ${escapeHtml(err.message)}</p>`;
  }
}

function renderLigas(ligas) {
  const contenedor = document.getElementById('listaLigas');
  if (!ligas.length) {
    contenedor.innerHTML = '<p class="sitio-vacio">No se encontró ninguna Liga con ese nombre.</p>';
    return;
  }
  contenedor.innerHTML = ligas.map((liga) => `
    <a class="card-link ${liga.logo_url ? 'con-foto-fondo' : ''}" ${liga.logo_url ? `style="--foto-fondo: url('${escapeHtml(liga.logo_url)}')"` : ''} href="/sitio/liga.html?slug=${encodeURIComponent(liga.slug)}">
      <h3>${escapeHtml(liga.nombre)}</h3>
      <p>${escapeHtml(liga.direccion || 'Ver tabla, fixture y noticias')}</p>
    </a>
  `).join('');
}

// Filtro en vivo por nombre — no navega a ningún lado, sólo achica la
// grilla de Ligas mientras se tipea (mismo estilo de input que el buscador
// de clubes dentro de una Liga, pero acá filtra en el momento).
function configurarBuscadorLigas() {
  const input = document.getElementById('buscadorLigas');
  input.addEventListener('input', () => {
    const texto = input.value.trim().toLowerCase();
    if (!texto) {
      renderLigas(ligasCache);
      return;
    }
    renderLigas(ligasCache.filter((l) => l.nombre.toLowerCase().includes(texto)));
  });
}

async function cargarNoticiasGlobales() {
  const contenedor = document.getElementById('listaNoticiasGlobales');
  try {
    const res = await fetch('/web/noticias-globales');
    const data = await res.json();
    if (!data.ok || !data.noticias.length) {
      contenedor.innerHTML = '<p class="sitio-vacio">Todavía no hay noticias publicadas.</p>';
      return;
    }
    contenedor.innerHTML = data.noticias.map((n) => `
      <div class="noticia-card ${n.destacada ? 'destacada' : ''}">
        <h3>${escapeHtml(n.titulo)}</h3>
        <div class="noticia-fecha">${new Date(n.publicado_at).toLocaleDateString('es-AR')}</div>
        ${n.imagen_url ? `<img src="${escapeHtml(n.imagen_url)}" alt="">` : ''}
        <p class="noticia-contenido">${escapeHtml(n.contenido)}</p>
      </div>
    `).join('');
  } catch (err) {
    contenedor.innerHTML = `<p class="sitio-vacio">Error cargando noticias: ${escapeHtml(err.message)}</p>`;
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
