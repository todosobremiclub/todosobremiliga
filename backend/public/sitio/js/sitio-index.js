// Home del sitio público: listado de Ligas activas.

async function init() {
  const contenedor = document.getElementById('listaLigas');
  try {
    const res = await fetch('/web/ligas');
    const data = await res.json();
    if (!data.ok || !data.ligas.length) {
      contenedor.innerHTML = '<p class="sitio-vacio">Todavía no hay Ligas publicadas.</p>';
      return;
    }
    contenedor.innerHTML = data.ligas.map((liga) => `
      <a class="card-link" href="/sitio/liga.html?slug=${encodeURIComponent(liga.slug)}">
        <h3>${escapeHtml(liga.nombre)}</h3>
        <p>${escapeHtml(liga.direccion || 'Ver tabla, fixture y noticias')}</p>
      </a>
    `).join('');
  } catch (err) {
    contenedor.innerHTML = `<p class="sitio-vacio">Error cargando Ligas: ${escapeHtml(err.message)}</p>`;
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
