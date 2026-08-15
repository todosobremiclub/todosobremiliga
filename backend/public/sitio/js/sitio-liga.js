// Página pública de una Liga: su info + listado de Torneos.

function getSlugDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('slug');
}

async function init() {
  const slug = getSlugDeUrl();
  const contenedorTorneos = document.getElementById('listaTorneos');

  if (!slug) {
    document.getElementById('nombreLiga').textContent = 'Liga no especificada';
    contenedorTorneos.innerHTML = '<p class="sitio-vacio">Falta indicar la Liga en la URL.</p>';
    return;
  }

  try {
    const resLiga = await fetch(`/web/ligas/${encodeURIComponent(slug)}`);
    const dataLiga = await resLiga.json();
    if (!dataLiga.ok) {
      document.getElementById('nombreLiga').textContent = 'Liga no encontrada';
      contenedorTorneos.innerHTML = '<p class="sitio-vacio">Esta Liga no existe o no está activa.</p>';
      return;
    }
    document.getElementById('nombreLiga').textContent = dataLiga.liga.nombre;
    if (dataLiga.liga.logo_url) {
      const logo = document.getElementById('logoLiga');
      logo.src = dataLiga.liga.logo_url;
      logo.classList.remove('oculto');
    }
  } catch (err) {
    document.getElementById('nombreLiga').textContent = 'Error cargando la Liga';
  }

  try {
    const resTorneos = await fetch(`/web/ligas/${encodeURIComponent(slug)}/torneos`);
    const dataTorneos = await resTorneos.json();
    if (!dataTorneos.ok || !dataTorneos.torneos.length) {
      contenedorTorneos.innerHTML = '<p class="sitio-vacio">Esta Liga todavía no tiene torneos publicados.</p>';
      return;
    }
    contenedorTorneos.innerHTML = dataTorneos.torneos.map((t) => `
      <a class="card-link" href="/sitio/torneo.html?id=${t.id}&nombre=${encodeURIComponent(t.nombre)}">
        <h3>${escapeHtml(t.nombre)}</h3>
        <p>${escapeHtml(t.deporte)} · ${escapeHtml(t.temporada || '')} · ${escapeHtml(t.estado || 'planificado')}</p>
      </a>
    `).join('');
  } catch (err) {
    contenedorTorneos.innerHTML = `<p class="sitio-vacio">Error cargando torneos: ${escapeHtml(err.message)}</p>`;
  }

  const contenedorNoticias = document.getElementById('listaNoticias');
  try {
    const resNoticias = await fetch(`/web/ligas/${encodeURIComponent(slug)}/noticias`);
    const dataNoticias = await resNoticias.json();
    if (!dataNoticias.ok || !dataNoticias.noticias.length) {
      contenedorNoticias.innerHTML = '<p class="sitio-vacio">Esta Liga todavía no publicó noticias.</p>';
      return;
    }
    contenedorNoticias.innerHTML = dataNoticias.noticias.map((n) => `
      <div class="noticia-card ${n.destacada ? 'destacada' : ''}">
        <h3>${escapeHtml(n.titulo)}</h3>
        <div class="noticia-fecha">${new Date(n.publicado_at).toLocaleDateString('es-AR')}</div>
        ${n.imagen_url ? `<img src="${escapeHtml(n.imagen_url)}" alt="">` : ''}
        <p class="noticia-contenido">${escapeHtml(n.contenido)}</p>
      </div>
    `).join('');
  } catch (err) {
    contenedorNoticias.innerHTML = `<p class="sitio-vacio">Error cargando noticias: ${escapeHtml(err.message)}</p>`;
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
