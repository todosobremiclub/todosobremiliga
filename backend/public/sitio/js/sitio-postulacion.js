// Formulario público de postulación de un Club a una Liga (vía QR o link).

let ligaIdPostulacion = null;
let logoBase64Postulacion = '';

function getSlugDeUrl() {
  return new URLSearchParams(window.location.search).get('slug');
}

async function init() {
  const slug = getSlugDeUrl();
  if (!slug) {
    document.getElementById('nombreLiga').textContent = 'Liga no especificada';
    document.getElementById('postLigaNoEncontrada').classList.remove('oculto');
    return;
  }

  try {
    const res = await fetch(`/web/ligas/${slug}/postulacion`);
    const data = await res.json();
    if (!data.ok) throw new Error('no encontrada');
    const liga = data.liga;
    document.getElementById('nombreLiga').textContent = `Postulate a "${liga.nombre}"`;
    if (liga.logo_url) {
      const logo = document.getElementById('logoLiga');
      logo.src = liga.logo_url;
      logo.classList.remove('oculto');
    }
    document.getElementById('formPostulacion').classList.remove('oculto');
  } catch (err) {
    document.getElementById('nombreLiga').textContent = 'Liga no encontrada';
    document.getElementById('postLigaNoEncontrada').classList.remove('oculto');
    return;
  }

  document.getElementById('postLogoArchivo').addEventListener('change', onElegirLogo);
  ['Primario', 'Secundario'].forEach((sufijo) => {
    const input = document.getElementById(`postColor${sufijo}`);
    const span = document.getElementById(`postColor${sufijo}Hex`);
    input.addEventListener('input', () => { span.textContent = input.value; });
  });
  document.getElementById('formPostulacion').addEventListener('submit', enviarPostulacion);
}

function onElegirLogo(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    logoBase64Postulacion = lector.result;
    const preview = document.getElementById('postLogoPreview');
    preview.src = logoBase64Postulacion;
    preview.classList.remove('oculto');
    document.getElementById('postLogoUrl').value = logoBase64Postulacion;
  };
  lector.readAsDataURL(archivo);
}

async function enviarPostulacion(e) {
  e.preventDefault();
  const errorEl = document.getElementById('postFormError');
  errorEl.classList.add('oculto');

  const slug = getSlugDeUrl();
  const cuerpo = {
    nombre: document.getElementById('postNombre').value.trim(),
    cuit: document.getElementById('postCuit').value.trim() || undefined,
    direccion: document.getElementById('postDireccion').value.trim() || undefined,
    ciudad: document.getElementById('postCiudad').value.trim() || undefined,
    provincia: document.getElementById('postProvincia').value.trim() || undefined,
    telefono: document.getElementById('postTelefono').value.trim(),
    email_contacto: document.getElementById('postEmail').value.trim(),
    logo_url: document.getElementById('postLogoUrl').value || undefined,
    color_primario: document.getElementById('postColorPrimario').value,
    color_secundario: document.getElementById('postColorSecundario').value
  };

  try {
    const res = await fetch(`/web/ligas/${slug}/postulaciones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Error al enviar la postulación');

    document.getElementById('formPostulacion').classList.add('oculto');
    document.getElementById('postFormOk').classList.remove('oculto');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

document.addEventListener('DOMContentLoaded', init);
