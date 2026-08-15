// Página pública de un Torneo: listado de sus Categorías.

function getParamsDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return { torneoId: params.get('id'), nombre: params.get('nombre') };
}

async function init() {
  const { torneoId, nombre } = getParamsDeUrl();
  const contenedor = document.getElementById('listaCategorias');

  if (nombre) {
    document.getElementById('nombreTorneo').textContent = nombre;
  }

  if (!torneoId) {
    document.getElementById('nombreTorneo').textContent = 'Torneo no especificado';
    contenedor.innerHTML = '<p class="sitio-vacio">Falta indicar el Torneo en la URL.</p>';
    return;
  }

  try {
    const res = await fetch(`/web/torneos/${torneoId}/categorias`);
    const data = await res.json();
    if (!data.ok || !data.categorias.length) {
      contenedor.innerHTML = '<p class="sitio-vacio">Este Torneo todavía no tiene categorías publicadas.</p>';
      return;
    }
    contenedor.innerHTML = data.categorias.map((c) => `
      <a class="card-link" href="/sitio/categoria.html?torneoId=${torneoId}&categoriaId=${c.id}&nombre=${encodeURIComponent(c.nombre)}">
        <h3>${escapeHtml(c.nombre)}</h3>
        <p>${escapeHtml(c.genero || 'Sin género especificado')}</p>
      </a>
    `).join('');
  } catch (err) {
    contenedor.innerHTML = `<p class="sitio-vacio">Error cargando categorías: ${escapeHtml(err.message)}</p>`;
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
