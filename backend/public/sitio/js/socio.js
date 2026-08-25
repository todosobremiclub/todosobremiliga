// Formulario público de autorregistro de socios (QR/link que comparte el
// Club). Sin login: identifica al club por el ?club_id= de la URL.

function obtenerClubId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('club_id');
}

function escapeHtml(texto) {
  if (texto == null) return '';
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function init() {
  const clubId = obtenerClubId();
  const bloqueError = document.getElementById('bloqueError');
  if (!clubId) {
    bloqueError.textContent = 'Este link no es válido — falta indicar el club.';
    bloqueError.classList.remove('oculto');
    return;
  }

  try {
    const res = await fetch(`/web/clubes/${clubId}/socio-registro`);
    const data = await res.json();
    if (!data.ok) {
      bloqueError.textContent = data.error || 'No se pudo cargar el formulario.';
      bloqueError.classList.remove('oculto');
      return;
    }

    document.getElementById('nombreClub').textContent = data.club.nombre;
    document.title = `Registrate en ${data.club.nombre} - Todo Sobre mi Liga`;
    if (data.club.logo_url) {
      const logo = document.getElementById('clubLogo');
      logo.src = data.club.logo_url;
      logo.classList.remove('oculto');
    }
    if (data.club.color_primario) {
      document.querySelector('.sitio-header').style.background = data.club.color_primario;
    }

    if (data.actividades.length) {
      document.getElementById('campoActividad').classList.remove('oculto');
      const select = document.getElementById('socioActividad');
      select.innerHTML = '<option value="">Elegí una actividad</option>' +
        data.actividades.map((a) => `<option value="${a.id}">${escapeHtml(a.nombre)}</option>`).join('');
    }
    if (data.categorias.length) {
      document.getElementById('campoCategoria').classList.remove('oculto');
      const select = document.getElementById('socioCategoria');
      select.innerHTML = '<option value="">Elegí una categoría</option>' +
        data.categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    }

    document.getElementById('formSocio').classList.remove('oculto');
    document.getElementById('formSocio').dataset.clubId = clubId;
  } catch (err) {
    bloqueError.textContent = 'No se pudo cargar el formulario. Probá de nuevo en un momento.';
    bloqueError.classList.remove('oculto');
  }
}

function onElegirFoto(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    const preview = document.getElementById('socioFotoPreview');
    preview.src = lector.result;
    preview.classList.remove('oculto');
    document.getElementById('formSocio').dataset.fotoUrl = lector.result;
  };
  lector.readAsDataURL(archivo);
}

async function enviarFormulario(e) {
  e.preventDefault();
  const form = document.getElementById('formSocio');
  const errorEl = document.getElementById('socioFormError');
  errorEl.classList.add('oculto');

  const clubId = form.dataset.clubId;
  const cuerpo = {
    nombre: document.getElementById('socioNombre').value.trim(),
    apellido: document.getElementById('socioApellido').value.trim(),
    dni: document.getElementById('socioDni').value.trim(),
    fecha_nacimiento: document.getElementById('socioFechaNacimiento').value || undefined,
    telefono: document.getElementById('socioTelefono').value.trim() || undefined,
    email: document.getElementById('socioEmail').value.trim() || undefined,
    actividad_id: document.getElementById('socioActividad').value || undefined,
    categoria_socio_id: document.getElementById('socioCategoria').value || undefined,
    foto_url: form.dataset.fotoUrl || undefined
  };

  try {
    const res = await fetch(`/web/clubes/${clubId}/socios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    const data = await res.json();
    if (!data.ok) {
      errorEl.textContent = data.error || 'No se pudo enviar la solicitud.';
      errorEl.classList.remove('oculto');
      return;
    }
    form.classList.add('oculto');
    document.getElementById('pantallaExito').classList.remove('oculto');
  } catch (err) {
    errorEl.textContent = 'No se pudo enviar la solicitud. Probá de nuevo en un momento.';
    errorEl.classList.remove('oculto');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('socioFotoArchivo').addEventListener('change', onElegirFoto);
  document.getElementById('formSocio').addEventListener('submit', enviarFormulario);
});
