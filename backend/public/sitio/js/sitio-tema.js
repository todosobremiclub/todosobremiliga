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
