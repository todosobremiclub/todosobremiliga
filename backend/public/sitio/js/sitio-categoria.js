// Página pública de una Categoría: Tabla de posiciones + Fixture.

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

function init() {
  const { torneoId, categoriaId, nombre } = getParamsDeUrl();
  torneoIdActual = torneoId;
  categoriaIdActual = categoriaId;

  if (nombre) {
    document.getElementById('nombreCategoria').textContent = nombre;
  }

  if (!torneoId || !categoriaId) {
    document.getElementById('nombreCategoria').textContent = 'Categoría no especificada';
    document.getElementById('tablaPosiciones').innerHTML = '<tr><td colspan="9">Faltan datos en la URL.</td></tr>';
    return;
  }

  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTab('tabla'));
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTab('fixture'));

  cargarTabla();
}

function cambiarTab(nombre) {
  const secciones = { tabla: 'seccionTabla', fixture: 'seccionFixture' };
  const botones = { tabla: 'tabBtnTabla', fixture: 'tabBtnFixture' };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'fixture') cargarFixture();
}

async function cargarTabla() {
  const tbody = document.getElementById('tablaPosiciones');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/tabla`);
    const data = await res.json();
    if (!data.ok || !data.tabla.length) {
      tbody.innerHTML = '<tr><td colspan="9">Todavía no hay datos de tabla para esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = data.tabla.map((fila) => `
      <tr>
        <td>${escapeHtml(fila.club_nombre)}</td>
        <td>${fila.partidos_jugados}</td>
        <td>${fila.ganados}</td>
        <td>${fila.empatados}</td>
        <td>${fila.perdidos}</td>
        <td>${fila.a_favor}</td>
        <td>${fila.en_contra}</td>
        <td>${fila.diferencia}</td>
        <td>${fila.puntos}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function cargarFixture() {
  const tbody = document.getElementById('tablaFixture');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const res = await fetch(`/web/torneos/${torneoIdActual}/categorias/${categoriaIdActual}/fixture`);
    const data = await res.json();
    if (!data.ok || !data.partidos.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no hay partidos programados.</td></tr>';
      return;
    }
    tbody.innerHTML = data.partidos.map((p) => `
      <tr>
        <td>${p.jornada != null ? p.jornada : '-'}</td>
        <td>${escapeHtml(p.club_local_nombre)}</td>
        <td>${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'vs'}</td>
        <td>${escapeHtml(p.club_visitante_nombre)}</td>
        <td>${p.fecha ? escapeHtml(p.fecha) : '-'}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
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
