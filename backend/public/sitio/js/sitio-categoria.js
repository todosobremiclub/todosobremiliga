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
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTab('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTab('tarjetas'));

  cargarTabla();
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
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay goles cargados en esta categoría.</td></tr>';
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
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay tarjetas cargadas en esta categoría.</td></tr>';
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
