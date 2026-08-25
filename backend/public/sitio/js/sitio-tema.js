// Aplica los colores propios de la Liga (Super Admin / Panel de Liga ->
// color_primario / color_secundario) al header, al fondo "cancha de noche"
// y a los acentos (botones, links, pestaña activa) de esta página pública.
// Mismo criterio que ya usa el Panel de Liga (public/js/liga.js) para su
// propio header -- así el sitio público de cada Liga se ve "de la casa".
// Se comparte entre liga.html, torneo.html, categoria.html y equipo.html.

function hexARgbTema(hex) {
  const limpio = (hex || '').replace('#', '');
  const valido = /^[0-9a-fA-F]{6}$/.test(limpio) ? limpio : '1d4ed8';
  const r = parseInt(valido.substring(0, 2), 16);
  const g = parseInt(valido.substring(2, 4), 16);
  const b = parseInt(valido.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function aplicarTemaLiga(colorPrimario, colorSecundario) {
  const primario = colorPrimario || '#1d4ed8';
  const secundario = colorSecundario || '#1e3a8a';

  // --azul es la variable que ya usan los links, botones, badges y la
  // pestaña activa en todo style.css -- pisándola acá, sin tocar el CSS,
  // toda esa parte de la página pasa a usar el color de la Liga.
  document.documentElement.style.setProperty('--azul', primario);

  const header = document.querySelector('.sitio-header');
  if (header) header.style.background = `linear-gradient(135deg, ${primario}, ${secundario})`;

  const rgbPrimario = hexARgbTema(primario);
  const rgbSecundario = hexARgbTema(secundario);
  document.body.style.background = `
    radial-gradient(circle at 50% 0%, rgba(${rgbPrimario}, 0.32), transparent 55%),
    radial-gradient(circle at 15% 90%, rgba(${rgbSecundario}, 0.18), transparent 45%),
    radial-gradient(circle at 85% 90%, rgba(${rgbPrimario}, 0.18), transparent 45%),
    linear-gradient(180deg, #0a0e17 0%, #0d1220 55%, #0a0e17 100%)
  `;
}

// Iconos inline (sin depender de ningún CDN de íconos) para los botones de
// redes sociales del footer.
const ICONOS_REDES_SOCIALES = {
  facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M22 12.06C22 6.51 17.52 2 12 2S2 6.51 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.51 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.58v1.85h2.78l-.44 2.91h-2.34V22c4.78-.76 8.44-4.92 8.44-9.94z"/></svg>',
  instagram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c2.72 0 3.06.01 4.12.06 1.06.05 1.79.22 2.43.47.66.26 1.21.6 1.76 1.15.55.55.9 1.1 1.15 1.76.25.64.42 1.37.47 2.43.05 1.06.06 1.4.06 4.12s-.01 3.06-.06 4.12c-.05 1.06-.22 1.79-.47 2.43a4.9 4.9 0 0 1-1.15 1.76 4.9 4.9 0 0 1-1.76 1.15c-.64.25-1.37.42-2.43.47-1.06.05-1.4.06-4.12.06s-3.06-.01-4.12-.06c-1.06-.05-1.79-.22-2.43-.47a4.9 4.9 0 0 1-1.76-1.15 4.9 4.9 0 0 1-1.15-1.76c-.25-.64-.42-1.37-.47-2.43C2.01 15.06 2 14.72 2 12s.01-3.06.06-4.12c.05-1.06.22-1.79.47-2.43.26-.66.6-1.21 1.15-1.76A4.9 4.9 0 0 1 5.44.54c.64-.25 1.37-.42 2.43-.47C8.94.02 9.28.01 12 .01zm0 1.8c-2.67 0-2.99.01-4.04.06-.97.04-1.5.2-1.85.34-.46.18-.79.4-1.14.75-.35.35-.57.68-.75 1.14-.14.35-.3.88-.34 1.85C3.83 9 3.82 9.32 3.82 12s.01 3 .06 4.04c.04.97.2 1.5.34 1.85.18.46.4.79.75 1.14.35.35.68.57 1.14.75.35.14.88.3 1.85.34 1.05.05 1.37.06 4.04.06s2.99-.01 4.04-.06c.97-.04 1.5-.2 1.85-.34.46-.18.79-.4 1.14-.75.35-.35.57-.68.75-1.14.14-.35.3-.88.34-1.85.05-1.04.06-1.36.06-4.04s-.01-2.99-.06-4.04c-.04-.97-.2-1.5-.34-1.85-.18-.46-.4-.79-.75-1.14a3.1 3.1 0 0 0-1.14-.75c-.35-.14-.88-.3-1.85-.34C14.99 1.83 14.67 1.82 12 1.82zm0 4.6a5.58 5.58 0 1 1 0 11.16 5.58 5.58 0 0 1 0-11.16zm0 1.8a3.78 3.78 0 1 0 0 7.56 3.78 3.78 0 0 0 0-7.56zm5.8-2a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.5 6.2a3.02 3.02 0 0 0-2.12-2.14C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.38.56A3.02 3.02 0 0 0 .5 6.2 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.8 3.02 3.02 0 0 0 2.12 2.14C4.5 20.5 12 20.5 12 20.5s7.5 0 9.38-.56a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.8zM9.6 15.6V8.4L15.8 12z"/></svg>'
};

// Arma el footer con el logo y las redes sociales de la Liga y lo inyecta en
// el <div id="footerLiga"></div> de la página (si existe). Sólo se pintan
// los botones de las redes que la Liga cargó desde el Super Admin -- las
// que no tienen URL cargada no aparecen.
function renderFooterLiga(datos) {
  const contenedor = document.getElementById('footerLiga');
  if (!contenedor) return;

  const redes = [
    { clave: 'facebook', url: datos.facebookUrl, etiqueta: 'Facebook' },
    { clave: 'instagram', url: datos.instagramUrl, etiqueta: 'Instagram' },
    { clave: 'youtube', url: datos.youtubeUrl, etiqueta: 'YouTube' }
  ].filter((r) => r.url);

  if (!datos.logoUrl && !redes.length) {
    contenedor.innerHTML = '';
    return;
  }

  // escapeHtml() se define en el JS propio de cada página (sitio-liga.js,
  // sitio-torneo.js, etc.), que siempre carga antes de que esta función se
  // llegue a ejecutar (recién se llama después del DOMContentLoaded de esa
  // página) -- por eso está disponible acá aunque viva en otro archivo.
  const escapar = typeof escapeHtml === 'function' ? escapeHtml : (t) => (t == null ? '' : String(t));

  contenedor.innerHTML = `
    <div class="footer-liga-inner">
      ${datos.logoUrl ? `<img class="footer-liga-logo" src="${escapar(datos.logoUrl)}" alt="${escapar(datos.nombre || 'Logo de la Liga')}">` : ''}
      ${redes.length ? `<div class="footer-liga-redes">
        ${redes.map((r) => `<a class="footer-liga-red-boton footer-liga-red-${r.clave}" href="${escapar(r.url)}" target="_blank" rel="noopener" aria-label="${r.etiqueta}">${ICONOS_REDES_SOCIALES[r.clave]}</a>`).join('')}
      </div>` : ''}
    </div>
  `;
}
