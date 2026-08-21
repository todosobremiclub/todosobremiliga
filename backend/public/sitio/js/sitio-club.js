// Página pública de perfil de un Club dentro de una Liga: datos básicos,
// todos los torneos/categorías en los que participa (con acceso directo a
// la tabla/fixture de cada uno), su posición actual en cada tabla y su
// próximo partido.

function getParamsDeUrl() {
  const params = new URLSearchParams(window.location.search);
  return {
    ligaSlug: params.get('ligaSlug'),
    clubId: params.get('clubId')
  };
}

async function init() {
  const { ligaSlug, clubId } = getParamsDeUrl();
  const contenedor = document.getElementById('listaParticipacionesClub');

  if (!ligaSlug || !clubId) {
    document.getElementById('nombreClub').textContent = 'Club no especificado';
    contenedor.innerHTML = '<p class="sitio-vacio">Faltan datos en la URL.</p>';
    return;
  }

  document.getElementById('linkVolverLiga').href = `/sitio/liga.html?slug=${encodeURIComponent(ligaSlug)}`;

  try {
    const res = await fetch(`/web/ligas/${encodeURIComponent(ligaSlug)}/clubes/${clubId}`);
    const data = await res.json();
    if (!data.ok) {
      document.getElementById('nombreClub').textContent = 'Club no encontrado';
      contenedor.innerHTML = '<p class="sitio-vacio">Este club no existe o no participa en esta Liga.</p>';
      return;
    }

    const club = data.club;
    document.getElementById('nombreClub').textContent = club.nombre;
    document.title = `${club.nombre} - Todo Sobre mi Liga`;
    if (club.logo_url) {
      const logo = document.getElementById('clubLogo');
      logo.src = club.logo_url;
      logo.classList.remove('oculto');
    }
    const direccionPartes = [club.direccion, club.ciudad, club.provincia].filter(Boolean);
    if (direccionPartes.length) {
      const direccionEl = document.getElementById('direccionClub');
      direccionEl.textContent = direccionPartes.join(', ');
      direccionEl.classList.remove('oculto');
    }

    renderParticipaciones(data.participaciones || []);
  } catch (err) {
    document.getElementById('nombreClub').textContent = 'Error cargando el club';
    contenedor.innerHTML = `<p class="sitio-vacio">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderParticipaciones(participaciones) {
  const contenedor = document.getElementById('listaParticipacionesClub');
  if (!participaciones.length) {
    contenedor.innerHTML = '<p class="sitio-vacio">Este club todavía no participa en ningún torneo de esta Liga.</p>';
    return;
  }

  contenedor.innerHTML = participaciones.map((p) => {
    const nombreCategoria = p.subcategoria_nombre ? `${p.categoria_nombre} — ${p.subcategoria_nombre}` : p.categoria_nombre;
    const tieneTabla = p.puesto != null;
    const resumenTabla = tieneTabla ? `
      <div class="participacion-resumen">
        <div class="puesto-tabla">${p.puesto}<span>° de ${p.total_equipos}</span></div>
        <div class="stats-mini">
          <div><strong>${p.partidos_jugados}</strong>PJ</div>
          <div><strong>${p.ganados}</strong>G</div>
          <div><strong>${p.empatados}</strong>E</div>
          <div><strong>${p.perdidos}</strong>P</div>
          <div><strong>${p.diferencia > 0 ? '+' : ''}${p.diferencia}</strong>Dif</div>
          <div><strong>${p.puntos}</strong>Pts</div>
        </div>
      </div>
    ` : '<p class="sitio-vacio" style="margin:0;">Todavía no jugó partidos con resultado cargado.</p>';

    const proximo = p.proximo_fecha || p.rival_nombre ? `
      <p class="proximo-partido-club" style="margin-top:10px;">
        <strong>Próximo:</strong> ${p.proximo_lv === 'L' ? 'vs' : '@'}
        ${p.rival_logo_url ? `<img src="${escapeHtml(p.rival_logo_url)}" alt="">` : ''}
        ${escapeHtml(p.rival_nombre || '')}
        ${p.proximo_fecha ? ` — ${escapeHtml(p.proximo_fecha)}${p.proximo_hora ? ` ${escapeHtml(String(p.proximo_hora).slice(0, 5))}` : ''}` : ''}
      </p>
    ` : '<p class="sitio-vacio" style="margin-top:10px;">Sin próximos partidos programados.</p>';

    const urlTorneo = `/sitio/torneo.html?id=${p.torneo_id}&categoriaId=${p.categoria_id}${p.subcategoria_id ? `&subcategoriaId=${p.subcategoria_id}` : ''}`;

    return `
      <div class="tarjeta-participacion-club">
        <h3>${p.torneo_logo_url ? `<img src="${escapeHtml(p.torneo_logo_url)}" alt="" class="logo-mini-torneo-club">` : ''}${escapeHtml(p.torneo_nombre)}</h3>
        <p class="categoria-nombre">${escapeHtml(nombreCategoria)}</p>
        ${resumenTabla}
        ${proximo}
        <a class="link-ver-torneo" href="${urlTorneo}">Ver tabla y fixture completo →</a>
      </div>
    `;
  }).join('');
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
