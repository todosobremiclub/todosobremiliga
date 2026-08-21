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

  configurarBuscadorClubes(slug);

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
      <a class="card-link ${t.logo_url ? 'con-foto-fondo' : ''}" ${t.logo_url ? `style="--foto-fondo: url('${escapeHtml(t.logo_url)}')"` : ''} href="/sitio/torneo.html?id=${t.id}&nombre=${encodeURIComponent(t.nombre)}">
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

// Buscador de clubes: al tipear (con un pequeño debounce) consulta el
// buscador público de la Liga y muestra los resultados en un desplegable
// debajo del input; al elegir uno, navega al perfil público de ese club.
function configurarBuscadorClubes(slug) {
  const input = document.getElementById('buscadorClubesLiga');
  const resultados = document.getElementById('resultadosBuscadorClubes');
  let temporizador = null;

  input.addEventListener('input', () => {
    clearTimeout(temporizador);
    const texto = input.value.trim();
    if (!texto) {
      resultados.classList.add('oculto');
      resultados.innerHTML = '';
      return;
    }
    temporizador = setTimeout(() => buscarClubes(slug, texto, resultados), 250);
  });

  document.addEventListener('click', (e) => {
    if (!resultados.contains(e.target) && e.target !== input) {
      resultados.classList.add('oculto');
    }
  });
}

async function buscarClubes(slug, texto, resultados) {
  try {
    const res = await fetch(`/web/ligas/${encodeURIComponent(slug)}/clubes/buscar?q=${encodeURIComponent(texto)}`);
    const data = await res.json();
    if (!data.ok || !data.clubes.length) {
      resultados.innerHTML = '<p class="sitio-vacio" style="padding:10px 14px; margin:0;">No se encontraron clubes.</p>';
      resultados.classList.remove('oculto');
      return;
    }
    resultados.innerHTML = data.clubes.map((c) => `
      <a class="buscador-clubes-resultado" href="/sitio/club.html?ligaSlug=${encodeURIComponent(slug)}&clubId=${c.id}">
        ${c.logo_url ? `<img src="${escapeHtml(c.logo_url)}" alt="">` : `<span class="club-swatch" style="background:${c.color_primario || '#ccc'};"></span>`}
        ${escapeHtml(c.nombre)}
      </a>
    `).join('');
    resultados.classList.remove('oculto');
  } catch (err) {
    resultados.innerHTML = `<p class="sitio-vacio" style="padding:10px 14px; margin:0;">Error: ${escapeHtml(err.message)}</p>`;
    resultados.classList.remove('oculto');
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
