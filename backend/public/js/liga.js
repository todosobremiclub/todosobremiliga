// Lógica del Panel de Liga: Clubes + Torneos/Categorías/Equipos/Fixture/Tabla.

let clubesCache = [];
let torneosCache = [];
let categoriasCache = [];
let equiposCache = [];
let partidosCache = [];
let clubLogoBase64Actual = '';
let ligaSlugActual = null;

let paginaClubesActual = 1;
const CLUBES_POR_PAGINA = 25;
let totalClubesActual = 0;
let ordenClubesCampo = 'nombre';
let ordenClubesDireccion = 'asc';
let clubesSeleccionadosIds = new Set();
let modalidadesLigaCache = [];
let tiposGastoCache = [];
let tiposIngresoCache = [];
let cuentasLigaCache = [];

// ----- Íconos SVG reutilizados en botones de acciones (evitan depender de
// librerías externas de íconos y quedan livianos). -----
const ICONO_LAPIZ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const ICONO_PERSONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
const ICONO_BASURA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
const ICONO_COPA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5H4a1 1 0 0 0-1 1 5 5 0 0 0 4 5"/><path d="M17 5h3a1 1 0 0 1 1 1 5 5 0 0 1-4 5"/></svg>';
const ICONO_WHATSAPP = '<svg viewBox="0 0 32 32"><path fill="#fff" d="M16.02 3C9.4 3 4 8.4 4 15.02c0 2.23.6 4.36 1.75 6.24L4 29l7.94-1.7a12.9 12.9 0 0 0 4.08.65h.01c6.62 0 12.02-5.4 12.02-12.02C28.05 8.4 22.65 3 16.02 3Zm0 21.98h-.01a10 10 0 0 1-3.5-.62l-.5-.18-4.71 1.01 1.03-4.58-.2-.53a9.9 9.9 0 0 1-1.6-5.06c0-5.5 4.48-9.98 9.99-9.98 5.5 0 9.98 4.48 9.98 9.98s-4.48 9.96-9.98 9.96Zm5.47-7.47c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.13-.27-.2-.57-.35Z"/></svg>';

let torneoActualId = null;
let torneoActualNombre = '';
let categoriaActualId = null;
let categoriaActualNombre = '';
let subcategoriaActualId = null;
let subcategoriaActualNombre = '';
let rondaTablaActual = 'general';
let tiposCanchaCache = [];
let prediosLigaCache = [];
let predioActualId = null;
let canchasPredioCache = [];
let jornadaFixtureActual = 1;
let arbitrosLigaCache = [];
let canchasClubFixtureCache = {};
let jornadasDescripcionCache = {};

function torneoActualEsAperturaClausura() {
  const t = torneosCache.find((x) => x.id === torneoActualId);
  return !!(t && t.formato_juego === 'apertura_clausura');
}

function torneoActualObj() {
  return torneosCache.find((x) => x.id === torneoActualId) || null;
}

// ----- Popups: todas las pantallas de edición/detalle (Club, Usuarios,
// Canchas, Documentos, Notas, Torneo, Categorías, Detalle de categoría,
// Participaciones) se muestran como ventana modal centrada, compartiendo un
// único fondo oscuro (#fondoModalGenerico). -----
function mostrarFondoModal() {
  document.getElementById('fondoModalGenerico').classList.remove('oculto');
}
function ocultarFondoModal() {
  document.getElementById('fondoModalGenerico').classList.add('oculto');
}

function init() {
  const usuario = requerirRol(['liga_admin', 'super_admin']);
  if (!usuario) return;
  inicializarTopbar(usuario);
  conectarEventos();
  cargarPerfilLiga();
  cargarFiltrosDisponiblesClubes();
  cargarClubes();
  actualizarBadgePostulacionesPendientes();
}

// Trae los datos de marca (nombre/logo/colores) de la propia Liga y pinta el
// header con un degradé usando sus colores reales — look moderno pedido para
// el Panel Liga.
// Convierte un color hex (#rrggbb) a "r, g, b" para poder armar un rgba()
// con la opacidad que necesitemos en los degradés de fondo.
function hexARgb(hex) {
  const limpio = (hex || '').replace('#', '');
  const valido = /^[0-9a-fA-F]{6}$/.test(limpio) ? limpio : '1d4ed8';
  const r = parseInt(valido.substring(0, 2), 16);
  const g = parseInt(valido.substring(2, 4), 16);
  const b = parseInt(valido.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

async function cargarPerfilLiga() {
  try {
    const data = await apiFetch('/liga/perfil');
    const liga = data.liga;
    ligaSlugActual = liga.slug;
    const header = document.getElementById('headerLiga');
    const primario = liga.color_primario || '#1d4ed8';
    const secundario = liga.color_secundario || '#1e3a8a';
    header.style.background = `linear-gradient(135deg, ${primario}, ${secundario})`;
    header.classList.remove('oculto');
    document.getElementById('headerLigaNombre').textContent = liga.nombre;
    const logo = document.getElementById('headerLigaLogo');
    if (liga.logo_url) {
      logo.src = liga.logo_url;
      logo.classList.remove('oculto');
    } else {
      logo.classList.add('oculto');
    }

    // Fondo "cancha de noche" (mismo estilo que el login) pero con los
    // colores propios de esta Liga en vez de los azul/verde por defecto.
    const rgbPrimario = hexARgb(primario);
    const rgbSecundario = hexARgb(secundario);
    document.body.style.background = `
      radial-gradient(circle at 50% 0%, rgba(${rgbPrimario}, 0.32), transparent 55%),
      radial-gradient(circle at 15% 90%, rgba(${rgbSecundario}, 0.18), transparent 45%),
      radial-gradient(circle at 85% 90%, rgba(${rgbPrimario}, 0.18), transparent 45%),
      linear-gradient(180deg, #0a0e17 0%, #0d1220 55%, #0a0e17 100%)
    `;
  } catch (err) {
    // Si falla, seguimos con el fondo por defecto (azul/verde) del CSS.
  }
}

function conectarEventos() {
  document.getElementById('tabBtnClubes').addEventListener('click', () => cambiarTab('clubes'));
  document.getElementById('tabBtnTorneos').addEventListener('click', () => cambiarTab('torneos'));
  document.getElementById('tabBtnPostulaciones').addEventListener('click', () => cambiarTab('postulaciones'));
  document.getElementById('tabBtnFichajes').addEventListener('click', () => cambiarTab('fichajes'));
  document.getElementById('tabBtnNoticias').addEventListener('click', () => cambiarTab('noticias'));
  document.getElementById('tabBtnNotificaciones').addEventListener('click', () => cambiarTab('notificaciones'));
  document.getElementById('tabBtnFinanzas').addEventListener('click', () => cambiarTab('finanzas'));
  document.getElementById('tabBtnAgenda').addEventListener('click', () => cambiarTab('agenda'));
  document.getElementById('tabBtnConfiguracion').addEventListener('click', () => cambiarTab('configuracion'));

  // ---- Clubes ----
  document.getElementById('btnMostrarFormClub').addEventListener('click', () => {
    limpiarFormClub();
    document.getElementById('formClub').classList.remove('oculto');
    mostrarFondoModal();
  });
  document.getElementById('btnCancelarFormClub').addEventListener('click', () => {
    document.getElementById('formClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formClub').addEventListener('submit', guardarClub);
  document.getElementById('clubLogoArchivo').addEventListener('change', onElegirLogoClub);
  ['Primario', 'Secundario'].forEach((sufijo) => {
    const input = document.getElementById(`clubColor${sufijo}`);
    const span = document.getElementById(`clubColor${sufijo}Hex`);
    input.addEventListener('input', () => { span.textContent = input.value; });
  });

  document.getElementById('btnCerrarUsuariosClub').addEventListener('click', () => {
    document.getElementById('panelUsuariosClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formUsuarioClub').addEventListener('submit', crearUsuarioClub);

  document.getElementById('btnCerrarDocumentosClub').addEventListener('click', () => {
    document.getElementById('panelDocumentosClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formDocumentoClub').addEventListener('submit', subirDocumentoClub);

  document.getElementById('btnCerrarComentariosClub').addEventListener('click', () => {
    document.getElementById('panelComentariosClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formComentarioClub').addEventListener('submit', agregarComentarioClub);

  document.getElementById('btnCerrarParticipacionesClub').addEventListener('click', () => {
    document.getElementById('modalParticipacionesClub').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('fondoModalGenerico').addEventListener('click', () => {
    // El fondo compartido cierra cualquier popup que esté abierto en ese momento.
    ['formClub', 'panelUsuariosClub', 'panelDocumentosClub', 'panelComentariosClub', 'panelCanchasClub',
     'modalParticipacionesClub', 'formTorneo', 'panelCategorias', 'panelSubcategorias', 'panelDetalleCategoria'
    ].forEach((id) => document.getElementById(id).classList.add('oculto'));
    ocultarFondoModal();
    torneoActualId = null;
    categoriaActualId = null;
    subcategoriaActualId = null;
    subcategoriaActualNombre = '';
  });
  document.getElementById('btnGuardarParticipaciones').addEventListener('click', guardarParticipaciones);

  // ---- Canchas del club ----
  document.getElementById('btnGestionarCanchas').addEventListener('click', () => {
    const clubId = document.getElementById('clubIdEdicion').value;
    if (clubId) abrirCanchasClub(clubId);
  });
  document.getElementById('btnCerrarCanchasClub').addEventListener('click', () => {
    document.getElementById('panelCanchasClub').classList.add('oculto');
    document.getElementById('formClub').classList.remove('oculto');
  });
  document.getElementById('formCanchaSecundaria').addEventListener('submit', guardarCanchaSecundaria);
  document.getElementById('btnCancelarCanchaSecundaria').addEventListener('click', limpiarFormCanchaSecundaria);

  document.getElementById('buscadorClubes').addEventListener('input', () => {
    paginaClubesActual = 1;
    cargarClubes();
  });
  document.getElementById('btnDropdownCiudad').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownPanel('ciudad');
  });
  document.getElementById('btnDropdownProvincia').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownPanel('provincia');
  });
  document.getElementById('btnDropdownModalidad').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdownPanel('modalidad');
  });
  document.addEventListener('click', (e) => {
    // Cierra cualquier dropdown de filtro abierto si se hace click afuera.
    if (!e.target.closest('.dropdown-multi')) {
      document.querySelectorAll('.dropdown-multi-panel').forEach((p) => p.classList.add('oculto'));
    }
  });
  document.getElementById('filtroClubesCancha').addEventListener('change', () => {
    paginaClubesActual = 1;
    cargarClubes();
  });
  document.getElementById('filtroClubesInactivos').addEventListener('change', () => {
    paginaClubesActual = 1;
    cargarClubes();
  });
  document.getElementById('filtroClubesReglamentaria').addEventListener('change', () => {
    paginaClubesActual = 1;
    cargarClubes();
  });
  document.getElementById('chkSeleccionarTodosClubes').addEventListener('change', (e) => {
    if (e.target.checked) {
      clubesCache.forEach((c) => clubesSeleccionadosIds.add(c.id));
    } else {
      clubesCache.forEach((c) => clubesSeleccionadosIds.delete(c.id));
    }
    renderFilasClubes();
    actualizarBarraAccionesMasivas();
  });
  document.getElementById('btnLimpiarSeleccionClubes').addEventListener('click', () => {
    clubesSeleccionadosIds.clear();
    renderFilasClubes();
    actualizarBarraAccionesMasivas();
  });
  document.getElementById('btnAsignarCategoriaMasivo').addEventListener('click', abrirAsignarCategoriaMasivo);
  document.getElementById('btnCerrarAsignarMasivo').addEventListener('click', () => {
    document.getElementById('modalAsignarCategoriaMasivo').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('masivoTorneo').addEventListener('change', poblarCategoriasAsignarMasivo);
  document.getElementById('masivoCategoria').addEventListener('change', poblarSubcategoriaAsignarMasivo);
  document.getElementById('btnConfirmarAsignarMasivo').addEventListener('click', confirmarAsignarCategoriaMasivo);
  document.getElementById('clubActivoEnLiga').addEventListener('change', async (e) => {
    const clubId = document.getElementById('clubIdEdicion').value;
    if (!clubId) return;
    await toggleActivoClub(clubId, e.target.checked, true);
  });
  document.getElementById('btnAbrirDocumentosDesdeForm').addEventListener('click', () => {
    const clubId = document.getElementById('clubIdEdicion').value;
    const nombre = document.getElementById('clubNombre').value;
    if (clubId) abrirDocumentosClub(clubId, nombre);
  });
  document.getElementById('btnAbrirComentariosDesdeForm').addEventListener('click', () => {
    const clubId = document.getElementById('clubIdEdicion').value;
    const nombre = document.getElementById('clubNombre').value;
    if (clubId) abrirComentariosClub(clubId, nombre);
  });
  document.getElementById('btnClubesPaginaAnterior').addEventListener('click', () => {
    if (paginaClubesActual > 1) { paginaClubesActual -= 1; cargarClubes(); }
  });
  document.getElementById('btnClubesPaginaSiguiente').addEventListener('click', () => {
    if (paginaClubesActual * CLUBES_POR_PAGINA < totalClubesActual) { paginaClubesActual += 1; cargarClubes(); }
  });
  document.getElementById('btnClubesPaginaAnteriorTop').addEventListener('click', () => {
    if (paginaClubesActual > 1) { paginaClubesActual -= 1; cargarClubes(); }
  });
  document.getElementById('btnClubesPaginaSiguienteTop').addEventListener('click', () => {
    if (paginaClubesActual * CLUBES_POR_PAGINA < totalClubesActual) { paginaClubesActual += 1; cargarClubes(); }
  });
  document.getElementById('clubCanchaReglamentaria').addEventListener('change', (e) => {
    document.getElementById('clubCanchaTamanio').disabled = e.target.checked;
  });

  document.getElementById('btnDescargarPlantillaClubes').addEventListener('click', descargarPlantillaClubes);
  document.getElementById('btnMostrarCargaMasiva').addEventListener('click', () => {
    document.getElementById('cargaMasivaError').classList.add('oculto');
    document.getElementById('cargaMasivaResultado').innerHTML = '';
    document.getElementById('formCargaMasiva').classList.remove('oculto');
  });
  document.getElementById('btnCancelarCargaMasiva').addEventListener('click', () => {
    document.getElementById('formCargaMasiva').classList.add('oculto');
  });
  document.getElementById('formCargaMasiva').addEventListener('submit', subirCargaMasivaClubes);

  // ---- Postulaciones ----
  document.getElementById('btnCopiarLinkPostulacion').addEventListener('click', () => {
    const input = document.getElementById('linkPostulacionPublica');
    input.select();
    navigator.clipboard && navigator.clipboard.writeText(input.value);
  });
  document.getElementById('filtroEstadoPostulacion').addEventListener('change', cargarPostulaciones);
  document.getElementById('btnCompartirPostulacion').addEventListener('click', compartirLinkPostulacion);
  document.getElementById('btnDescargarQrPostulacion').addEventListener('click', descargarQrPostulacion);

  // ---- Torneos ----
  document.getElementById('btnMostrarFormTorneo').addEventListener('click', () => {
    document.getElementById('formTorneo').reset();
    document.getElementById('torneoIdEdicion').value = '';
    document.getElementById('torneoPtsVictoria').value = 3;
    document.getElementById('torneoPtsEmpate').value = 1;
    document.getElementById('torneoFormError').classList.add('oculto');
    document.getElementById('formTorneo').classList.remove('oculto');
    mostrarFondoModal();
  });
  document.getElementById('btnCancelarFormTorneo').addEventListener('click', () => {
    document.getElementById('formTorneo').classList.add('oculto');
    ocultarFondoModal();
  });
  document.getElementById('formTorneo').addEventListener('submit', guardarTorneo);
  document.getElementById('buscadorTorneos').addEventListener('input', () => renderTorneos());

  // ---- Categorías ----
  document.getElementById('btnCerrarCategorias').addEventListener('click', () => {
    document.getElementById('panelCategorias').classList.add('oculto');
    document.getElementById('panelSubcategorias').classList.add('oculto');
    document.getElementById('panelDetalleCategoria').classList.add('oculto');
    torneoActualId = null;
    categoriaActualId = null;
    subcategoriaActualId = null;
    subcategoriaActualNombre = '';
    ocultarFondoModal();
  });
  document.getElementById('btnMostrarFormCategoria').addEventListener('click', () => {
    document.getElementById('formCategoria').reset();
    document.getElementById('categoriaIdEdicion').value = '';
    document.getElementById('categoriaTorneoId').value = torneoActualId;
    document.getElementById('categoriaSumaTablaGeneral').checked = true;
    document.getElementById('categoriaFormError').classList.add('oculto');
    document.getElementById('formCategoria').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormCategoria').addEventListener('click', () => {
    document.getElementById('formCategoria').classList.add('oculto');
  });
  document.getElementById('formCategoria').addEventListener('submit', guardarCategoria);

  // ---- Subcategorías (pantalla intermedia, solo si la categoría las tiene) ----
  document.getElementById('btnCerrarSubcategorias').addEventListener('click', () => {
    document.getElementById('panelSubcategorias').classList.add('oculto');
    document.getElementById('panelCategorias').classList.remove('oculto');
    categoriaActualId = null;
  });
  document.getElementById('btnMostrarFormSubcategoria').addEventListener('click', () => {
    document.getElementById('formSubcategoria').reset();
    document.getElementById('subcategoriaIdEdicion').value = '';
    document.getElementById('subcategoriaSumaTablaGeneral').checked = true;
    document.getElementById('subcategoriaFormError').classList.add('oculto');
    document.getElementById('formSubcategoria').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormSubcategoria').addEventListener('click', () => {
    document.getElementById('formSubcategoria').classList.add('oculto');
  });
  document.getElementById('formSubcategoria').addEventListener('submit', guardarSubcategoria);

  // ---- Detalle de categoría/subcategoría (fixture/tabla/goleadores/tarjetas) ----
  document.getElementById('btnCerrarDetalleCategoria').addEventListener('click', () => {
    document.getElementById('panelDetalleCategoria').classList.add('oculto');
    if (subcategoriaActualId) {
      document.getElementById('panelSubcategorias').classList.remove('oculto');
    } else {
      document.getElementById('panelCategorias').classList.remove('oculto');
      categoriaActualId = null;
    }
    subcategoriaActualId = null;
    subcategoriaActualNombre = '';
  });
  document.getElementById('btnAbrirGestionarEquipos').addEventListener('click', abrirGestionarEquipos);
  document.getElementById('btnCerrarGestionarEquipos').addEventListener('click', cerrarGestionarEquipos);
  document.getElementById('btnVerTablaGeneral').addEventListener('click', abrirTablaGeneral);
  document.getElementById('btnCerrarTablaGeneral').addEventListener('click', cerrarTablaGeneral);
  document.getElementById('tabBtnFixture').addEventListener('click', () => cambiarTabDetalle('fixture'));
  document.getElementById('tabBtnTabla').addEventListener('click', () => cambiarTabDetalle('tabla'));
  document.getElementById('tabBtnGoleadores').addEventListener('click', () => cambiarTabDetalle('goleadores'));
  document.getElementById('tabBtnTarjetas').addEventListener('click', () => cambiarTabDetalle('tarjetas'));

  document.getElementById('tabBtnRondaGeneral').addEventListener('click', () => cambiarRondaTabla('general'));
  document.getElementById('tabBtnRondaApertura').addEventListener('click', () => cambiarRondaTabla('apertura'));
  document.getElementById('tabBtnRondaClausura').addEventListener('click', () => cambiarRondaTabla('clausura'));

  document.getElementById('btnJornadaAnterior').addEventListener('click', () => cambiarJornadaFixture(-1));
  document.getElementById('btnJornadaSiguiente').addEventListener('click', () => cambiarJornadaFixture(1));
  document.getElementById('btnGuardarDescripcionJornada').addEventListener('click', guardarDescripcionJornada);

  document.getElementById('btnInscribirClub').addEventListener('click', inscribirClub);

  document.getElementById('btnMostrarFormPartido').addEventListener('click', () => {
    document.getElementById('formPartido').reset();
    document.getElementById('partidoFormError').classList.add('oculto');
    document.getElementById('formPartido').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormPartido').addEventListener('click', () => {
    document.getElementById('formPartido').classList.add('oculto');
  });
  document.getElementById('formPartido').addEventListener('submit', guardarPartido);

  document.getElementById('btnGenerarFixture').addEventListener('click', () => {
    document.getElementById('fixtureAccionError').classList.add('oculto');
    document.getElementById('formGenerarFixture').classList.remove('oculto');
  });
  document.getElementById('btnCancelarGenerarFixture').addEventListener('click', () => {
    document.getElementById('formGenerarFixture').classList.add('oculto');
  });
  document.getElementById('formGenerarFixture').addEventListener('submit', generarFixtureAutomatico);
  document.getElementById('btnVaciarFixture').addEventListener('click', vaciarFixture);

  document.getElementById('btnCerrarCargarResultado').addEventListener('click', cerrarModalResultado);
  document.getElementById('btnCancelarResultado').addEventListener('click', cerrarModalResultado);
  document.getElementById('formResultado').addEventListener('submit', guardarResultadoConEstadisticas);

  // ---- Fichajes ----
  document.getElementById('filtroEstadoFichaje').addEventListener('change', cargarFichajesLiga);

  // ---- Noticias ----
  document.getElementById('btnMostrarFormNoticia').addEventListener('click', () => {
    document.getElementById('formNoticia').reset();
    document.getElementById('noticiaFormError').classList.add('oculto');
    document.getElementById('formNoticia').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormNoticia').addEventListener('click', () => {
    document.getElementById('formNoticia').classList.add('oculto');
  });
  document.getElementById('formNoticia').addEventListener('submit', guardarNoticia);

  // ---- Notificaciones ----
  document.getElementById('btnMostrarFormNotificacion').addEventListener('click', () => {
    document.getElementById('formNotificacion').reset();
    document.getElementById('notificacionFormError').classList.add('oculto');
    document.getElementById('notificacionFormOk').classList.add('oculto');
    poblarSelectClubesNotificacion();
    document.getElementById('formNotificacion').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormNotificacion').addEventListener('click', () => {
    document.getElementById('formNotificacion').classList.add('oculto');
  });
  document.getElementById('formNotificacion').addEventListener('submit', enviarNotificacion);

  // ---- Finanzas ----
  document.getElementById('btnMostrarFormIngreso').addEventListener('click', () => {
    document.getElementById('formIngreso').reset();
    document.getElementById('ingresoFormError').classList.add('oculto');
    poblarSelectClubesIngreso();
    poblarSelectFinanzasIngreso();
    document.getElementById('formIngreso').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormIngreso').addEventListener('click', () => {
    document.getElementById('formIngreso').classList.add('oculto');
  });
  document.getElementById('formIngreso').addEventListener('submit', guardarIngreso);

  document.getElementById('btnMostrarFormGasto').addEventListener('click', () => {
    document.getElementById('formGasto').reset();
    document.getElementById('gastoFormError').classList.add('oculto');
    poblarSelectFinanzasGasto();
    document.getElementById('formGasto').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormGasto').addEventListener('click', () => {
    document.getElementById('formGasto').classList.add('oculto');
  });
  document.getElementById('formGasto').addEventListener('submit', guardarGasto);

  // ---- Agenda ----
  document.getElementById('btnMostrarFormEvento').addEventListener('click', () => {
    document.getElementById('formEvento').reset();
    document.getElementById('eventoFormError').classList.add('oculto');
    document.getElementById('formEvento').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormEvento').addEventListener('click', () => {
    document.getElementById('formEvento').classList.add('oculto');
  });
  document.getElementById('formEvento').addEventListener('submit', guardarEvento);

  // ---- Configuración ----
  document.getElementById('tabBtnConfigModalidades').addEventListener('click', () => cambiarTabConfig('modalidades'));
  document.getElementById('tabBtnConfigTiposGasto').addEventListener('click', () => cambiarTabConfig('tiposGasto'));
  document.getElementById('tabBtnConfigTiposIngreso').addEventListener('click', () => cambiarTabConfig('tiposIngreso'));
  document.getElementById('tabBtnConfigCuentas').addEventListener('click', () => cambiarTabConfig('cuentas'));
  document.getElementById('tabBtnConfigTiposCancha').addEventListener('click', () => cambiarTabConfig('tiposCancha'));
  document.getElementById('tabBtnConfigPredios').addEventListener('click', () => cambiarTabConfig('predios'));
  document.getElementById('tabBtnConfigArbitros').addEventListener('click', () => cambiarTabConfig('arbitros'));

  document.getElementById('btnMostrarFormModalidad').addEventListener('click', () => {
    document.getElementById('formModalidad').reset();
    document.getElementById('modalidadIdEdicion').value = '';
    document.getElementById('modalidadFormError').classList.add('oculto');
    document.getElementById('formModalidad').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormModalidad').addEventListener('click', () => {
    document.getElementById('formModalidad').classList.add('oculto');
  });
  document.getElementById('formModalidad').addEventListener('submit', guardarModalidad);

  document.getElementById('btnMostrarFormTipoGasto').addEventListener('click', () => {
    document.getElementById('formTipoGasto').reset();
    document.getElementById('tipoGastoIdEdicion').value = '';
    document.getElementById('tipoGastoFormError').classList.add('oculto');
    document.getElementById('formTipoGasto').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormTipoGasto').addEventListener('click', () => {
    document.getElementById('formTipoGasto').classList.add('oculto');
  });
  document.getElementById('formTipoGasto').addEventListener('submit', guardarTipoGasto);

  document.getElementById('btnMostrarFormTipoIngreso').addEventListener('click', () => {
    document.getElementById('formTipoIngreso').reset();
    document.getElementById('tipoIngresoIdEdicion').value = '';
    document.getElementById('tipoIngresoFormError').classList.add('oculto');
    document.getElementById('formTipoIngreso').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormTipoIngreso').addEventListener('click', () => {
    document.getElementById('formTipoIngreso').classList.add('oculto');
  });
  document.getElementById('formTipoIngreso').addEventListener('submit', guardarTipoIngreso);

  document.getElementById('btnMostrarFormCuenta').addEventListener('click', () => {
    document.getElementById('formCuenta').reset();
    document.getElementById('cuentaIdEdicion').value = '';
    document.getElementById('cuentaFormError').classList.add('oculto');
    document.getElementById('formCuenta').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormCuenta').addEventListener('click', () => {
    document.getElementById('formCuenta').classList.add('oculto');
  });
  document.getElementById('formCuenta').addEventListener('submit', guardarCuenta);

  document.getElementById('btnMostrarFormTipoCancha').addEventListener('click', () => {
    document.getElementById('formTipoCancha').reset();
    document.getElementById('tipoCanchaIdEdicion').value = '';
    document.getElementById('tipoCanchaFormError').classList.add('oculto');
    document.getElementById('formTipoCancha').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormTipoCancha').addEventListener('click', () => {
    document.getElementById('formTipoCancha').classList.add('oculto');
  });
  document.getElementById('formTipoCancha').addEventListener('submit', guardarTipoCancha);

  document.getElementById('btnMostrarFormPredio').addEventListener('click', () => {
    document.getElementById('formPredio').reset();
    document.getElementById('predioIdEdicion').value = '';
    document.getElementById('predioFormError').classList.add('oculto');
    document.getElementById('formPredio').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormPredio').addEventListener('click', () => {
    document.getElementById('formPredio').classList.add('oculto');
  });
  document.getElementById('formPredio').addEventListener('submit', guardarPredio);

  document.getElementById('btnCerrarCanchasPredio').addEventListener('click', cerrarCanchasPredio);
  document.getElementById('formCanchaPredio').addEventListener('submit', guardarCanchaPredio);
  document.getElementById('btnCancelarCanchaPredio').addEventListener('click', limpiarFormCanchaPredio);

  document.getElementById('btnMostrarFormArbitro').addEventListener('click', () => {
    document.getElementById('formArbitro').reset();
    document.getElementById('arbitroIdEdicion').value = '';
    document.getElementById('arbitroFormError').classList.add('oculto');
    document.getElementById('formArbitro').classList.remove('oculto');
  });
  document.getElementById('btnCancelarFormArbitro').addEventListener('click', () => {
    document.getElementById('formArbitro').classList.add('oculto');
  });
  document.getElementById('formArbitro').addEventListener('submit', guardarArbitro);
}

function cambiarTab(nombre) {
  const secciones = {
    clubes: 'seccionClubes', torneos: 'seccionTorneos', postulaciones: 'seccionPostulaciones', fichajes: 'seccionFichajes',
    noticias: 'seccionNoticias', notificaciones: 'seccionNotificaciones',
    finanzas: 'seccionFinanzas', agenda: 'seccionAgenda', configuracion: 'seccionConfiguracion'
  };
  const botones = {
    clubes: 'tabBtnClubes', torneos: 'tabBtnTorneos', postulaciones: 'tabBtnPostulaciones', fichajes: 'tabBtnFichajes',
    noticias: 'tabBtnNoticias', notificaciones: 'tabBtnNotificaciones',
    finanzas: 'tabBtnFinanzas', agenda: 'tabBtnAgenda', configuracion: 'tabBtnConfiguracion'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'torneos' && !torneosCache.length) {
    cargarTorneos();
  }
  if (nombre === 'postulaciones') {
    pintarLinkYQrPostulacion();
    cargarPostulaciones();
  }
  if (nombre === 'fichajes') cargarFichajesLiga();
  if (nombre === 'noticias') cargarNoticias();
  if (nombre === 'notificaciones') cargarNotificaciones();
  if (nombre === 'finanzas') cargarFinanzas();
  if (nombre === 'agenda') cargarAgenda();
  if (nombre === 'configuracion') cambiarTabConfig('modalidades');
}

// ===================== CONFIGURACIÓN =====================

function cambiarTabConfig(nombre) {
  const secciones = {
    modalidades: 'subConfigModalidades', tiposGasto: 'subConfigTiposGasto',
    tiposIngreso: 'subConfigTiposIngreso', cuentas: 'subConfigCuentas',
    tiposCancha: 'subConfigTiposCancha', predios: 'subConfigPredios', arbitros: 'subConfigArbitros'
  };
  const botones = {
    modalidades: 'tabBtnConfigModalidades', tiposGasto: 'tabBtnConfigTiposGasto',
    tiposIngreso: 'tabBtnConfigTiposIngreso', cuentas: 'tabBtnConfigCuentas',
    tiposCancha: 'tabBtnConfigTiposCancha', predios: 'tabBtnConfigPredios', arbitros: 'tabBtnConfigArbitros'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'modalidades') cargarModalidades();
  if (nombre === 'tiposGasto') cargarTiposGasto();
  if (nombre === 'tiposIngreso') cargarTiposIngreso();
  if (nombre === 'cuentas') cargarCuentas();
  if (nombre === 'tiposCancha') cargarTiposCancha();
  if (nombre === 'predios') cargarPredios();
  if (nombre === 'arbitros') cargarArbitros();
}

// ----- Categorías de torneo (modalidades) -----

async function cargarModalidades() {
  const tbody = document.getElementById('tablaModalidades');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/configuracion/modalidades');
    modalidadesLigaCache = data.modalidades;
    if (!modalidadesLigaCache.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no cargaste categorías de torneo.</td></tr>';
      return;
    }
    tbody.innerHTML = modalidadesLigaCache.map((m) => `
      <tr>
        <td>${escapeHtml(m.nombre)}</td>
        <td>${m.precio != null ? `$${Number(m.precio).toLocaleString('es-AR')}` : '-'}</td>
        <td>${m.cantidad_clubes}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarModalidad('${m.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarModalidad('${m.id}', '${escapeHtml(m.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarModalidad(id) {
  const m = modalidadesLigaCache.find((x) => x.id === id);
  if (!m) return;
  document.getElementById('modalidadIdEdicion').value = m.id;
  document.getElementById('modalidadNombre').value = m.nombre || '';
  document.getElementById('modalidadPrecio').value = m.precio != null ? m.precio : '';
  document.getElementById('modalidadFormError').classList.add('oculto');
  document.getElementById('formModalidad').classList.remove('oculto');
}

async function eliminarModalidad(id, nombre) {
  if (!confirm(`¿Eliminar la categoría de torneo "${nombre}"? Los clubes anotados en ella dejan de estarlo.`)) return;
  try {
    await apiFetch(`/liga/configuracion/modalidades/${id}`, { method: 'DELETE' });
    cargarModalidades();
    cargarFiltroModalidadesClubes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarModalidad(e) {
  e.preventDefault();
  const errorEl = document.getElementById('modalidadFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('modalidadIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('modalidadNombre').value.trim(),
    precio: document.getElementById('modalidadPrecio').value || undefined
  };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/modalidades/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/modalidades', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formModalidad').reset();
    document.getElementById('modalidadIdEdicion').value = '';
    document.getElementById('formModalidad').classList.add('oculto');
    cargarModalidades();
    cargarFiltroModalidadesClubes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Tipos de gasto -----

async function cargarTiposGasto() {
  const tbody = document.getElementById('tablaTiposGasto');
  tbody.innerHTML = '<tr><td colspan="2">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/configuracion/tipos-gasto');
    tiposGastoCache = data.tipos;
    tbody.innerHTML = tiposGastoCache.length ? tiposGastoCache.map((t) => `
      <tr>
        <td>${escapeHtml(t.nombre)}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarTipoGasto('${t.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarTipoGasto('${t.id}', '${escapeHtml(t.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="2">Todavía no cargaste tipos de gasto.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarTipoGasto(id) {
  const t = tiposGastoCache.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('tipoGastoIdEdicion').value = t.id;
  document.getElementById('tipoGastoNombre').value = t.nombre || '';
  document.getElementById('tipoGastoFormError').classList.add('oculto');
  document.getElementById('formTipoGasto').classList.remove('oculto');
}

async function eliminarTipoGasto(id, nombre) {
  if (!confirm(`¿Eliminar el tipo de gasto "${nombre}"?`)) return;
  try {
    await apiFetch(`/liga/configuracion/tipos-gasto/${id}`, { method: 'DELETE' });
    cargarTiposGasto();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarTipoGasto(e) {
  e.preventDefault();
  const errorEl = document.getElementById('tipoGastoFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('tipoGastoIdEdicion').value;
  const cuerpo = { nombre: document.getElementById('tipoGastoNombre').value.trim() };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/tipos-gasto/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/tipos-gasto', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formTipoGasto').reset();
    document.getElementById('tipoGastoIdEdicion').value = '';
    document.getElementById('formTipoGasto').classList.add('oculto');
    cargarTiposGasto();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Tipos de ingreso -----

async function cargarTiposIngreso() {
  const tbody = document.getElementById('tablaTiposIngreso');
  tbody.innerHTML = '<tr><td colspan="2">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/configuracion/tipos-ingreso');
    tiposIngresoCache = data.tipos;
    tbody.innerHTML = tiposIngresoCache.length ? tiposIngresoCache.map((t) => `
      <tr>
        <td>${escapeHtml(t.nombre)}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarTipoIngreso('${t.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarTipoIngreso('${t.id}', '${escapeHtml(t.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="2">Todavía no cargaste tipos de ingreso.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarTipoIngreso(id) {
  const t = tiposIngresoCache.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('tipoIngresoIdEdicion').value = t.id;
  document.getElementById('tipoIngresoNombre').value = t.nombre || '';
  document.getElementById('tipoIngresoFormError').classList.add('oculto');
  document.getElementById('formTipoIngreso').classList.remove('oculto');
}

async function eliminarTipoIngreso(id, nombre) {
  if (!confirm(`¿Eliminar el tipo de ingreso "${nombre}"?`)) return;
  try {
    await apiFetch(`/liga/configuracion/tipos-ingreso/${id}`, { method: 'DELETE' });
    cargarTiposIngreso();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarTipoIngreso(e) {
  e.preventDefault();
  const errorEl = document.getElementById('tipoIngresoFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('tipoIngresoIdEdicion').value;
  const cuerpo = { nombre: document.getElementById('tipoIngresoNombre').value.trim() };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/tipos-ingreso/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/tipos-ingreso', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formTipoIngreso').reset();
    document.getElementById('tipoIngresoIdEdicion').value = '';
    document.getElementById('formTipoIngreso').classList.add('oculto');
    cargarTiposIngreso();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Cuentas de la Liga -----

async function cargarCuentas() {
  const tbody = document.getElementById('tablaCuentas');
  tbody.innerHTML = '<tr><td colspan="2">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/configuracion/cuentas');
    cuentasLigaCache = data.cuentas;
    tbody.innerHTML = cuentasLigaCache.length ? cuentasLigaCache.map((c) => `
      <tr>
        <td>${escapeHtml(c.nombre)}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarCuenta('${c.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarCuenta('${c.id}', '${escapeHtml(c.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="2">Todavía no cargaste cuentas.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarCuenta(id) {
  const c = cuentasLigaCache.find((x) => x.id === id);
  if (!c) return;
  document.getElementById('cuentaIdEdicion').value = c.id;
  document.getElementById('cuentaNombre').value = c.nombre || '';
  document.getElementById('cuentaFormError').classList.add('oculto');
  document.getElementById('formCuenta').classList.remove('oculto');
}

async function eliminarCuenta(id, nombre) {
  if (!confirm(`¿Eliminar la cuenta "${nombre}"?`)) return;
  try {
    await apiFetch(`/liga/configuracion/cuentas/${id}`, { method: 'DELETE' });
    cargarCuentas();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarCuenta(e) {
  e.preventDefault();
  const errorEl = document.getElementById('cuentaFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('cuentaIdEdicion').value;
  const cuerpo = { nombre: document.getElementById('cuentaNombre').value.trim() };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/cuentas/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/cuentas', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formCuenta').reset();
    document.getElementById('cuentaIdEdicion').value = '';
    document.getElementById('formCuenta').classList.add('oculto');
    cargarCuentas();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Tipos de cancha -----

async function cargarTiposCancha() {
  const tbody = document.getElementById('tablaTiposCancha');
  tbody.innerHTML = '<tr><td colspan="2">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/configuracion/tipos-cancha');
    tiposCanchaCache = data.tipos;
    tbody.innerHTML = tiposCanchaCache.length ? tiposCanchaCache.map((t) => `
      <tr>
        <td>${escapeHtml(t.nombre)}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarTipoCancha('${t.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarTipoCancha('${t.id}', '${escapeHtml(t.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="2">Todavía no cargaste tipos de cancha.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="2">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarTipoCancha(id) {
  const t = tiposCanchaCache.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('tipoCanchaIdEdicion').value = t.id;
  document.getElementById('tipoCanchaNombre').value = t.nombre || '';
  document.getElementById('tipoCanchaFormError').classList.add('oculto');
  document.getElementById('formTipoCancha').classList.remove('oculto');
}

async function eliminarTipoCancha(id, nombre) {
  if (!confirm(`¿Eliminar el tipo de cancha "${nombre}"?`)) return;
  try {
    await apiFetch(`/liga/configuracion/tipos-cancha/${id}`, { method: 'DELETE' });
    tiposCanchaCache = [];
    cargarTiposCancha();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarTipoCancha(e) {
  e.preventDefault();
  const errorEl = document.getElementById('tipoCanchaFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('tipoCanchaIdEdicion').value;
  const cuerpo = { nombre: document.getElementById('tipoCanchaNombre').value.trim() };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/tipos-cancha/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/tipos-cancha', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formTipoCancha').reset();
    document.getElementById('tipoCanchaIdEdicion').value = '';
    document.getElementById('formTipoCancha').classList.add('oculto');
    tiposCanchaCache = [];
    cargarTiposCancha();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// Puebla los desplegables de "Tipo de cancha" del club (principal y
// secundarias) y de las canchas propias de la Liga, trayendo la lista
// configurada en Configuración → Tipos de cancha (si todavía no está en caché).
async function poblarSelectTipoCancha() {
  try {
    if (!tiposCanchaCache.length) {
      const data = await apiFetch('/liga/configuracion/tipos-cancha');
      tiposCanchaCache = data.tipos;
    }
  } catch (err) { /* si falla, los selects quedan con la opción por defecto */ }
  const opciones = '<option value="">Sin especificar</option>' +
    tiposCanchaCache.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  ['clubCanchaTipo', 'canchaTipo', 'canchaPredioTipo'].forEach((id) => {
    const select = document.getElementById(id);
    if (select) select.innerHTML = opciones;
  });
}

// ----- Predios y canchas propias de la Liga -----

async function cargarPredios() {
  const cont = document.getElementById('listaPredios');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch('/liga/configuracion/predios');
    prediosLigaCache = data.predios;
    renderListaPredios();
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderListaPredios() {
  const cont = document.getElementById('listaPredios');
  if (!prediosLigaCache.length) {
    cont.innerHTML = '<p class="texto-ayuda">Todavía no cargaste ningún predio.</p>';
    return;
  }
  cont.innerHTML = prediosLigaCache.map((p) => `
    <div class="panel" style="margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div>
          <strong>${escapeHtml(p.nombre)}</strong>
          ${p.direccion ? `<span class="texto-ayuda"> — ${escapeHtml(p.direccion)}</span>` : ''}
          <span class="texto-ayuda"> (${(p.canchas || []).length} cancha${(p.canchas || []).length === 1 ? '' : 's'})</span>
        </div>
        <div>
          <button class="btn btn-secundario btn-pequeno" onclick="abrirCanchasPredio('${p.id}')">Ver canchas</button>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarPredio('${p.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarPredio('${p.id}', '${escapeHtml(p.nombre)}')">${ICONO_BASURA}</button>
        </div>
      </div>
    </div>
  `).join('');
}

function editarPredio(id) {
  const p = prediosLigaCache.find((x) => x.id === id);
  if (!p) return;
  document.getElementById('predioIdEdicion').value = p.id;
  document.getElementById('predioNombre').value = p.nombre || '';
  document.getElementById('predioDireccion').value = p.direccion || '';
  document.getElementById('predioFormError').classList.add('oculto');
  document.getElementById('formPredio').classList.remove('oculto');
}

async function eliminarPredio(id, nombre) {
  if (!confirm(`¿Eliminar el predio "${nombre}"? Se borran también sus canchas.`)) return;
  try {
    await apiFetch(`/liga/configuracion/predios/${id}`, { method: 'DELETE' });
    cargarPredios();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarPredio(e) {
  e.preventDefault();
  const errorEl = document.getElementById('predioFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('predioIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('predioNombre').value.trim(),
    direccion: document.getElementById('predioDireccion').value.trim() || undefined
  };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/predios/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/predios', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formPredio').reset();
    document.getElementById('predioIdEdicion').value = '';
    document.getElementById('formPredio').classList.add('oculto');
    cargarPredios();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Canchas de un predio puntual (popup) -----

async function abrirCanchasPredio(predioId) {
  predioActualId = predioId;
  const predio = prediosLigaCache.find((x) => x.id === predioId);
  document.getElementById('tituloCanchasPredio').textContent = `Canchas de "${predio ? predio.nombre : ''}"`;
  limpiarFormCanchaPredio();
  await poblarSelectTipoCancha();
  document.getElementById('modalCanchasPredio').classList.remove('oculto');
  mostrarFondoModal();
  renderTablaCanchasPredio();
}

function cerrarCanchasPredio() {
  document.getElementById('modalCanchasPredio').classList.add('oculto');
  ocultarFondoModal();
  predioActualId = null;
}

function renderTablaCanchasPredio() {
  const tbody = document.getElementById('tablaCanchasPredio');
  const predio = prediosLigaCache.find((x) => x.id === predioActualId);
  canchasPredioCache = (predio && predio.canchas) || [];
  if (!canchasPredioCache.length) {
    tbody.innerHTML = '<tr><td colspan="5">Este predio todavía no tiene canchas cargadas.</td></tr>';
    return;
  }
  tbody.innerHTML = canchasPredioCache.map((c) => `
    <tr>
      <td>${escapeHtml(c.nombre)}</td>
      <td>${c.tipo_techo === 'techada' ? 'Techada' : 'Aire libre'}</td>
      <td>${escapeHtml(c.tamanio || '-')}</td>
      <td>${escapeHtml(c.tipo_cancha_nombre || '-')}</td>
      <td>
        <button class="btn btn-secundario btn-pequeno" onclick="editarCanchaPredio('${c.id}')">Editar</button>
        <button class="btn btn-peligro btn-pequeno" onclick="eliminarCanchaPredio('${c.id}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function limpiarFormCanchaPredio() {
  document.getElementById('canchaPredioIdEdicion').value = '';
  document.getElementById('canchaPredioNombre').value = '';
  document.getElementById('canchaPredioTecho').value = 'aire_libre';
  document.getElementById('canchaPredioTamanio').value = '';
  document.getElementById('canchaPredioTipo').value = '';
  document.getElementById('canchaPredioFormError').classList.add('oculto');
  document.getElementById('btnGuardarCanchaPredio').textContent = 'Agregar cancha';
  document.getElementById('btnCancelarCanchaPredio').classList.add('oculto');
}

function editarCanchaPredio(canchaId) {
  const cancha = canchasPredioCache.find((c) => c.id === canchaId);
  if (!cancha) return;
  document.getElementById('canchaPredioIdEdicion').value = cancha.id;
  document.getElementById('canchaPredioNombre').value = cancha.nombre || '';
  document.getElementById('canchaPredioTecho').value = cancha.tipo_techo || 'aire_libre';
  document.getElementById('canchaPredioTamanio').value = cancha.tamanio || '';
  document.getElementById('canchaPredioTipo').value = cancha.tipo_cancha_id || '';
  document.getElementById('btnGuardarCanchaPredio').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarCanchaPredio').classList.remove('oculto');
}

async function guardarCanchaPredio(e) {
  e.preventDefault();
  const errorEl = document.getElementById('canchaPredioFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('canchaPredioIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('canchaPredioNombre').value.trim(),
    tipo_techo: document.getElementById('canchaPredioTecho').value,
    tamanio: document.getElementById('canchaPredioTamanio').value.trim() || undefined,
    tipo_cancha_id: document.getElementById('canchaPredioTipo').value || undefined
  };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/predios/${predioActualId}/canchas/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch(`/liga/configuracion/predios/${predioActualId}/canchas`, { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    limpiarFormCanchaPredio();
    await cargarPredios();
    renderTablaCanchasPredio();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarCanchaPredio(canchaId) {
  if (!confirm('¿Eliminar esta cancha?')) return;
  try {
    await apiFetch(`/liga/configuracion/predios/${predioActualId}/canchas/${canchaId}`, { method: 'DELETE' });
    await cargarPredios();
    renderTablaCanchasPredio();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ----- Árbitros de la Liga -----

const NOMBRES_TIPO_ARBITRO = { arbitro: 'Árbitro', juez_linea: 'Juez de línea', ambos: 'Ambos' };

async function cargarArbitros() {
  const tbody = document.getElementById('tablaArbitros');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/configuracion/arbitros');
    arbitrosLigaCache = data.arbitros;
    tbody.innerHTML = arbitrosLigaCache.length ? arbitrosLigaCache.map((a) => `
      <tr>
        <td>${escapeHtml(a.apellido)}, ${escapeHtml(a.nombre)}</td>
        <td>${escapeHtml(a.telefono || '-')}</td>
        <td>${escapeHtml(NOMBRES_TIPO_ARBITRO[a.tipo] || a.tipo)}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarArbitro('${a.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarArbitro('${a.id}', '${escapeHtml(a.apellido)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('') : '<tr><td colspan="4">Todavía no cargaste árbitros.</td></tr>';
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function editarArbitro(id) {
  const a = arbitrosLigaCache.find((x) => x.id === id);
  if (!a) return;
  document.getElementById('arbitroIdEdicion').value = a.id;
  document.getElementById('arbitroNombre').value = a.nombre || '';
  document.getElementById('arbitroApellido').value = a.apellido || '';
  document.getElementById('arbitroTelefono').value = a.telefono || '';
  document.getElementById('arbitroTipo').value = a.tipo || 'arbitro';
  document.getElementById('arbitroFormError').classList.add('oculto');
  document.getElementById('formArbitro').classList.remove('oculto');
}

async function eliminarArbitro(id, apellido) {
  if (!confirm(`¿Eliminar al árbitro "${apellido}"?`)) return;
  try {
    await apiFetch(`/liga/configuracion/arbitros/${id}`, { method: 'DELETE' });
    cargarArbitros();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarArbitro(e) {
  e.preventDefault();
  const errorEl = document.getElementById('arbitroFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('arbitroIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('arbitroNombre').value.trim(),
    apellido: document.getElementById('arbitroApellido').value.trim(),
    telefono: document.getElementById('arbitroTelefono').value.trim() || undefined,
    tipo: document.getElementById('arbitroTipo').value
  };
  try {
    if (id) {
      await apiFetch(`/liga/configuracion/arbitros/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/configuracion/arbitros', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formArbitro').reset();
    document.getElementById('arbitroIdEdicion').value = '';
    document.getElementById('formArbitro').classList.add('oculto');
    cargarArbitros();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== FICHAJES (aprobar/rechazar) =====================

async function cargarFichajesLiga() {
  const tbody = document.getElementById('tablaFichajesLiga');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  const estado = document.getElementById('filtroEstadoFichaje').value;
  try {
    const params = estado ? `?estado=${estado}` : '';
    const data = await apiFetch(`/liga/fichajes${params}`);
    const fichajes = data.fichajes;
    if (!fichajes.length) {
      tbody.innerHTML = '<tr><td colspan="6">No hay solicitudes de fichaje en este estado.</td></tr>';
      return;
    }
    const badgesEstado = { pendiente: 'badge-pendiente', aprobado: 'badge-activo', rechazado: 'badge-inactivo' };
    tbody.innerHTML = fichajes.map((f) => `
      <tr>
        <td>${escapeHtml(f.jugador_nombre)} ${escapeHtml(f.jugador_apellido)} ${f.jugador_dni ? `(DNI ${escapeHtml(f.jugador_dni)})` : ''}</td>
        <td>${escapeHtml(f.club_nombre)}</td>
        <td>${escapeHtml(f.torneo_nombre || '-')}</td>
        <td>${escapeHtml(f.categoria_nombre || '-')}</td>
        <td><span class="badge ${badgesEstado[f.estado] || ''}">${escapeHtml(f.estado)}</span></td>
        <td>
          ${f.estado === 'pendiente' ? `
            <button class="btn btn-pequeno" onclick="aprobarFichaje('${f.id}')">Aprobar</button>
            <button class="btn btn-peligro btn-pequeno" onclick="rechazarFichaje('${f.id}')">Rechazar</button>
          ` : (f.motivo_rechazo ? `<span class="texto-ayuda">Motivo: ${escapeHtml(f.motivo_rechazo)}</span>` : '-')}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function aprobarFichaje(fichajeId) {
  try {
    await apiFetch(`/liga/fichajes/${fichajeId}/aprobar`, { method: 'PATCH' });
    cargarFichajesLiga();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rechazarFichaje(fichajeId) {
  const motivo = prompt('Motivo del rechazo (opcional):');
  if (motivo === null) return;
  try {
    await apiFetch(`/liga/fichajes/${fichajeId}/rechazar`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo_rechazo: motivo.trim() || undefined })
    });
    cargarFichajesLiga();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== CLUBES =====================

// Arma un link de WhatsApp (wa.me) a partir de un teléfono cargado en
// cualquier formato — se queda solo con los dígitos.
function linkWhatsapp(telefono) {
  const digitos = (telefono || '').replace(/\D/g, '');
  if (!digitos) return '';
  return `https://wa.me/${digitos}`;
}

function ordenarClubesPor(campo) {
  if (ordenClubesCampo === campo) {
    ordenClubesDireccion = ordenClubesDireccion === 'asc' ? 'desc' : 'asc';
  } else {
    ordenClubesCampo = campo;
    ordenClubesDireccion = 'asc';
  }
  paginaClubesActual = 1;
  cargarClubes();
}

function actualizarFlechasOrdenClubes() {
  const flechas = { nombre: 'flechaOrdenNombre', ciudad: 'flechaOrdenCiudad', provincia: 'flechaOrdenProvincia' };
  Object.entries(flechas).forEach(([campo, idEl]) => {
    const el = document.getElementById(idEl);
    if (!el) return;
    el.textContent = campo === ordenClubesCampo ? (ordenClubesDireccion === 'asc' ? '▲' : '▼') : '';
  });
}

// ----- Filtro desplegable de selección múltiple (Ciudad / Provincia) -----
// Reemplaza al <select multiple size="3"> (que ocupaba mucho lugar en
// pantalla) por un botón compacto que despliega una lista de checkboxes.
const dropdownsMultipleFiltro = {}; // { ciudad: {opciones:[], seleccion:Set}, provincia: {...} }

// `opciones` acepta un array de strings (ej: ciudades) o de objetos
// {value, label} (ej: modalidades, donde el value es el id y el label el
// nombre a mostrar).
function armarDropdownMultiple(clave, opciones) {
  const normalizadas = opciones.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  dropdownsMultipleFiltro[clave] = dropdownsMultipleFiltro[clave] || { opciones: [], seleccion: new Set() };
  dropdownsMultipleFiltro[clave].opciones = normalizadas;
  const panel = document.getElementById(`panelDropdown${capitalizar(clave)}`);
  if (!normalizadas.length) {
    panel.innerHTML = '<div class="dropdown-multi-vacio">No hay valores cargados todavía.</div>';
    return;
  }
  panel.innerHTML = normalizadas.map((op) => `
    <label class="dropdown-multi-opcion">
      <input type="checkbox" class="chk-dropdown-multi" data-clave="${clave}" value="${escapeHtml(op.value)}"
        ${dropdownsMultipleFiltro[clave].seleccion.has(op.value) ? 'checked' : ''}>
      ${escapeHtml(op.label)}
    </label>
  `).join('');
  panel.querySelectorAll('.chk-dropdown-multi').forEach((chk) => {
    chk.addEventListener('change', () => {
      if (chk.checked) dropdownsMultipleFiltro[clave].seleccion.add(chk.value);
      else dropdownsMultipleFiltro[clave].seleccion.delete(chk.value);
      actualizarContadorDropdown(clave);
      paginaClubesActual = 1;
      cargarClubes();
    });
  });
}

function capitalizar(texto) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function actualizarContadorDropdown(clave) {
  const cantidad = dropdownsMultipleFiltro[clave] ? dropdownsMultipleFiltro[clave].seleccion.size : 0;
  const badge = document.getElementById(`contador${capitalizar(clave)}`);
  badge.textContent = String(cantidad);
  badge.classList.toggle('oculto', cantidad === 0);
}

function valoresDropdown(clave) {
  return dropdownsMultipleFiltro[clave] ? [...dropdownsMultipleFiltro[clave].seleccion] : [];
}

function toggleDropdownPanel(clave) {
  const panel = document.getElementById(`panelDropdown${capitalizar(clave)}`);
  const yaAbierto = !panel.classList.contains('oculto');
  // Cerramos cualquier otro dropdown abierto antes de abrir este.
  document.querySelectorAll('.dropdown-multi-panel').forEach((p) => p.classList.add('oculto'));
  if (!yaAbierto) panel.classList.remove('oculto');
}

// Trae ciudades/provincias ya cargadas en algún club de la Liga, para poblar
// los desplegables de filtro (en vez de que el usuario tenga que escribir el
// texto exacto).
async function cargarFiltrosDisponiblesClubes() {
  try {
    const data = await apiFetch('/liga/clubes/filtros-disponibles');
    armarDropdownMultiple('ciudad', data.ciudades);
    armarDropdownMultiple('provincia', data.provincias);
  } catch (err) {
    // si falla, los filtros quedan vacíos (no bloquea el resto de la pantalla)
  }
  cargarFiltroModalidadesClubes();
}

// Trae las categorías de torneo (modalidades) configuradas en Configuración,
// para poder filtrar los Clubes por ellas (ej: "traeme solo los que juegan Senior").
async function cargarFiltroModalidadesClubes() {
  try {
    const data = await apiFetch('/liga/configuracion/modalidades');
    modalidadesLigaCache = data.modalidades;
    armarDropdownMultiple('modalidad', data.modalidades.map((m) => ({ value: m.id, label: m.nombre })));
  } catch (err) {
    // si falla, el filtro queda vacío
  }
}

async function cargarClubes() {
  const tbody = document.getElementById('tablaClubes');
  tbody.innerHTML = '<tr><td colspan="10">Cargando...</td></tr>';
  const texto = document.getElementById('buscadorClubes').value.trim();
  const ciudades = valoresDropdown('ciudad');
  const provincias = valoresDropdown('provincia');
  const modalidades = valoresDropdown('modalidad');
  const canchaTecho = document.getElementById('filtroClubesCancha').value;
  const incluirInactivos = document.getElementById('filtroClubesInactivos').checked;
  const soloReglamentaria = document.getElementById('filtroClubesReglamentaria').checked;
  actualizarFlechasOrdenClubes();
  try {
    const params = new URLSearchParams({
      pagina: paginaClubesActual,
      por_pagina: CLUBES_POR_PAGINA,
      orden_campo: ordenClubesCampo,
      orden_direccion: ordenClubesDireccion
    });
    if (texto) params.set('q', texto);
    ciudades.forEach((c) => params.append('ciudad', c));
    provincias.forEach((p) => params.append('provincia', p));
    modalidades.forEach((m) => params.append('modalidad_id', m));
    if (canchaTecho) params.set('cancha_techo', canchaTecho);
    if (incluirInactivos) params.set('incluir_inactivos', 'true');
    if (soloReglamentaria) params.set('cancha_reglamentaria', 'true');
    const data = await apiFetch(`/liga/clubes?${params.toString()}`);
    clubesCache = data.clubes;
    totalClubesActual = data.total;

    const desde = clubesCache.length ? (paginaClubesActual - 1) * CLUBES_POR_PAGINA + 1 : 0;
    const hasta = (paginaClubesActual - 1) * CLUBES_POR_PAGINA + clubesCache.length;
    const textoPaginacion = `Mostrando ${desde}-${hasta} de ${totalClubesActual} clubes`;
    const deshabilitarAnterior = paginaClubesActual <= 1;
    const deshabilitarSiguiente = paginaClubesActual * CLUBES_POR_PAGINA >= totalClubesActual;
    ['paginacionClubesInfo', 'paginacionClubesInfoTop'].forEach((id) => { document.getElementById(id).textContent = textoPaginacion; });
    ['btnClubesPaginaAnterior', 'btnClubesPaginaAnteriorTop'].forEach((id) => { document.getElementById(id).disabled = deshabilitarAnterior; });
    ['btnClubesPaginaSiguiente', 'btnClubesPaginaSiguienteTop'].forEach((id) => { document.getElementById(id).disabled = deshabilitarSiguiente; });

    renderFilasClubes();
    actualizarBarraAccionesMasivas();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function renderFilasClubes() {
  const tbody = document.getElementById('tablaClubes');
  if (!clubesCache.length) {
    tbody.innerHTML = '<tr><td colspan="10">No se encontraron clubes.</td></tr>';
    document.getElementById('chkSeleccionarTodosClubes').checked = false;
    return;
  }
  tbody.innerHTML = clubesCache.map((club) => {
    const wa = linkWhatsapp(club.telefono);
    const seleccionado = clubesSeleccionadosIds.has(club.id);
    return `
      <tr style="border-left: 4px solid ${club.color_primario || 'transparent'};">
        <td><input type="checkbox" class="chk-club-fila" data-club-id="${club.id}" ${seleccionado ? 'checked' : ''} onchange="toggleSeleccionClub('${club.id}', this.checked)"></td>
        <td>${club.logo_url ? `<img class="logo-miniatura" src="${club.logo_url}" alt="">` : '<span class="logo-miniatura"></span>'}</td>
        <td>${escapeHtml(club.nombre)}</td>
        <td>${escapeHtml(club.direccion || '-')}</td>
        <td>${escapeHtml(club.ciudad || '-')}</td>
        <td>${escapeHtml(club.provincia || '-')}</td>
        <td>
          ${club.telefono ? escapeHtml(club.telefono) : '-'}
          ${wa ? `<a class="btn-whatsapp-icono" href="${wa}" target="_blank" rel="noopener" title="Enviar WhatsApp">${ICONO_WHATSAPP}</a>` : ''}
        </td>
        <td>${club.email_contacto ? `<a href="mailto:${escapeHtml(club.email_contacto)}">${escapeHtml(club.email_contacto)}</a>` : '-'}</td>
        <td><span class="badge ${club.activo_en_liga ? 'badge-activo' : 'badge-inactivo'}">${club.activo_en_liga ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarClub('${club.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Participaciones" onclick="verParticipacionesClub('${club.id}', '${escapeHtml(club.nombre)}')">${ICONO_COPA}</button>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Usuarios" onclick="verUsuariosClub('${club.id}', '${escapeHtml(club.nombre)}')">${ICONO_PERSONA}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarClub('${club.id}', '${escapeHtml(club.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `;
  }).join('');
  document.getElementById('chkSeleccionarTodosClubes').checked = clubesCache.every((c) => clubesSeleccionadosIds.has(c.id));
}

function toggleSeleccionClub(clubId, marcado) {
  if (marcado) clubesSeleccionadosIds.add(clubId); else clubesSeleccionadosIds.delete(clubId);
  document.getElementById('chkSeleccionarTodosClubes').checked = clubesCache.every((c) => clubesSeleccionadosIds.has(c.id));
  actualizarBarraAccionesMasivas();
}

function actualizarBarraAccionesMasivas() {
  const cantidad = clubesSeleccionadosIds.size;
  const barra = document.getElementById('barraAccionesMasivasClubes');
  barra.classList.toggle('visible', cantidad > 0);
  document.getElementById('cantidadClubesSeleccionados').textContent =
    `${cantidad} club${cantidad === 1 ? '' : 'es'} seleccionado${cantidad === 1 ? '' : 's'}`;
}

// ----- Asignación masiva de clubes a una categoría/subcategoría -----

let categoriasAsignarMasivoCache = [];

async function abrirAsignarCategoriaMasivo() {
  if (!clubesSeleccionadosIds.size) return;
  document.getElementById('modalAsignarCategoriaMasivo').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('resumenClubesAsignarMasivo').textContent =
    `Vas a inscribir ${clubesSeleccionadosIds.size} club(es) seleccionado(s) en la categoría que elijas.`;
  document.getElementById('asignarMasivoError').classList.add('oculto');
  document.getElementById('asignarMasivoOk').classList.add('oculto');
  document.getElementById('masivoTorneo').innerHTML = '<option value="">Cargando...</option>';
  try {
    const data = await apiFetch('/liga/torneos');
    const torneos = data.torneos;
    if (!torneos.length) {
      document.getElementById('masivoTorneo').innerHTML = '<option value="">No hay torneos creados</option>';
      return;
    }
    document.getElementById('masivoTorneo').innerHTML = torneos.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
    await poblarCategoriasAsignarMasivo();
  } catch (err) {
    document.getElementById('masivoTorneo').innerHTML = '<option value="">Error al cargar torneos</option>';
  }
}

async function poblarCategoriasAsignarMasivo() {
  const torneoId = document.getElementById('masivoTorneo').value;
  const selectCategoria = document.getElementById('masivoCategoria');
  if (!torneoId) { selectCategoria.innerHTML = ''; return; }
  selectCategoria.innerHTML = '<option value="">Cargando...</option>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoId}/categorias`);
    categoriasAsignarMasivoCache = data.categorias;
    if (!categoriasAsignarMasivoCache.length) {
      selectCategoria.innerHTML = '<option value="">Este torneo no tiene categorías</option>';
      return;
    }
    selectCategoria.innerHTML = categoriasAsignarMasivoCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    poblarSubcategoriaAsignarMasivo();
  } catch (err) {
    selectCategoria.innerHTML = '<option value="">Error al cargar categorías</option>';
  }
}

function poblarSubcategoriaAsignarMasivo() {
  const categoriaId = document.getElementById('masivoCategoria').value;
  const categoria = categoriasAsignarMasivoCache.find((c) => c.id === categoriaId);
  const grupo = document.getElementById('grupoMasivoSubcategoria');
  const select = document.getElementById('masivoSubcategoria');
  if (categoria && categoria.subcategorias && categoria.subcategorias.length) {
    grupo.classList.remove('oculto');
    select.innerHTML = categoria.subcategorias.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('');
  } else {
    grupo.classList.add('oculto');
    select.innerHTML = '';
  }
}

async function confirmarAsignarCategoriaMasivo() {
  const errorEl = document.getElementById('asignarMasivoError');
  const okEl = document.getElementById('asignarMasivoOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const torneoId = document.getElementById('masivoTorneo').value;
  const categoriaId = document.getElementById('masivoCategoria').value;
  const subcategoriaSelect = document.getElementById('masivoSubcategoria');
  const tieneSubcategorias = !document.getElementById('grupoMasivoSubcategoria').classList.contains('oculto');
  if (!torneoId || !categoriaId) {
    errorEl.textContent = 'Elegí un torneo y una categoría.';
    errorEl.classList.remove('oculto');
    return;
  }
  if (tieneSubcategorias && !subcategoriaSelect.value) {
    errorEl.textContent = 'Esta categoría tiene subcategorías: elegí una.';
    errorEl.classList.remove('oculto');
    return;
  }
  try {
    const data = await apiFetch('/liga/clubes/inscribir-multiple', {
      method: 'POST',
      body: JSON.stringify({
        club_ids: [...clubesSeleccionadosIds],
        torneo_id: torneoId,
        categoria_id: categoriaId,
        subcategoria_id: tieneSubcategorias ? subcategoriaSelect.value : undefined
      })
    });
    const fallidos = data.resultados.filter((r) => !r.ok);
    okEl.textContent = `Se inscribieron ${data.agregados} de ${data.resultados.length} club(es).` +
      (fallidos.length ? ` No se pudieron inscribir ${fallidos.length} (ya estaban inscriptos o no pertenecen a tu Liga).` : '');
    okEl.classList.remove('oculto');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarClub(clubId, nombreClub) {
  if (!confirm(`¿Eliminar a "${nombreClub}" de tu Liga? Se borran también sus inscripciones a categorías (equipos, partidos y tabla de esta Liga). El club NO se borra de otras Ligas en las que participe.`)) {
    return;
  }
  try {
    await apiFetch(`/liga/clubes/${clubId}`, { method: 'DELETE' });
    cargarClubes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function descargarPlantillaClubes() {
  try {
    const res = await fetch('/liga/clubes/plantilla', { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!res.ok) throw new Error('No se pudo descargar la plantilla');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-clubes.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function subirCargaMasivaClubes(e) {
  e.preventDefault();
  const errorEl = document.getElementById('cargaMasivaError');
  const resultadoEl = document.getElementById('cargaMasivaResultado');
  errorEl.classList.add('oculto');
  resultadoEl.innerHTML = '';

  const archivo = document.getElementById('cargaMasivaArchivo').files[0];
  if (!archivo) {
    errorEl.textContent = 'Elegí primero el archivo de la plantilla completada.';
    errorEl.classList.remove('oculto');
    return;
  }

  const formData = new FormData();
  formData.append('archivo', archivo);

  try {
    const res = await fetch('/liga/clubes/carga-masiva', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + getToken() },
      body: formData
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || 'Error al subir la plantilla');

    let html = `<p class="mensaje-ok">Se crearon ${data.creados} clubes.</p>`;
    if (data.omitidos && data.omitidos.length) {
      html += `<p class="texto-ayuda">Filas omitidas:</p><ul>` +
        data.omitidos.map((o) => `<li>Fila ${o.fila}${o.nombre ? ` (${escapeHtml(o.nombre)})` : ''}: ${escapeHtml(o.motivo)}</li>`).join('') +
        `</ul>`;
    }
    resultadoEl.innerHTML = html;
    document.getElementById('cargaMasivaArchivo').value = '';
    paginaClubesActual = 1;
    cargarClubes();
    cargarFiltrosDisponiblesClubes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

function onElegirLogoClub(e) {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    clubLogoBase64Actual = lector.result;
    const preview = document.getElementById('clubLogoPreview');
    preview.src = clubLogoBase64Actual;
    preview.classList.remove('oculto');
    document.getElementById('clubLogoUrl').value = clubLogoBase64Actual;
  };
  lector.readAsDataURL(archivo);
}

function limpiarFormClub() {
  poblarSelectTipoCancha();
  document.getElementById('clubIdEdicion').value = '';
  document.getElementById('clubNombre').value = '';
  document.getElementById('clubDireccion').value = '';
  document.getElementById('clubCiudad').value = '';
  document.getElementById('clubProvincia').value = '';
  document.getElementById('clubTelefono').value = '';
  document.getElementById('clubEmail').value = '';
  document.getElementById('clubLogoUrl').value = '';
  document.getElementById('clubLogoArchivo').value = '';
  document.getElementById('clubLogoPreview').classList.add('oculto');
  clubLogoBase64Actual = '';
  document.getElementById('clubColorPrimario').value = '#1d4ed8';
  document.getElementById('clubColorPrimarioHex').textContent = '#1d4ed8';
  document.getElementById('clubColorSecundario').value = '#1e3a8a';
  document.getElementById('clubColorSecundarioHex').textContent = '#1e3a8a';
  document.getElementById('clubCanchaDireccion').value = '';
  document.getElementById('clubCanchaTecho').value = 'aire_libre';
  document.getElementById('clubCanchaTamanio').value = '';
  document.getElementById('clubCanchaTipo').value = '';
  document.getElementById('clubCanchaReglamentaria').checked = false;
  document.getElementById('clubCanchaTamanio').disabled = false;
  document.getElementById('clubFormError').classList.add('oculto');
  document.getElementById('btnGestionarCanchas').classList.add('oculto');
  document.getElementById('panelCanchasClub').classList.add('oculto');
  document.getElementById('bloqueEstadoClub').classList.add('oculto');
  document.getElementById('bloqueModalidadesClub').classList.add('oculto');
  document.getElementById('listaModalidadesClub').innerHTML = '';
  document.getElementById('btnAbrirDocumentosDesdeForm').classList.add('oculto');
  document.getElementById('btnAbrirComentariosDesdeForm').classList.add('oculto');
}

async function editarClub(clubId) {
  const club = clubesCache.find((c) => c.id === clubId);
  if (!club) return;
  await poblarSelectTipoCancha();
  document.getElementById('clubIdEdicion').value = club.id;
  document.getElementById('clubNombre').value = club.nombre || '';
  document.getElementById('clubDireccion').value = club.direccion || '';
  document.getElementById('clubCiudad').value = club.ciudad || '';
  document.getElementById('clubProvincia').value = club.provincia || '';
  document.getElementById('clubTelefono').value = club.telefono || '';
  document.getElementById('clubEmail').value = club.email_contacto || '';
  document.getElementById('clubLogoUrl').value = club.logo_url || '';
  clubLogoBase64Actual = club.logo_url || '';
  const preview = document.getElementById('clubLogoPreview');
  if (club.logo_url) {
    preview.src = club.logo_url;
    preview.classList.remove('oculto');
  } else {
    preview.classList.add('oculto');
  }
  document.getElementById('clubLogoArchivo').value = '';
  document.getElementById('clubColorPrimario').value = club.color_primario || '#1d4ed8';
  document.getElementById('clubColorPrimarioHex').textContent = club.color_primario || '#1d4ed8';
  document.getElementById('clubColorSecundario').value = club.color_secundario || '#1e3a8a';
  document.getElementById('clubColorSecundarioHex').textContent = club.color_secundario || '#1e3a8a';
  document.getElementById('clubCanchaDireccion').value = club.cancha_direccion || '';
  document.getElementById('clubCanchaTecho').value = club.cancha_tipo_techo || 'aire_libre';
  document.getElementById('clubCanchaTamanio').value = club.cancha_tamanio || '';
  document.getElementById('clubCanchaTipo').value = club.cancha_tipo_cancha_id || '';
  document.getElementById('clubCanchaReglamentaria').checked = !!club.cancha_reglamentaria;
  document.getElementById('clubCanchaTamanio').disabled = !!club.cancha_reglamentaria;
  document.getElementById('clubFormError').classList.add('oculto');
  document.getElementById('formClub').classList.remove('oculto');
  document.getElementById('btnGestionarCanchas').classList.remove('oculto');
  document.getElementById('panelCanchasClub').classList.add('oculto');
  document.getElementById('bloqueEstadoClub').classList.remove('oculto');
  document.getElementById('clubActivoEnLiga').checked = !!club.activo_en_liga;
  document.getElementById('btnAbrirDocumentosDesdeForm').classList.remove('oculto');
  document.getElementById('btnAbrirComentariosDesdeForm').classList.remove('oculto');
  document.getElementById('bloqueModalidadesClub').classList.remove('oculto');
  cargarModalidadesDeClub(club.id);
  mostrarFondoModal();
}

// Trae las categorías de torneo de la Liga (modalidades) marcando en cuáles
// participa este club, y pinta los checkboxes dentro del popup de edición.
async function cargarModalidadesDeClub(clubId) {
  const cont = document.getElementById('listaModalidadesClub');
  cont.innerHTML = '<span class="texto-ayuda">Cargando...</span>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubId}/modalidades`);
    if (!data.modalidades.length) {
      cont.innerHTML = '<span class="texto-ayuda">Todavía no configuraste categorías de torneo en tu Liga (Configuración → Categorías de torneo).</span>';
      return;
    }
    cont.innerHTML = data.modalidades.map((m) => `
      <label class="check-inline">
        <input type="checkbox" class="chk-modalidad-club" value="${m.id}" ${m.anotado ? 'checked' : ''}>
        ${escapeHtml(m.nombre)}${m.precio != null ? ` ($${Number(m.precio).toLocaleString('es-AR')})` : ''}
      </label>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<span class="mensaje-error">Error: ${escapeHtml(err.message)}</span>`;
  }
}

async function guardarModalidadesDeClub(clubId) {
  const seleccionadas = Array.from(document.querySelectorAll('.chk-modalidad-club:checked')).map((el) => el.value);
  try {
    await apiFetch(`/liga/clubes/${clubId}/modalidades`, {
      method: 'PUT',
      body: JSON.stringify({ modalidad_ids: seleccionadas })
    });
  } catch (err) {
    alert('El club se guardó, pero hubo un error al guardar sus categorías de torneo: ' + err.message);
  }
}

async function guardarClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('clubFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('clubIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('clubNombre').value.trim(),
    direccion: document.getElementById('clubDireccion').value.trim() || undefined,
    ciudad: document.getElementById('clubCiudad').value.trim() || undefined,
    provincia: document.getElementById('clubProvincia').value.trim() || undefined,
    telefono: document.getElementById('clubTelefono').value.trim() || undefined,
    email_contacto: document.getElementById('clubEmail').value.trim() || undefined,
    logo_url: document.getElementById('clubLogoUrl').value || undefined,
    color_primario: document.getElementById('clubColorPrimario').value,
    color_secundario: document.getElementById('clubColorSecundario').value,
    cancha_tipo_techo: document.getElementById('clubCanchaTecho').value,
    cancha_tamanio: document.getElementById('clubCanchaTamanio').value.trim() || undefined,
    cancha_tipo_cancha_id: document.getElementById('clubCanchaTipo').value || undefined,
    cancha_reglamentaria: document.getElementById('clubCanchaReglamentaria').checked,
    cancha_direccion: document.getElementById('clubCanchaDireccion').value.trim() || undefined
  };

  try {
    if (id) {
      await apiFetch(`/liga/clubes/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
      await guardarModalidadesDeClub(id);
    } else {
      await apiFetch('/liga/clubes', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formClub').classList.add('oculto');
    ocultarFondoModal();
    cargarClubes();
    cargarFiltrosDisponiblesClubes();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function toggleActivoClub(clubId, nuevoValor, sinRecargarLista) {
  try {
    await apiFetch(`/liga/clubes/${clubId}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: nuevoValor })
    });
    const club = clubesCache.find((c) => c.id === clubId);
    if (club) club.activo_en_liga = nuevoValor;
    if (!sinRecargarLista) cargarClubes();
  } catch (err) {
    alert('Error: ' + err.message);
    document.getElementById('clubActivoEnLiga').checked = !nuevoValor;
  }
}

function verUsuariosClub(clubId, nombreClub) {
  document.getElementById('panelUsuariosClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloUsuariosClub').textContent = `Usuarios de "${nombreClub}"`;
  document.getElementById('usuarioClubId').value = clubId;
  document.getElementById('usuarioClubFormError').classList.add('oculto');
  document.getElementById('usuarioClubFormOk').classList.add('oculto');
  document.getElementById('formUsuarioClub').reset();
  document.getElementById('usuarioClubId').value = clubId;
  cargarUsuariosClub(clubId);
}

async function cargarUsuariosClub(clubId) {
  const tbody = document.getElementById('tablaUsuariosClub');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubId}/usuarios`);
    if (!data.usuarios.length) {
      tbody.innerHTML = '<tr><td colspan="4">Este club todavía no tiene usuarios.</td></tr>';
      return;
    }
    tbody.innerHTML = data.usuarios.map((u) => `
      <tr>
        <td>${escapeHtml(u.nombre)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.activo ? 'badge-activo' : 'badge-inactivo'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
        <td>
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="editarUsuarioClub('${clubId}', '${u.id}', '${escapeHtml(u.nombre)}', '${escapeHtml(u.email)}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-secundario btn-pequeno" onclick="cambiarPasswordUsuarioClub('${clubId}', '${u.id}')">Cambiar contraseña</button>
          <button class="btn ${u.activo ? 'btn-peligro' : ''} btn-pequeno" onclick="toggleActivoUsuarioClub('${clubId}', '${u.id}', ${!u.activo})">${u.activo ? 'Desactivar' : 'Activar'}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="eliminarUsuarioClub('${clubId}', '${u.id}', '${escapeHtml(u.nombre)}')">${ICONO_BASURA}</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function editarUsuarioClub(clubId, usuarioId, nombreActual, emailActual) {
  const nombre = prompt('Nombre:', nombreActual);
  if (nombre === null) return;
  const email = prompt('Email:', emailActual);
  if (email === null) return;
  try {
    await apiFetch(`/liga/clubes/${clubId}/usuarios/${usuarioId}`, {
      method: 'PUT',
      body: JSON.stringify({ nombre: nombre.trim(), email: email.trim() })
    });
    cargarUsuariosClub(clubId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function cambiarPasswordUsuarioClub(clubId, usuarioId) {
  const password = prompt('Nueva contraseña (mínimo 4 caracteres):');
  if (password === null) return;
  try {
    await apiFetch(`/liga/clubes/${clubId}/usuarios/${usuarioId}/password`, {
      method: 'PATCH',
      body: JSON.stringify({ password })
    });
    alert('Contraseña actualizada.');
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function toggleActivoUsuarioClub(clubId, usuarioId, nuevoValor) {
  try {
    await apiFetch(`/liga/clubes/${clubId}/usuarios/${usuarioId}/activo`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: nuevoValor })
    });
    cargarUsuariosClub(clubId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function eliminarUsuarioClub(clubId, usuarioId, nombre) {
  if (!confirm(`¿Eliminar definitivamente al usuario "${nombre}"?`)) return;
  try {
    await apiFetch(`/liga/clubes/${clubId}/usuarios/${usuarioId}`, { method: 'DELETE' });
    cargarUsuariosClub(clubId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function crearUsuarioClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('usuarioClubFormError');
  const okEl = document.getElementById('usuarioClubFormOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const clubId = document.getElementById('usuarioClubId').value;
  const cuerpo = {
    nombre: document.getElementById('ucNombre').value.trim(),
    email: document.getElementById('ucEmail').value.trim(),
    password: document.getElementById('ucPassword').value
  };

  try {
    await apiFetch(`/liga/clubes/${clubId}/usuarios`, { method: 'POST', body: JSON.stringify(cuerpo) });
    okEl.textContent = 'Usuario creado correctamente.';
    okEl.classList.remove('oculto');
    document.getElementById('formUsuarioClub').reset();
    document.getElementById('usuarioClubId').value = clubId;
    cargarUsuariosClub(clubId);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Documentos del club (los puede subir la Liga o el propio Club) -----

let clubIdDocumentosActual = null;
let documentoArchivoBase64Actual = '';

function abrirDocumentosClub(clubId, nombreClub) {
  clubIdDocumentosActual = clubId;
  document.getElementById('panelDocumentosClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloDocumentosClub').textContent = `Documentos de "${nombreClub}"`;
  document.getElementById('formDocumentoClub').reset();
  document.getElementById('documentoFormError').classList.add('oculto');
  documentoArchivoBase64Actual = '';
  cargarDocumentosClub();
}

async function cargarDocumentosClub() {
  const tbody = document.getElementById('tablaDocumentosClub');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubIdDocumentosActual}/documentos`);
    const documentos = data.documentos;
    if (!documentos.length) {
      tbody.innerHTML = '<tr><td colspan="4">Este club todavía no tiene documentos cargados.</td></tr>';
      return;
    }
    tbody.innerHTML = documentos.map((d) => `
      <tr>
        <td><a href="${d.archivo_url}" download="${escapeHtml(d.nombre)}" target="_blank">${escapeHtml(d.nombre)}</a></td>
        <td>${d.subido_por_rol === 'club' ? 'El Club' : 'La Liga'}</td>
        <td>${new Date(d.creado_at).toLocaleDateString('es-AR')}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="eliminarDocumentoClub('${d.id}')">Eliminar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function subirDocumentoClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('documentoFormError');
  errorEl.classList.add('oculto');

  const nombre = document.getElementById('documentoNombre').value.trim();
  const archivo = document.getElementById('documentoArchivo').files[0];
  if (!archivo) {
    errorEl.textContent = 'Elegí un archivo.';
    errorEl.classList.remove('oculto');
    return;
  }

  const lector = new FileReader();
  lector.onload = async () => {
    try {
      await apiFetch(`/liga/clubes/${clubIdDocumentosActual}/documentos`, {
        method: 'POST',
        body: JSON.stringify({ nombre, archivo_url: lector.result })
      });
      document.getElementById('formDocumentoClub').reset();
      cargarDocumentosClub();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('oculto');
    }
  };
  lector.readAsDataURL(archivo);
}

async function eliminarDocumentoClub(documentoId) {
  if (!confirm('¿Eliminar este documento?')) return;
  try {
    await apiFetch(`/liga/clubes/${clubIdDocumentosActual}/documentos/${documentoId}`, { method: 'DELETE' });
    cargarDocumentosClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ----- Notas internas de la Liga sobre el club (el Club nunca las ve) -----

let clubIdComentariosActual = null;

function abrirComentariosClub(clubId, nombreClub) {
  clubIdComentariosActual = clubId;
  document.getElementById('panelComentariosClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloComentariosClub').textContent = `Notas internas de "${nombreClub}"`;
  document.getElementById('formComentarioClub').reset();
  document.getElementById('comentarioFormError').classList.add('oculto');
  cargarComentariosClub();
}

async function cargarComentariosClub() {
  const cont = document.getElementById('listaComentariosClub');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubIdComentariosActual}/comentarios`);
    const comentarios = data.comentarios;
    if (!comentarios.length) {
      cont.innerHTML = '<p class="texto-ayuda">Todavía no hay notas para este club.</p>';
      return;
    }
    cont.innerHTML = comentarios.map((c) => `
      <div style="border-bottom:1px solid var(--gris-100); padding:8px 0;">
        <p style="margin:0; font-size:13px;">${escapeHtml(c.comentario)}</p>
        <p class="texto-ayuda" style="margin:2px 0 0;">
          ${escapeHtml(c.autor_nombre || 'Liga')} — ${new Date(c.creado_at).toLocaleString('es-AR')}
          <button class="btn btn-peligro btn-pequeno" style="margin-left:8px;" onclick="eliminarComentarioClub('${c.id}')">Eliminar</button>
        </p>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function agregarComentarioClub(e) {
  e.preventDefault();
  const errorEl = document.getElementById('comentarioFormError');
  errorEl.classList.add('oculto');
  const comentario = document.getElementById('comentarioTexto').value.trim();
  try {
    await apiFetch(`/liga/clubes/${clubIdComentariosActual}/comentarios`, {
      method: 'POST',
      body: JSON.stringify({ comentario })
    });
    document.getElementById('formComentarioClub').reset();
    cargarComentariosClub();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarComentarioClub(comentarioId) {
  if (!confirm('¿Eliminar esta nota?')) return;
  try {
    await apiFetch(`/liga/clubes/${clubIdComentariosActual}/comentarios/${comentarioId}`, { method: 'DELETE' });
    cargarComentariosClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

let clubIdParticipacionesActual = null;

async function verParticipacionesClub(clubId, nombreClub) {
  clubIdParticipacionesActual = clubId;
  document.getElementById('modalParticipacionesClub').classList.remove('oculto');
  mostrarFondoModal();
  document.getElementById('tituloParticipacionesClub').textContent = `Participaciones de "${nombreClub}"`;
  document.getElementById('participacionesError').classList.add('oculto');
  document.getElementById('participacionesOk').classList.add('oculto');
  const cont = document.getElementById('listaParticipacionesTorneos');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubId}/participaciones-editor`);
    const torneos = data.torneos;
    if (!torneos.length) {
      cont.innerHTML = '<p class="texto-ayuda">Todavía no hay torneos creados en tu Liga.</p>';
      return;
    }
    // Para categorías CON subcategorías, la inscripción es a nivel
    // subcategoría (el club no puede quedar en la categoría "pelada"): se
    // muestra un checkbox por subcategoría en vez de uno por categoría.
    cont.innerHTML = torneos.map((t) => `
      <div class="panel" style="margin-bottom:10px; box-shadow:none; border:1px solid var(--gris-300);">
        <label style="display:flex; align-items:center; gap:8px; font-weight:600; cursor:pointer;">
          <input type="checkbox" class="chk-torneo-participacion" data-torneo-id="${t.id}"
            ${t.categorias.some((c) => c.inscripta || c.subcategorias.some((s) => s.inscripta)) ? 'checked' : ''}
            ${!t.categorias.length ? 'disabled' : ''}>
          ${escapeHtml(t.nombre)} <span class="texto-ayuda" style="margin:0;">(${escapeHtml(t.deporte)})</span>
        </label>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px; margin-left:24px;">
          ${t.categorias.length ? t.categorias.map((c) => {
            if (c.subcategorias.length) {
              return `
                <div>
                  <span style="font-size:13px; font-weight:600;">${escapeHtml(c.nombre)}</span>
                  <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:4px; margin-left:14px;">
                    ${c.subcategorias.map((s) => `
                      <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:400;">
                        <input type="checkbox" class="chk-categoria-participacion" data-torneo-id="${t.id}"
                          data-categoria-id="${c.id}" data-subcategoria-id="${s.id}" ${s.inscripta ? 'checked' : ''}>
                        ${escapeHtml(s.nombre)}
                      </label>
                    `).join('')}
                  </div>
                </div>
              `;
            }
            return `
              <label style="display:flex; align-items:center; gap:6px; font-size:13px; font-weight:400;">
                <input type="checkbox" class="chk-categoria-participacion" data-torneo-id="${t.id}"
                  data-categoria-id="${c.id}" ${c.inscripta ? 'checked' : ''}>
                ${escapeHtml(c.nombre)}
              </label>
            `;
          }).join('') : '<span class="texto-ayuda">Este torneo todavía no tiene categorías.</span>'}
        </div>
      </div>
    `).join('');

    // Tildar/destildar el torneo marca (o desmarca) todas sus categorías por defecto.
    cont.querySelectorAll('.chk-torneo-participacion').forEach((chkTorneo) => {
      chkTorneo.addEventListener('change', () => {
        const torneoId = chkTorneo.dataset.torneoId;
        cont.querySelectorAll(`.chk-categoria-participacion[data-torneo-id="${torneoId}"]`).forEach((chkCat) => {
          chkCat.checked = chkTorneo.checked;
        });
      });
    });
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function guardarParticipaciones() {
  const errorEl = document.getElementById('participacionesError');
  const okEl = document.getElementById('participacionesOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');
  if (!clubIdParticipacionesActual) return;

  const selecciones = Array.from(
    document.querySelectorAll('#listaParticipacionesTorneos .chk-categoria-participacion:checked')
  ).map((el) => ({
    categoria_id: el.dataset.categoriaId,
    subcategoria_id: el.dataset.subcategoriaId || null
  }));

  try {
    const data = await apiFetch(`/liga/clubes/${clubIdParticipacionesActual}/participaciones`, {
      method: 'PUT',
      body: JSON.stringify({ selecciones })
    });
    okEl.textContent = `Guardado: ${data.agregadas} agregada(s), ${data.quitadas} quitada(s).`;
    okEl.classList.remove('oculto');
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Canchas del club -----

let clubIdCanchasActual = null;

async function abrirCanchasClub(clubId) {
  clubIdCanchasActual = clubId;
  document.getElementById('formClub').classList.add('oculto');
  document.getElementById('panelCanchasClub').classList.remove('oculto');
  limpiarFormCanchaSecundaria();
  await cargarCanchasClub();
}

async function cargarCanchasClub() {
  const tbody = document.getElementById('tablaCanchasClub');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas`);
    const canchas = data.canchas;
    if (!canchas.length) {
      tbody.innerHTML = '<tr><td colspan="6">Este club todavía no tiene canchas cargadas.</td></tr>';
      return;
    }
    tbody.innerHTML = canchas.map((c) => `
      <tr>
        <td>${escapeHtml(c.nombre || '-')}${c.es_principal ? ' <span class="badge badge-activo">Principal</span>' : ''}</td>
        <td>${escapeHtml(c.direccion || '-')}</td>
        <td>${c.tipo_techo === 'techada' ? 'Techada' : 'Aire libre'}</td>
        <td>${escapeHtml(c.tamanio || '-')}</td>
        <td>${escapeHtml(c.tipo_cancha_nombre || '-')}</td>
        <td>
          <button class="btn btn-secundario btn-pequeno" onclick="editarCanchaSecundaria('${c.id}')">Editar</button>
          ${!c.es_principal ? `<button class="btn btn-peligro btn-pequeno" onclick="eliminarCanchaSecundaria('${c.id}')">Eliminar</button>` : ''}
        </td>
      </tr>
    `).join('');
    window.canchasClubCache = canchas;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function limpiarFormCanchaSecundaria() {
  poblarSelectTipoCancha();
  document.getElementById('canchaIdEdicion').value = '';
  document.getElementById('canchaNombre').value = '';
  document.getElementById('canchaDireccion').value = '';
  document.getElementById('canchaTecho').value = 'aire_libre';
  document.getElementById('canchaTamanio').value = '';
  document.getElementById('canchaTipo').value = '';
  document.getElementById('canchaFormError').classList.add('oculto');
  document.getElementById('btnGuardarCanchaSecundaria').textContent = 'Agregar cancha';
  document.getElementById('btnCancelarCanchaSecundaria').classList.add('oculto');
}

async function editarCanchaSecundaria(canchaId) {
  const cancha = (window.canchasClubCache || []).find((c) => c.id === canchaId);
  if (!cancha) return;
  await poblarSelectTipoCancha();
  document.getElementById('canchaIdEdicion').value = cancha.id;
  document.getElementById('canchaNombre').value = cancha.nombre || '';
  document.getElementById('canchaDireccion').value = cancha.direccion || '';
  document.getElementById('canchaTecho').value = cancha.tipo_techo || 'aire_libre';
  document.getElementById('canchaTamanio').value = cancha.tamanio || '';
  document.getElementById('canchaTipo').value = cancha.tipo_cancha_id || '';
  document.getElementById('btnGuardarCanchaSecundaria').textContent = 'Guardar cambios';
  document.getElementById('btnCancelarCanchaSecundaria').classList.remove('oculto');
}

async function guardarCanchaSecundaria(e) {
  e.preventDefault();
  const errorEl = document.getElementById('canchaFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('canchaIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('canchaNombre').value.trim(),
    direccion: document.getElementById('canchaDireccion').value.trim() || undefined,
    tipo_techo: document.getElementById('canchaTecho').value,
    tamanio: document.getElementById('canchaTamanio').value.trim() || undefined,
    tipo_cancha_id: document.getElementById('canchaTipo').value || undefined
  };

  try {
    if (id) {
      await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas`, { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    limpiarFormCanchaSecundaria();
    await cargarCanchasClub();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarCanchaSecundaria(canchaId) {
  if (!confirm('¿Eliminar esta cancha?')) return;
  try {
    await apiFetch(`/liga/clubes/${clubIdCanchasActual}/canchas/${canchaId}`, { method: 'DELETE' });
    await cargarCanchasClub();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== POSTULACIONES DE CLUBES =====================

// El QR se genera en tamaño grande (640x640) directamente, aunque nunca se
// muestre en pantalla (el contenedor queda oculto con display:none) — así la
// descarga sale nítida y no hace falta agrandar un canvas chico.
function pintarLinkYQrPostulacion() {
  if (!ligaSlugActual) return;
  const url = `${window.location.origin}/sitio/postulacion.html?slug=${ligaSlugActual}`;
  document.getElementById('linkPostulacionPublica').value = url;
  const contenedor = document.getElementById('qrPostulacionContenedor');
  contenedor.innerHTML = '';
  if (window.QRCode) {
    // eslint-disable-next-line no-new
    new QRCode(contenedor, { text: url, width: 640, height: 640 });
  }
}

async function compartirLinkPostulacion() {
  const url = document.getElementById('linkPostulacionPublica').value;
  if (!url) return;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Postulate como Club', url });
    } catch (err) {
      // el usuario canceló el share nativo, no hacemos nada
    }
  } else if (navigator.clipboard) {
    await navigator.clipboard.writeText(url);
    alert('Link copiado al portapapeles.');
  }
}

function descargarQrPostulacion() {
  const contenedor = document.getElementById('qrPostulacionContenedor');
  const canvas = contenedor.querySelector('canvas');
  const img = contenedor.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `qr-postulacion-${ligaSlugActual || 'liga'}.png`;
  link.click();
}

async function cargarPostulaciones() {
  const tbody = document.getElementById('tablaPostulaciones');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  const estado = document.getElementById('filtroEstadoPostulacion').value;
  try {
    const params = estado ? `?estado=${estado}` : '';
    const data = await apiFetch(`/liga/postulaciones${params}`);
    const postulaciones = data.postulaciones;
    if (!postulaciones.length) {
      tbody.innerHTML = '<tr><td colspan="6">No hay postulaciones en este estado.</td></tr>';
      return;
    }
    const badgesEstado = { pendiente: 'badge-pendiente', aceptada: 'badge-activo', rechazada: 'badge-inactivo' };
    tbody.innerHTML = postulaciones.map((p) => `
      <tr>
        <td>${p.logo_url ? `<img class="logo-miniatura" src="${p.logo_url}" alt="">` : '<span class="logo-miniatura"></span>'}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.ciudad || '-')}${p.provincia ? ` (${escapeHtml(p.provincia)})` : ''}</td>
        <td>${escapeHtml(p.telefono || '-')}<br>${escapeHtml(p.email_contacto || '-')}</td>
        <td><span class="badge ${badgesEstado[p.estado] || ''}">${escapeHtml(p.estado)}</span></td>
        <td>
          ${p.estado === 'pendiente' ? `
            <button class="btn btn-pequeno" onclick="aceptarPostulacion('${p.id}')">Aceptar</button>
            <button class="btn btn-peligro btn-pequeno" onclick="rechazarPostulacion('${p.id}')">Rechazar</button>
          ` : (p.motivo_rechazo ? `<span class="texto-ayuda">Motivo: ${escapeHtml(p.motivo_rechazo)}</span>` : '-')}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
  actualizarBadgePostulacionesPendientes();
}

// Cuenta cuántas postulaciones están pendientes y pinta (o esconde) el
// globito rojo en la pestaña "Postulaciones", se vea o no esa sección ahora.
async function actualizarBadgePostulacionesPendientes() {
  try {
    const data = await apiFetch('/liga/postulaciones?estado=pendiente');
    const cantidad = data.postulaciones.length;
    const badge = document.getElementById('badgePostulacionesPendientes');
    badge.textContent = cantidad > 99 ? '99+' : String(cantidad);
    badge.classList.toggle('oculto', cantidad === 0);
  } catch (err) {
    // si falla, dejamos el badge como estaba
  }
}

async function aceptarPostulacion(id) {
  if (!confirm('¿Aceptar esta postulación? Se va a crear el club y quedará anotado en tu Liga.')) return;
  try {
    await apiFetch(`/liga/postulaciones/${id}/aceptar`, { method: 'PATCH' });
    cargarPostulaciones();
    paginaClubesActual = 1;
    cargarClubes();
    cargarFiltrosDisponiblesClubes();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function rechazarPostulacion(id) {
  const motivo = prompt('Motivo del rechazo (opcional):');
  if (motivo === null) return;
  try {
    await apiFetch(`/liga/postulaciones/${id}/rechazar`, {
      method: 'PATCH',
      body: JSON.stringify({ motivo_rechazo: motivo.trim() || undefined })
    });
    cargarPostulaciones();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== TORNEOS =====================

const NOMBRES_FORMATO_TORNEO = {
  todos_contra_todos: 'Todos contra todos',
  grupos_playoffs: 'Grupos + playoffs',
  liguilla_ida_vuelta: 'Liguilla ida y vuelta',
  eliminacion_directa: 'Eliminación directa',
  apertura_clausura: 'Apertura y Clausura'
};

async function cargarTorneos() {
  const cont = document.getElementById('gridTorneos');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch('/liga/torneos');
    torneosCache = data.torneos;
    renderTorneos();
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function renderTorneos() {
  const cont = document.getElementById('gridTorneos');
  const texto = (document.getElementById('buscadorTorneos').value || '').trim().toLowerCase();
  const lista = !texto
    ? torneosCache
    : torneosCache.filter((t) =>
        (t.nombre || '').toLowerCase().includes(texto) || (t.deporte || '').toLowerCase().includes(texto)
      );

  if (!torneosCache.length) {
    cont.innerHTML = '<p class="texto-ayuda">Todavía no cargaste ningún torneo.</p>';
    return;
  }
  if (!lista.length) {
    cont.innerHTML = '<p class="texto-ayuda">No se encontraron torneos.</p>';
    return;
  }
  cont.innerHTML = lista.map((t) => `
    <div class="boton-grande" onclick="verCategorias('${t.id}', '${escapeHtml(t.nombre)}')">
      <div class="acciones-boton-grande">
        <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="event.stopPropagation(); editarTorneo('${t.id}')">${ICONO_LAPIZ}</button>
        <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="event.stopPropagation(); eliminarTorneo('${t.id}', '${escapeHtml(t.nombre)}')">${ICONO_BASURA}</button>
      </div>
      <h3>${escapeHtml(t.nombre)}</h3>
      <p>${escapeHtml(t.deporte)} · ${escapeHtml(NOMBRES_FORMATO_TORNEO[t.formato_juego] || t.formato_juego || '-')}</p>
      <p><span class="badge badge-activo">${escapeHtml(t.estado || 'planificado')}</span></p>
    </div>
  `).join('');
}

async function eliminarTorneo(torneoId, nombreTorneo) {
  if (!confirm(`¿Eliminar definitivamente el torneo "${nombreTorneo}"? Se borran también sus categorías, equipos inscriptos, fixture y estadísticas.`)) {
    return;
  }
  try {
    await apiFetch(`/liga/torneos/${torneoId}`, { method: 'DELETE' });
    cargarTorneos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function editarTorneo(torneoId) {
  const torneo = torneosCache.find((t) => t.id === torneoId);
  if (!torneo) return;
  document.getElementById('torneoIdEdicion').value = torneo.id;
  document.getElementById('torneoNombre').value = torneo.nombre || '';
  document.getElementById('torneoDeporte').value = torneo.deporte || 'futbol';
  document.getElementById('torneoTemporada').value = torneo.temporada || '';
  document.getElementById('torneoFormato').value = torneo.formato_juego || 'todos_contra_todos';
  const sp = torneo.sistema_puntaje || {};
  document.getElementById('torneoPtsVictoria').value = sp.victoria != null ? sp.victoria : 3;
  document.getElementById('torneoPtsEmpate').value = sp.empate != null ? sp.empate : 1;
  document.getElementById('torneoPtsDerrota').value = sp.derrota != null ? sp.derrota : 0;
  document.getElementById('torneoFechaInicio').value = torneo.fecha_inicio ? String(torneo.fecha_inicio).slice(0, 10) : '';
  document.getElementById('torneoCanchaJuego').value = torneo.cancha_juego || 'clubes';
  document.getElementById('torneoFormError').classList.add('oculto');
  document.getElementById('formTorneo').classList.remove('oculto');
  mostrarFondoModal();
}

async function guardarTorneo(e) {
  e.preventDefault();
  const errorEl = document.getElementById('torneoFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('torneoIdEdicion').value;
  const ptsVictoria = Number(document.getElementById('torneoPtsVictoria').value || 3);
  const ptsEmpate = Number(document.getElementById('torneoPtsEmpate').value || 0);
  const ptsDerrota = Number(document.getElementById('torneoPtsDerrota').value || 0);

  const cuerpo = {
    nombre: document.getElementById('torneoNombre').value.trim(),
    deporte: document.getElementById('torneoDeporte').value,
    temporada: document.getElementById('torneoTemporada').value.trim() || undefined,
    formato_juego: document.getElementById('torneoFormato').value,
    sistema_puntaje: {
      victoria: ptsVictoria,
      empate: ptsEmpate,
      derrota: ptsDerrota
    },
    fecha_inicio: document.getElementById('torneoFechaInicio').value || undefined,
    cancha_juego: document.getElementById('torneoCanchaJuego').value || undefined
  };

  try {
    if (id) {
      await apiFetch(`/liga/torneos/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch('/liga/torneos', { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formTorneo').classList.add('oculto');
    ocultarFondoModal();
    cargarTorneos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== CATEGORÍAS =====================

function verCategorias(torneoId, nombreTorneo) {
  torneoActualId = torneoId;
  mostrarFondoModal();
  torneoActualNombre = nombreTorneo;
  document.getElementById('panelCategorias').classList.remove('oculto');
  document.getElementById('panelSubcategorias').classList.add('oculto');
  document.getElementById('panelDetalleCategoria').classList.add('oculto');
  document.getElementById('tituloCategorias').textContent = `Categorías de "${nombreTorneo}"`;
  document.getElementById('formCategoria').classList.add('oculto');
  subcategoriaActualId = null;
  subcategoriaActualNombre = '';
  cargarCategorias(torneoId);
}

async function cargarCategorias(torneoId) {
  const cont = document.getElementById('gridCategorias');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoId}/categorias`);
    categoriasCache = data.categorias;

    const unidadesSumables = categoriasCache.reduce((acc, c) => acc + (c.subcategorias && c.subcategorias.length ? c.subcategorias.length : 1), 0);
    document.getElementById('btnVerTablaGeneral').classList.toggle('oculto', unidadesSumables <= 1);

    if (!categoriasCache.length) {
      cont.innerHTML = '<p class="texto-ayuda">Todavía no hay categorías en este torneo.</p>';
      return;
    }
    cont.innerHTML = categoriasCache.map((c) => `
      <div class="boton-grande" onclick="abrirCategoria('${c.id}', '${escapeHtml(c.nombre)}')">
        <div class="acciones-boton-grande">
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="event.stopPropagation(); editarCategoria('${c.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="event.stopPropagation(); eliminarCategoria('${c.id}', '${escapeHtml(c.nombre)}')">${ICONO_BASURA}</button>
        </div>
        <h3>${escapeHtml(c.nombre)}</h3>
        <p>${c.precio_inscripcion != null ? `$${Number(c.precio_inscripcion).toLocaleString('es-AR')}` : 'Sin precio de inscripción'}</p>
        <p>${c.subcategorias && c.subcategorias.length ? escapeHtml(c.subcategorias.map((s) => s.nombre).join(', ')) : 'Sin subcategorías'}</p>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function editarCategoria(categoriaId) {
  const categoria = categoriasCache.find((c) => c.id === categoriaId);
  if (!categoria) return;
  document.getElementById('categoriaIdEdicion').value = categoria.id;
  document.getElementById('categoriaTorneoId').value = torneoActualId;
  document.getElementById('categoriaNombre').value = categoria.nombre || '';
  document.getElementById('categoriaPrecioInscripcion').value = categoria.precio_inscripcion != null ? categoria.precio_inscripcion : '';
  document.getElementById('categoriaSumaTablaGeneral').checked = categoria.suma_tabla_general !== false;
  document.getElementById('categoriaFormError').classList.add('oculto');
  document.getElementById('formCategoria').classList.remove('oculto');
}

async function eliminarCategoria(categoriaId, nombreCategoria) {
  if (!confirm(`¿Eliminar la categoría "${nombreCategoria}"? Se borran también sus subcategorías, equipos inscriptos, fixture y estadísticas.`)) {
    return;
  }
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaId}`, { method: 'DELETE' });
    // Si el formulario de edición estaba abierto justo para esta categoría,
    // lo cerramos: de lo contrario quedaría un "Guardar" apuntando a un id
    // que ya no existe y el próximo submit fallaría con 404.
    if (document.getElementById('categoriaIdEdicion').value === categoriaId) {
      document.getElementById('formCategoria').classList.add('oculto');
      document.getElementById('categoriaIdEdicion').value = '';
    }
    cargarCategorias(torneoActualId);
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarCategoria(e) {
  e.preventDefault();
  const errorEl = document.getElementById('categoriaFormError');
  errorEl.classList.add('oculto');

  const id = document.getElementById('categoriaIdEdicion').value;
  const cuerpo = {
    nombre: document.getElementById('categoriaNombre').value.trim(),
    precio_inscripcion: document.getElementById('categoriaPrecioInscripcion').value || undefined,
    suma_tabla_general: document.getElementById('categoriaSumaTablaGeneral').checked
  };

  try {
    if (id) {
      await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${id}`, { method: 'PUT', body: JSON.stringify(cuerpo) });
    } else {
      await apiFetch(`/liga/torneos/${torneoActualId}/categorias`, { method: 'POST', body: JSON.stringify(cuerpo) });
    }
    document.getElementById('formCategoria').classList.add('oculto');
    cargarCategorias(torneoActualId);
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== SUBCATEGORÍAS (pantalla intermedia entre Categoría y Detalle) =====================
// Nivel extra y opcional atado a la categoría principal (ej: "2018", "2019",
// "2020" dentro de la categoría "Baby Fútbol A"). Cuando una categoría tiene
// subcategorías cargadas, tocarla en el grid de Categorías NO entra directo
// al fixture: primero muestra este grid de subcategorías (ver abrirCategoria
// más abajo), y recién al elegir una se abre el fixture/tabla/goleadores/
// tarjetas de ESA subcategoría puntual.

function subcategoriasDeCategoriaActual() {
  const cat = categoriasCache.find((c) => c.id === categoriaActualId);
  return (cat && cat.subcategorias) || [];
}

function abrirSubcategorias(categoriaId, nombreCategoria) {
  categoriaActualId = categoriaId;
  categoriaActualNombre = nombreCategoria;
  document.getElementById('panelCategorias').classList.add('oculto');
  document.getElementById('panelSubcategorias').classList.remove('oculto');
  document.getElementById('tituloSubcategorias').textContent = `Subcategorías de "${nombreCategoria}"`;
  document.getElementById('formSubcategoria').classList.add('oculto');
  cargarSubcategorias();
}

async function cargarSubcategorias() {
  const cont = document.getElementById('gridSubcategorias');
  cont.innerHTML = '<p class="texto-ayuda">Cargando...</p>';
  try {
    // Refresca categoriasCache para tener las subcategorías al día.
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias`);
    categoriasCache = data.categorias;
    const subcategorias = subcategoriasDeCategoriaActual();
    if (!subcategorias.length) {
      cont.innerHTML = '<p class="texto-ayuda">Todavía no cargaste subcategorías.</p>';
      return;
    }
    cont.innerHTML = subcategorias.map((s) => `
      <div class="boton-grande" onclick="abrirDetalleCategoria('${categoriaActualId}', '${escapeHtml(categoriaActualNombre)}', '${s.id}', '${escapeHtml(s.nombre)}')">
        <div class="acciones-boton-grande">
          <button class="btn btn-secundario btn-pequeno btn-icono" title="Editar" onclick="event.stopPropagation(); editarSubcategoria('${s.id}')">${ICONO_LAPIZ}</button>
          <button class="btn btn-peligro btn-pequeno btn-icono" title="Eliminar" onclick="event.stopPropagation(); eliminarSubcategoria('${s.id}', '${escapeHtml(s.nombre)}')">${ICONO_BASURA}</button>
        </div>
        <h3>${escapeHtml(s.nombre)}</h3>
        <p>${s.precio_inscripcion != null ? `$${Number(s.precio_inscripcion).toLocaleString('es-AR')}` : 'Sin precio de inscripción'}</p>
        <p>${s.suma_tabla_general !== false ? 'Suma a la tabla general' : 'No suma a la tabla general'}</p>
      </div>
    `).join('');
  } catch (err) {
    cont.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

function editarSubcategoria(subcategoriaId) {
  const sub = subcategoriasDeCategoriaActual().find((s) => s.id === subcategoriaId);
  if (!sub) return;
  document.getElementById('subcategoriaIdEdicion').value = sub.id;
  document.getElementById('subcategoriaNombre').value = sub.nombre || '';
  document.getElementById('subcategoriaPrecioInscripcion').value = sub.precio_inscripcion != null ? sub.precio_inscripcion : '';
  document.getElementById('subcategoriaSumaTablaGeneral').checked = sub.suma_tabla_general !== false;
  document.getElementById('subcategoriaFormError').classList.add('oculto');
  document.getElementById('formSubcategoria').classList.remove('oculto');
}

async function guardarSubcategoria(e) {
  e.preventDefault();
  const errorEl = document.getElementById('subcategoriaFormError');
  errorEl.classList.add('oculto');
  const id = document.getElementById('subcategoriaIdEdicion').value;
  const nombre = document.getElementById('subcategoriaNombre').value.trim();
  const precioInscripcion = document.getElementById('subcategoriaPrecioInscripcion').value || undefined;
  const sumaTablaGeneral = document.getElementById('subcategoriaSumaTablaGeneral').checked;
  if (!nombre) return;

  try {
    if (id) {
      await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/subcategorias/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ nombre, precio_inscripcion: precioInscripcion, suma_tabla_general: sumaTablaGeneral })
      });
    } else {
      await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/subcategorias`, {
        method: 'POST',
        body: JSON.stringify({ nombre, precio_inscripcion: precioInscripcion, suma_tabla_general: sumaTablaGeneral })
      });
    }
    document.getElementById('formSubcategoria').classList.add('oculto');
    await cargarSubcategorias();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function eliminarSubcategoria(subcategoriaId, nombre) {
  if (!confirm(`¿Eliminar la subcategoría "${nombre}"? Se borran también los equipos (partidos y tabla) que estuvieran inscriptos puntualmente en ella.`)) {
    return;
  }
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/subcategorias/${subcategoriaId}`, { method: 'DELETE' });
    await cargarSubcategorias();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== DETALLE DE CATEGORÍA/SUBCATEGORÍA (fixture / tabla / goleadores / tarjetas) =====================

// Punto de entrada al tocar una tarjeta de Categoría: si tiene subcategorías
// cargadas, primero hay que elegir una (abrirSubcategorias); si no tiene,
// entra directo al detalle (fixture/tabla/etc.) de la categoría "pelada".
function abrirCategoria(categoriaId, nombreCategoria) {
  const cat = categoriasCache.find((c) => c.id === categoriaId);
  if (cat && cat.subcategorias && cat.subcategorias.length) {
    abrirSubcategorias(categoriaId, nombreCategoria);
  } else {
    abrirDetalleCategoria(categoriaId, nombreCategoria, null, null);
  }
}

function abrirDetalleCategoria(categoriaId, nombreCategoria, subcategoriaId, nombreSubcategoria) {
  categoriaActualId = categoriaId;
  categoriaActualNombre = nombreCategoria;
  subcategoriaActualId = subcategoriaId || null;
  subcategoriaActualNombre = nombreSubcategoria || '';
  // Los equipos y partidos son de la categoría/subcategoría anterior: se
  // vuelven a pedir al servidor para esta, así no arrastramos datos viejos.
  equiposCache = [];
  partidosCache = [];
  document.getElementById('panelCategorias').classList.add('oculto');
  document.getElementById('panelSubcategorias').classList.add('oculto');
  document.getElementById('panelDetalleCategoria').classList.remove('oculto');
  document.getElementById('tituloDetalleCategoria').textContent = subcategoriaActualNombre
    ? `${nombreCategoria} — ${subcategoriaActualNombre} · ${torneoActualNombre}`
    : `${nombreCategoria} — ${torneoActualNombre}`;
  document.getElementById('formGenerarFixture').classList.add('oculto');
  document.getElementById('formPartido').classList.add('oculto');
  document.getElementById('fixtureIdaVuelta').checked = false;
  jornadaFixtureActual = 1;
  rondaTablaActual = 'general';
  cambiarTabDetalle('fixture');
}

function cambiarTabDetalle(nombre) {
  const secciones = {
    fixture: 'subSeccionFixture', tabla: 'subSeccionTabla',
    goleadores: 'subSeccionGoleadores', tarjetas: 'subSeccionTarjetas'
  };
  const botones = {
    fixture: 'tabBtnFixture', tabla: 'tabBtnTabla',
    goleadores: 'tabBtnGoleadores', tarjetas: 'tabBtnTarjetas'
  };
  Object.keys(secciones).forEach((key) => {
    document.getElementById(secciones[key]).classList.toggle('oculto', key !== nombre);
    document.getElementById(botones[key]).classList.toggle('activo', key === nombre);
  });
  if (nombre === 'fixture') cargarPartidos();
  if (nombre === 'tabla') {
    document.getElementById('tabsRondaTabla').classList.toggle('oculto', !torneoActualEsAperturaClausura());
    cargarTabla();
  }
  if (nombre === 'goleadores') cargarGoleadores();
  if (nombre === 'tarjetas') cargarTarjetas();
}

// ----- Gestionar equipos: popup encima de panelDetalleCategoria -----

function abrirGestionarEquipos() {
  document.getElementById('tituloGestionarEquipos').textContent = subcategoriaActualNombre
    ? `Gestionar equipos — ${subcategoriaActualNombre}`
    : 'Gestionar equipos';
  document.getElementById('panelGestionarEquipos').classList.remove('oculto');
  document.getElementById('fondoModalGestionarEquipos').classList.remove('oculto');
  cargarEquipos();
}

function cerrarGestionarEquipos() {
  document.getElementById('panelGestionarEquipos').classList.add('oculto');
  document.getElementById('fondoModalGestionarEquipos').classList.add('oculto');
}

// ----- Tabla general del torneo: popup encima de panelCategorias -----

function abrirTablaGeneral() {
  document.getElementById('panelTablaGeneral').classList.remove('oculto');
  document.getElementById('fondoModalTablaGeneral').classList.remove('oculto');
  cargarTablaGeneral(torneoActualId);
}

function cerrarTablaGeneral() {
  document.getElementById('panelTablaGeneral').classList.add('oculto');
  document.getElementById('fondoModalTablaGeneral').classList.add('oculto');
}

async function cargarTablaGeneral(torneoId) {
  const tbody = document.getElementById('tablaGeneralTorneo');
  tbody.innerHTML = '<tr><td colspan="9">Cargando...</td></tr>';
  try {
    const data = await apiFetch(`/liga/torneos/${torneoId}/tabla-general`);
    const filas = data.tabla || [];
    if (!filas.length) {
      tbody.innerHTML = '<tr><td colspan="9">Todavía no hay datos para la tabla general.</td></tr>';
      return;
    }
    tbody.innerHTML = filas.map((f) => `
      <tr>
        <td>${swatch(f.club_color_primario)}${escapeHtml(f.club_nombre)}</td>
        <td>${f.partidos_jugados}</td>
        <td>${f.ganados}</td>
        <td>${f.empatados}</td>
        <td>${f.perdidos}</td>
        <td>${f.a_favor}</td>
        <td>${f.en_contra}</td>
        <td>${f.diferencia}</td>
        <td><strong>${f.puntos}</strong></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function cambiarRondaTabla(ronda) {
  rondaTablaActual = ronda;
  const botones = { general: 'tabBtnRondaGeneral', apertura: 'tabBtnRondaApertura', clausura: 'tabBtnRondaClausura' };
  Object.keys(botones).forEach((key) => {
    document.getElementById(botones[key]).classList.toggle('activo', key === ronda);
  });
  cargarTabla();
}

async function cargarEquipos() {
  const tbody = document.getElementById('tablaEquipos');
  const select = document.getElementById('selectClubInscribir');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    // La navegación ya nos dejó parados en una categoría (sin subcategorías)
    // o en una subcategoría puntual — subcategoriaActualId ya viene resuelto,
    // no hace falta elegirla acá.
    const qs = subcategoriaActualId ? `?subcategoria_id=${subcategoriaActualId}` : '';
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos${qs}`);
    equiposCache = data.equipos;

    if (!equiposCache.length) {
      tbody.innerHTML = `<tr><td colspan="3">Todavía no hay clubes inscriptos${subcategoriaActualNombre ? ` en "${escapeHtml(subcategoriaActualNombre)}"` : ' en esta categoría'}.</td></tr>`;
    } else {
      tbody.innerHTML = equiposCache.map((eq) => `
        <tr>
          <td>${swatch(eq.club_color_primario)}${escapeHtml(eq.club_nombre)}</td>
          <td>${eq.subcategoria_nombre ? escapeHtml(eq.subcategoria_nombre) : '-'}</td>
          <td><button class="btn btn-peligro btn-pequeno" onclick="eliminarEquipo('${eq.id}', '${escapeHtml(eq.club_nombre)}')">Dar de baja</button></td>
        </tr>
      `).join('');
    }

    const idsInscriptos = new Set(equiposCache.map((eq) => eq.club_id));
    const disponibles = clubesCache.filter((c) => !idsInscriptos.has(c.id));
    if (!disponibles.length) {
      select.innerHTML = '<option value="">No hay clubes disponibles para inscribir</option>';
    } else {
      select.innerHTML = disponibles.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function eliminarEquipo(equipoId, nombreClub) {
  if (!confirm(`¿Dar de baja a "${nombreClub}" de esta categoría? Se borran también sus partidos programados/jugados y su fila en la tabla de posiciones.`)) {
    return;
  }
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos/${equipoId}`, { method: 'DELETE' });
    cargarEquipos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function inscribirClub() {
  const errorEl = document.getElementById('equipoFormError');
  errorEl.classList.add('oculto');
  const select = document.getElementById('selectClubInscribir');
  const clubIds = Array.from(select.selectedOptions).map((o) => o.value).filter(Boolean);
  if (!clubIds.length) {
    errorEl.textContent = 'No hay ningún club seleccionado para inscribir.';
    errorEl.classList.remove('oculto');
    return;
  }
  // Inscribimos club por club (el backend valida cada uno por separado);
  // si alguno falla (ej: ya estaba inscripto en otra categoría del mismo
  // torneo) seguimos con el resto y mostramos qué pasó al final. La
  // subcategoría ya viene resuelta por la navegación (subcategoriaActualId).
  const fallidos = [];
  for (const clubId of clubIds) {
    try {
      await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos`, {
        method: 'POST',
        body: JSON.stringify({ club_id: clubId, subcategoria_id: subcategoriaActualId || undefined })
      });
    } catch (err) {
      const club = clubesCache.find((c) => c.id === clubId);
      fallidos.push(`${club ? club.nombre : clubId}: ${err.message}`);
    }
  }
  if (fallidos.length) {
    errorEl.innerHTML = `No se pudieron inscribir ${fallidos.length} club(es):<br>` + fallidos.map((f) => escapeHtml(f)).join('<br>');
    errorEl.classList.remove('oculto');
  }
  cargarEquipos();
}

let fixtureCanchaJuegoActual = 'clubes';

async function cargarPartidos() {
  const contenedor = document.getElementById('contenedorPartidosJornada');
  contenedor.innerHTML = '<p class="texto-ayuda">Cargando...</p>';

  // Aseguramos tener los equipos ya cargados para poblar los selects del form
  // (ya filtrados a la subcategoría actual, si corresponde).
  if (!equiposCache.length) {
    try {
      const qsEq = subcategoriaActualId ? `?subcategoria_id=${subcategoriaActualId}` : '';
      const dataEquipos = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/equipos${qsEq}`);
      equiposCache = dataEquipos.equipos;
    } catch (err) {
      // seguimos igual; el select va a quedar vacío
    }
  }
  const opcionesEquipos = equiposCache.map((eq) => `<option value="${eq.id}">${escapeHtml(eq.club_nombre)}</option>`).join('');
  document.getElementById('partidoLocal').innerHTML = opcionesEquipos;
  document.getElementById('partidoVisitante').innerHTML = opcionesEquipos;

  if (!arbitrosLigaCache.length) {
    try {
      const dataArbitros = await apiFetch('/liga/configuracion/arbitros');
      arbitrosLigaCache = dataArbitros.arbitros;
    } catch (err) {
      // seguimos igual; el select de árbitros va a quedar vacío
    }
  }

  try {
    const qs = subcategoriaActualId ? `?subcategoria_id=${subcategoriaActualId}` : '';
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos${qs}`);
    partidosCache = data.partidos;
    fixtureCanchaJuegoActual = data.cancha_juego || 'clubes';
    jornadasDescripcionCache = {};
    (data.jornadas || []).forEach((j) => { jornadasDescripcionCache[j.jornada] = j.descripcion; });

    if (fixtureCanchaJuegoActual === 'propias_liga' && !prediosLigaCache.length) {
      try {
        const dataPredios = await apiFetch('/liga/configuracion/predios');
        prediosLigaCache = dataPredios.predios;
      } catch (err) {
        // seguimos igual; el desplegable va a quedar vacío
      }
    }

    if (fixtureCanchaJuegoActual === 'clubes') {
      const clubIdsLocal = Array.from(new Set(partidosCache.map((p) => p.club_local_id).filter(Boolean)));
      await Promise.all(clubIdsLocal.map(async (clubId) => {
        if (canchasClubFixtureCache[clubId]) return;
        try {
          const dataCanchas = await apiFetch(`/liga/clubes/${clubId}/canchas`);
          canchasClubFixtureCache[clubId] = dataCanchas.canchas;
        } catch (err) {
          canchasClubFixtureCache[clubId] = [];
        }
      }));
    }

    if (!partidosCache.length) {
      document.getElementById('navegadorJornadas').classList.add('oculto');
      document.getElementById('bloqueDescripcionJornada').classList.add('oculto');
      contenedor.innerHTML = '<p class="texto-ayuda">Todavía no hay partidos programados.</p>';
      return;
    }

    document.getElementById('navegadorJornadas').classList.remove('oculto');
    document.getElementById('bloqueDescripcionJornada').classList.remove('oculto');
    const jornadasDisponibles = Array.from(new Set(partidosCache.map((p) => p.jornada != null ? p.jornada : 0))).sort((a, b) => a - b);
    if (!jornadasDisponibles.includes(jornadaFixtureActual)) {
      jornadaFixtureActual = jornadasDisponibles[0];
    }
    renderJornadaFixture(jornadasDisponibles);
  } catch (err) {
    document.getElementById('navegadorJornadas').classList.add('oculto');
    document.getElementById('bloqueDescripcionJornada').classList.add('oculto');
    contenedor.innerHTML = `<p class="mensaje-error">Error: ${escapeHtml(err.message)}</p>`;
  }
}

async function guardarDescripcionJornada() {
  const valor = document.getElementById('inputDescripcionJornada').value.trim();
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/jornadas/${jornadaFixtureActual}`, {
      method: 'PUT',
      body: JSON.stringify({ descripcion: valor || undefined, subcategoria_id: subcategoriaActualId || undefined })
    });
    jornadasDescripcionCache[jornadaFixtureActual] = valor || null;
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function cambiarJornadaFixture(delta) {
  const jornadasDisponibles = Array.from(new Set(partidosCache.map((p) => p.jornada != null ? p.jornada : 0))).sort((a, b) => a - b);
  const idx = jornadasDisponibles.indexOf(jornadaFixtureActual);
  const nuevoIdx = idx + delta;
  if (nuevoIdx < 0 || nuevoIdx >= jornadasDisponibles.length) return;
  jornadaFixtureActual = jornadasDisponibles[nuevoIdx];
  renderJornadaFixture(jornadasDisponibles);
}

function opcionesCanchasPredio(canchaPredioIdSeleccionada) {
  let html = '<option value="">Sin asignar</option>';
  prediosLigaCache.forEach((predio) => {
    (predio.canchas || []).forEach((cancha) => {
      const selected = cancha.id === canchaPredioIdSeleccionada ? 'selected' : '';
      html += `<option value="${cancha.id}" ${selected}>${escapeHtml(predio.nombre)} - ${escapeHtml(cancha.nombre)}</option>`;
    });
  });
  return html;
}

function renderJornadaFixture(jornadasDisponibles) {
  const contenedor = document.getElementById('contenedorPartidosJornada');
  const esAperturaClausura = torneoActualEsAperturaClausura();
  const partidosJornada = partidosCache.filter((p) => (p.jornada != null ? p.jornada : 0) === jornadaFixtureActual);
  const rondaLabel = { apertura: ' (Apertura)', clausura: ' (Clausura)' };
  const ronda = partidosJornada[0] && partidosJornada[0].ronda;
  document.getElementById('tituloJornadaActual').textContent =
    `Fecha ${jornadaFixtureActual}${esAperturaClausura && ronda ? rondaLabel[ronda] || '' : ''}`;

  document.getElementById('btnJornadaAnterior').disabled = jornadasDisponibles.indexOf(jornadaFixtureActual) === 0;
  document.getElementById('btnJornadaSiguiente').disabled = jornadasDisponibles.indexOf(jornadaFixtureActual) === jornadasDisponibles.length - 1;
  document.getElementById('inputDescripcionJornada').value = jornadasDescripcionCache[jornadaFixtureActual] || '';

  contenedor.innerHTML = partidosJornada.map((p) => {
    const logoLocal = p.club_local_logo_url
      ? `<img src="${escapeHtml(p.club_local_logo_url)}" alt="" style="width:32px; height:32px; object-fit:contain; border-radius:6px;">`
      : swatch(p.club_local_color);
    const logoVisitante = p.club_visitante_logo_url
      ? `<img src="${escapeHtml(p.club_visitante_logo_url)}" alt="" style="width:32px; height:32px; object-fit:contain; border-radius:6px;">`
      : swatch(p.club_visitante_color);

    let bloqueCancha;
    if (fixtureCanchaJuegoActual === 'propias_liga') {
      bloqueCancha = `
        <div>
          <label style="font-size:12px;">Predio y cancha</label>
          <select data-partido-id="${p.id}" class="select-cancha-predio-partido" style="width:100%; padding:6px; border:1px solid var(--gris-300); border-radius:6px; font-size:13px;">
            ${opcionesCanchasPredio(p.cancha_predio_id)}
          </select>
        </div>`;
    } else {
      const canchasClub = canchasClubFixtureCache[p.club_local_id] || [];
      if (canchasClub.length > 1) {
        // El club local tiene más de una cancha: por defecto la principal,
        // pero se puede elegir otra puntualmente para este partido.
        const seleccionada = p.cancha_club_id || (canchasClub.find((c) => c.es_principal) || {}).id || '';
        const opciones = canchasClub.map((c) => {
          const etiqueta = `${escapeHtml(c.nombre || 'Cancha')}${c.es_principal ? ' (Principal)' : ''}`;
          return `<option value="${c.id}" ${c.id === seleccionada ? 'selected' : ''}>${etiqueta}</option>`;
        }).join('');
        bloqueCancha = `
          <div>
            <label style="font-size:12px;">Cancha del local</label>
            <select data-partido-id="${p.id}" class="select-cancha-club-partido" style="width:100%; padding:6px; border:1px solid var(--gris-300); border-radius:6px; font-size:13px;">
              ${opciones}
            </select>
          </div>`;
      } else {
        const detalles = [];
        if (p.club_local_direccion) detalles.push(escapeHtml(p.club_local_direccion));
        if (p.club_local_cancha_techo) detalles.push(p.club_local_cancha_techo === 'techada' ? 'Techada' : 'Aire libre');
        if (p.club_local_cancha_tamanio) detalles.push(escapeHtml(p.club_local_cancha_tamanio));
        if (p.club_local_cancha_tipo_nombre) detalles.push(escapeHtml(p.club_local_cancha_tipo_nombre));
        bloqueCancha = `<div><label style="font-size:12px;">Cancha (del local)</label><p class="texto-ayuda" style="margin:2px 0;">${detalles.length ? detalles.join(' · ') : 'Sin datos de cancha cargados'}</p></div>`;
      }
    }

    const asignados = p.arbitros || [];
    const asignadosIds = new Set(asignados.map((a) => a.id));
    const disponibles = arbitrosLigaCache.filter((a) => !asignadosIds.has(a.id));
    const opcionesArbitrosDisponibles = disponibles.map((a) =>
      `<option value="${a.id}">${escapeHtml(a.apellido)}, ${escapeHtml(a.nombre)} (${escapeHtml(NOMBRES_TIPO_ARBITRO[a.tipo] || a.tipo)})</option>`
    ).join('');
    const chipsArbitrosAsignados = asignados.map((a) => `
      <span class="badge badge-activo" style="display:inline-flex; align-items:center; gap:6px; margin:2px 4px 2px 0;">
        ${escapeHtml(a.apellido)}, ${escapeHtml(a.nombre)} (${escapeHtml(NOMBRES_TIPO_ARBITRO[a.tipo] || a.tipo)})
        <button type="button" onclick="quitarArbitroPartido('${p.id}', '${a.id}')" style="border:none; background:none; cursor:pointer; font-weight:700; line-height:1; padding:0;" title="Quitar">×</button>
      </span>
    `).join('');
    const bloqueArbitros = `
      <div>
        <label style="font-size:12px;">Asignar árbitro</label>
        <div style="display:flex; gap:6px;">
          <select data-partido-id="${p.id}" class="select-arbitro-disponible-partido" style="flex:1; padding:6px; border:1px solid var(--gris-300); border-radius:6px; font-size:13px;" ${!disponibles.length ? 'disabled' : ''}>
            ${disponibles.length ? `<option value="">Elegir árbitro...</option>${opcionesArbitrosDisponibles}` : '<option value="">Sin más árbitros disponibles</option>'}
          </select>
          <button type="button" class="btn btn-secundario btn-pequeno" onclick="agregarArbitroPartido('${p.id}')">Agregar</button>
        </div>
        ${!arbitrosLigaCache.length ? '<p class="texto-ayuda" style="margin:2px 0;">Cargá árbitros en Configuración → Árbitros.</p>' : ''}
        <div style="margin-top:6px;">${chipsArbitrosAsignados || '<span class="texto-ayuda">Sin árbitros asignados.</span>'}</div>
      </div>`;

    return `
      <div class="panel" style="margin-bottom:12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:220px;">
            ${logoLocal}<strong>${escapeHtml(p.club_local_nombre)}</strong>
            <span style="margin:0 8px;">${p.resultado_local != null ? `${p.resultado_local} - ${p.resultado_visitante}` : 'vs'}</span>
            <strong>${escapeHtml(p.club_visitante_nombre)}</strong>${logoVisitante}
          </div>
          <span class="badge ${p.estado === 'jugado' ? 'badge-activo' : 'badge-inactivo'}">${escapeHtml(p.estado || 'programado')}</span>
          <button class="btn btn-secundario btn-pequeno" onclick="abrirModalResultado('${p.id}')">Cargar resultado</button>
        </div>
        <div class="form-grid" style="margin-top:10px;">
          <div>
            <label style="font-size:12px;">Día</label>
            <input type="date" class="input-fecha-partido" data-partido-id="${p.id}" value="${p.fecha ? String(p.fecha).slice(0, 10) : ''}" style="width:100%; padding:6px; border:1px solid var(--gris-300); border-radius:6px; font-size:13px;">
          </div>
          <div>
            <label style="font-size:12px;">Horario</label>
            <input type="time" class="input-hora-partido" data-partido-id="${p.id}" value="${p.hora ? String(p.hora).slice(0, 5) : ''}" style="width:100%; padding:6px; border:1px solid var(--gris-300); border-radius:6px; font-size:13px;">
          </div>
          ${bloqueCancha}
        </div>
        <button class="btn btn-secundario btn-pequeno" style="margin-top:8px;" onclick="guardarProgramacionPartido('${p.id}')">Guardar día/horario/cancha</button>
        <p class="mensaje-error oculto" id="errorProgramacion-${p.id}"></p>
        <div style="margin-top:10px; border-top:1px solid var(--gris-200); padding-top:10px;">
          ${bloqueArbitros}
        </div>
      </div>
    `;
  }).join('');
}

async function agregarArbitroPartido(partidoId) {
  const select = document.querySelector(`.select-arbitro-disponible-partido[data-partido-id="${partidoId}"]`);
  if (!select || !select.value) return;
  const partido = partidosCache.find((p) => p.id === partidoId);
  const idsActuales = ((partido && partido.arbitros) || []).map((a) => a.id);
  await guardarArbitrosPartido(partidoId, [...idsActuales, select.value]);
}

async function quitarArbitroPartido(partidoId, arbitroId) {
  const partido = partidosCache.find((p) => p.id === partidoId);
  const idsActuales = ((partido && partido.arbitros) || []).map((a) => a.id);
  await guardarArbitrosPartido(partidoId, idsActuales.filter((id) => id !== arbitroId));
}

async function guardarArbitrosPartido(partidoId, arbitroIds) {
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}/arbitros`, {
      method: 'PUT',
      body: JSON.stringify({ arbitro_ids: arbitroIds })
    });
    cargarPartidos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function guardarProgramacionPartido(partidoId) {
  const errorEl = document.getElementById(`errorProgramacion-${partidoId}`);
  if (errorEl) errorEl.classList.add('oculto');
  const fechaEl = document.querySelector(`.input-fecha-partido[data-partido-id="${partidoId}"]`);
  const horaEl = document.querySelector(`.input-hora-partido[data-partido-id="${partidoId}"]`);
  const canchaPredioEl = document.querySelector(`.select-cancha-predio-partido[data-partido-id="${partidoId}"]`);
  const canchaClubEl = document.querySelector(`.select-cancha-club-partido[data-partido-id="${partidoId}"]`);
  const cuerpo = {
    fecha: fechaEl && fechaEl.value ? fechaEl.value : undefined,
    hora: horaEl && horaEl.value ? horaEl.value : undefined,
    cancha_predio_id: canchaPredioEl ? (canchaPredioEl.value || null) : undefined,
    cancha_club_id: canchaClubEl ? (canchaClubEl.value || null) : undefined
  };
  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}`, {
      method: 'PATCH',
      body: JSON.stringify(cuerpo)
    });
    cargarPartidos();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.classList.remove('oculto');
    } else {
      alert('Error: ' + err.message);
    }
  }
}

async function guardarPartido(e) {
  e.preventDefault();
  const errorEl = document.getElementById('partidoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    equipo_local_id: document.getElementById('partidoLocal').value,
    equipo_visitante_id: document.getElementById('partidoVisitante').value,
    jornada: document.getElementById('partidoJornada').value || undefined,
    fecha: document.getElementById('partidoFecha').value || undefined
  };

  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos`, {
      method: 'POST',
      body: JSON.stringify(cuerpo)
    });
    document.getElementById('formPartido').classList.add('oculto');
    cargarPartidos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function generarFixtureAutomatico(e) {
  e.preventDefault();
  const errorEl = document.getElementById('fixtureAccionError');
  errorEl.classList.add('oculto');
  const idaVuelta = document.getElementById('fixtureIdaVuelta').checked;
  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/fixture/generar`, {
      method: 'POST',
      body: JSON.stringify({ ida_vuelta: idaVuelta, subcategoria_id: subcategoriaActualId || undefined })
    });
    document.getElementById('formGenerarFixture').classList.add('oculto');
    alert(`Se generaron ${data.partidos_creados} partidos en ${data.jornadas} jornadas.`);
    jornadaFixtureActual = 1;
    cargarPartidos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function vaciarFixture() {
  if (!confirm('¿Vaciar el fixture de esta categoría? Se borran los partidos programados que todavía NO tienen resultado cargado (los ya jugados se conservan).')) {
    return;
  }
  try {
    const qs = subcategoriaActualId ? `?subcategoria_id=${subcategoriaActualId}` : '';
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/fixture${qs}`, { method: 'DELETE' });
    alert(`Se borraron ${data.borrados} partidos.`);
    cargarPartidos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ----- Modal de carga de resultado + goles/tarjetas por jugador -----

let estadisticasPartidoActualId = null;

async function abrirModalResultado(partidoId) {
  estadisticasPartidoActualId = partidoId;
  const partido = partidosCache.find((p) => p.id === partidoId);
  document.getElementById('resultadoPartidoId').value = partidoId;
  document.getElementById('resultadoFormError').classList.add('oculto');
  document.getElementById('resultadoLocalScore').value = partido && partido.resultado_local != null ? partido.resultado_local : '';
  document.getElementById('resultadoVisitanteScore').value = partido && partido.resultado_visitante != null ? partido.resultado_visitante : '';
  if (partido) {
    document.getElementById('labelResultadoLocal').textContent = `Goles ${partido.club_local_nombre}`;
    document.getElementById('labelResultadoVisitante').textContent = `Goles ${partido.club_visitante_nombre}`;
  }

  const contenedor = document.getElementById('contenedorEstadisticasJugadores');
  contenedor.innerHTML = 'Cargando jugadores...';
  document.getElementById('panelCargarResultado').classList.remove('oculto');
  document.getElementById('fondoModalResultado').classList.remove('oculto');

  try {
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}/jugadores`);
    const estadisticasPorJugador = {};
    (data.estadisticas || []).forEach((e) => { estadisticasPorJugador[e.jugador_id] = e; });

    const bloque = (titulo, jugadores, equipoTorneoId) => `
      <div class="bloque-equipo-stats">
        <h4>${escapeHtml(titulo)} — goles y tarjetas por jugador</h4>
        ${jugadores.length ? jugadores.map((j) => {
          const est = estadisticasPorJugador[j.id] || {};
          return `
            <div class="fila-jugador-stats" data-jugador-id="${j.id}" data-equipo-torneo-id="${equipoTorneoId}">
              <span class="nombre-jugador">${escapeHtml(j.apellido)}, ${escapeHtml(j.nombre)}${j.numero_camiseta ? ` (#${j.numero_camiseta})` : ''}</span>
              <label>Goles</label><input type="number" min="0" class="stat-goles" value="${est.goles || 0}">
              <label>Am.</label><input type="number" min="0" class="stat-amarillas" value="${est.tarjetas_amarillas || 0}">
              <label>Roj.</label><input type="number" min="0" class="stat-rojas" value="${est.tarjetas_rojas || 0}">
            </div>
          `;
        }).join('') : '<p class="texto-ayuda">Este club todavía no tiene jugadores cargados.</p>'}
      </div>
    `;

    contenedor.innerHTML =
      bloque(partido ? partido.club_local_nombre : 'Equipo local', data.jugadores_local, data.equipo_local_id) +
      bloque(partido ? partido.club_visitante_nombre : 'Equipo visitante', data.jugadores_visitante, data.equipo_visitante_id);
  } catch (err) {
    contenedor.innerHTML = `<p class="mensaje-error">Error cargando jugadores: ${escapeHtml(err.message)}</p>`;
  }
}

function cerrarModalResultado() {
  document.getElementById('panelCargarResultado').classList.add('oculto');
  document.getElementById('fondoModalResultado').classList.add('oculto');
  estadisticasPartidoActualId = null;
}

async function guardarResultadoConEstadisticas(e) {
  e.preventDefault();
  const errorEl = document.getElementById('resultadoFormError');
  errorEl.classList.add('oculto');

  const partidoId = document.getElementById('resultadoPartidoId').value;
  const resultadoLocal = document.getElementById('resultadoLocalScore').value;
  const resultadoVisitante = document.getElementById('resultadoVisitanteScore').value;

  const estadisticas = [];
  document.querySelectorAll('#contenedorEstadisticasJugadores .fila-jugador-stats').forEach((fila) => {
    estadisticas.push({
      jugador_id: fila.dataset.jugadorId,
      equipo_torneo_id: fila.dataset.equipoTorneoId,
      goles: fila.querySelector('.stat-goles').value || 0,
      tarjetas_amarillas: fila.querySelector('.stat-amarillas').value || 0,
      tarjetas_rojas: fila.querySelector('.stat-rojas').value || 0
    });
  });

  try {
    await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/partidos/${partidoId}/resultado`, {
      method: 'PUT',
      body: JSON.stringify({
        resultado_local: Number(resultadoLocal),
        resultado_visitante: Number(resultadoVisitante),
        estadisticas_jugadores: estadisticas
      })
    });
    cerrarModalResultado();
    cargarPartidos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ----- Goleadores y Tarjetas -----

async function cargarGoleadores() {
  const tbody = document.getElementById('tablaGoleadores');
  tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
  try {
    const qs = subcategoriaActualId ? `?subcategoria_id=${subcategoriaActualId}` : '';
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/goleadores${qs}`);
    const goleadores = data.goleadores;
    if (!goleadores.length) {
      tbody.innerHTML = '<tr><td colspan="3">Todavía no hay goles cargados en esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = goleadores.map((g) => `
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

async function cargarTarjetas() {
  const tbody = document.getElementById('tablaTarjetas');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const qs = subcategoriaActualId ? `?subcategoria_id=${subcategoriaActualId}` : '';
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/tarjetas${qs}`);
    const tarjetas = data.tarjetas;
    if (!tarjetas.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no hay tarjetas cargadas en esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = tarjetas.map((t) => `
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
    const ronda = torneoActualEsAperturaClausura() ? rondaTablaActual : 'general';
    const qsSub = subcategoriaActualId ? `&subcategoria_id=${subcategoriaActualId}` : '';
    const data = await apiFetch(`/liga/torneos/${torneoActualId}/categorias/${categoriaActualId}/tabla?ronda=${ronda}${qsSub}`);
    const tabla = data.tabla;
    if (!tabla.length) {
      tbody.innerHTML = '<tr><td colspan="9">Todavía no hay datos de tabla para esta categoría.</td></tr>';
      return;
    }
    tbody.innerHTML = tabla.map((fila) => `
      <tr>
        <td>${swatch(fila.club_color_primario)}${escapeHtml(fila.club_nombre)}</td>
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

// ===================== NOTICIAS =====================

async function cargarNoticias() {
  const tbody = document.getElementById('tablaNoticias');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/noticias');
    const noticias = data.noticias;
    if (!noticias.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no publicaste ninguna noticia.</td></tr>';
      return;
    }
    const badgesEstado = { publicada: 'badge-activo', borrador: 'badge-pendiente', archivada: 'badge-inactivo' };
    tbody.innerHTML = noticias.map((n) => `
      <tr>
        <td>${escapeHtml(n.titulo)}</td>
        <td><span class="badge ${badgesEstado[n.estado] || ''}">${escapeHtml(n.estado)}</span></td>
        <td>${n.destacada ? 'Sí' : '-'}</td>
        <td>${new Date(n.publicado_at).toLocaleDateString('es-AR')}</td>
        <td>
          ${n.estado !== 'publicada' ? `<button class="btn btn-secundario btn-pequeno" onclick="cambiarEstadoNoticia('${n.id}', 'publicada')">Publicar</button>` : ''}
          ${n.estado !== 'archivada' ? `<button class="btn btn-secundario btn-pequeno" onclick="cambiarEstadoNoticia('${n.id}', 'archivada')">Archivar</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarNoticia(e) {
  e.preventDefault();
  const errorEl = document.getElementById('noticiaFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    titulo: document.getElementById('noticiaTitulo').value.trim(),
    contenido: document.getElementById('noticiaContenido').value.trim(),
    imagen_url: document.getElementById('noticiaImagenUrl').value.trim() || undefined,
    destacada: document.getElementById('noticiaDestacada').checked
  };

  try {
    await apiFetch('/liga/noticias', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formNoticia').classList.add('oculto');
    cargarNoticias();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function cambiarEstadoNoticia(noticiaId, nuevoEstado) {
  try {
    await apiFetch(`/liga/noticias/${noticiaId}/estado`, {
      method: 'PATCH',
      body: JSON.stringify({ estado: nuevoEstado })
    });
    cargarNoticias();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== NOTIFICACIONES =====================

function poblarSelectClubesNotificacion() {
  const select = document.getElementById('notificacionClub');
  const opciones = clubesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  select.innerHTML = '<option value="">Todos los clubes de la Liga</option>' + opciones;
}

async function cargarNotificaciones() {
  const tbody = document.getElementById('tablaNotificaciones');
  tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/notificaciones');
    const notificaciones = data.notificaciones;
    if (!notificaciones.length) {
      tbody.innerHTML = '<tr><td colspan="4">Todavía no enviaste ninguna notificación.</td></tr>';
      return;
    }
    tbody.innerHTML = notificaciones.map((n) => `
      <tr>
        <td>${escapeHtml(n.titulo)}</td>
        <td>${escapeHtml(n.club_nombre || 'Todos los clubes')}</td>
        <td>${escapeHtml(n.tipo)}</td>
        <td>${new Date(n.creado_at).toLocaleDateString('es-AR')}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function enviarNotificacion(e) {
  e.preventDefault();
  const errorEl = document.getElementById('notificacionFormError');
  const okEl = document.getElementById('notificacionFormOk');
  errorEl.classList.add('oculto');
  okEl.classList.add('oculto');

  const cuerpo = {
    titulo: document.getElementById('notificacionTitulo').value.trim(),
    mensaje: document.getElementById('notificacionMensaje').value.trim(),
    tipo: document.getElementById('notificacionTipo').value,
    club_id: document.getElementById('notificacionClub').value || undefined
  };

  try {
    await apiFetch('/liga/notificaciones', { method: 'POST', body: JSON.stringify(cuerpo) });
    okEl.textContent = 'Notificación enviada correctamente.';
    okEl.classList.remove('oculto');
    document.getElementById('formNotificacion').reset();
    cargarNotificaciones();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

// ===================== FINANZAS (Gastos e Ingresos) =====================

function poblarSelectClubesIngreso() {
  const select = document.getElementById('ingresoClub');
  const opciones = clubesCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
  select.innerHTML = '<option value="">Sin asociar a un club</option>' + opciones;
}

// Trae (si todavía no están en caché) los tipos de gasto/ingreso y las
// cuentas configuradas en Configuración, para poblar los desplegables de
// los formularios de Finanzas.
async function asegurarListasFinanzas() {
  try {
    if (!cuentasLigaCache.length) {
      const data = await apiFetch('/liga/configuracion/cuentas');
      cuentasLigaCache = data.cuentas;
    }
  } catch (err) { /* si falla, el select de cuenta queda con la opción por defecto */ }
}

async function poblarSelectFinanzasIngreso() {
  await asegurarListasFinanzas();
  try {
    if (!tiposIngresoCache.length) {
      const data = await apiFetch('/liga/configuracion/tipos-ingreso');
      tiposIngresoCache = data.tipos;
    }
  } catch (err) { /* si falla, el select de tipo queda con la opción por defecto */ }
  document.getElementById('ingresoTipo').innerHTML = '<option value="">Sin clasificar</option>' +
    tiposIngresoCache.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  document.getElementById('ingresoCuenta').innerHTML = '<option value="">Sin especificar</option>' +
    cuentasLigaCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

async function poblarSelectFinanzasGasto() {
  await asegurarListasFinanzas();
  try {
    if (!tiposGastoCache.length) {
      const data = await apiFetch('/liga/configuracion/tipos-gasto');
      tiposGastoCache = data.tipos;
    }
  } catch (err) { /* si falla, el select de tipo queda con la opción por defecto */ }
  document.getElementById('gastoTipo').innerHTML = '<option value="">Sin clasificar</option>' +
    tiposGastoCache.map((t) => `<option value="${t.id}">${escapeHtml(t.nombre)}</option>`).join('');
  document.getElementById('gastoCuenta').innerHTML = '<option value="">Sin especificar</option>' +
    cuentasLigaCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
}

function formatearMonto(monto) {
  return '$' + Number(monto).toLocaleString('es-AR', { minimumFractionDigits: 2 });
}

async function cargarFinanzas() {
  await Promise.all([cargarIngresos(), cargarGastos()]);
}

async function cargarIngresos() {
  const tbody = document.getElementById('tablaIngresos');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/ingresos');
    const ingresos = data.ingresos;
    const total = ingresos.reduce((acc, i) => acc + Number(i.monto), 0);
    document.getElementById('totalIngresos').textContent = formatearMonto(total);

    if (!ingresos.length) {
      tbody.innerHTML = '<tr><td colspan="7">Todavía no cargaste ningún ingreso.</td></tr>';
      return;
    }
    tbody.innerHTML = ingresos.map((i) => `
      <tr>
        <td>${escapeHtml(i.concepto)}</td>
        <td>${escapeHtml(i.club_nombre || '-')}</td>
        <td>${escapeHtml(i.tipo_ingreso_nombre || '-')}</td>
        <td>${escapeHtml(i.cuenta_nombre || '-')}</td>
        <td>${formatearMonto(i.monto)}</td>
        <td>${new Date(i.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="borrarIngreso('${i.id}')">Borrar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarIngreso(e) {
  e.preventDefault();
  const errorEl = document.getElementById('ingresoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    concepto: document.getElementById('ingresoConcepto').value.trim(),
    monto: document.getElementById('ingresoMonto').value,
    fecha: document.getElementById('ingresoFecha').value || undefined,
    club_id: document.getElementById('ingresoClub').value || undefined,
    tipo_ingreso_id: document.getElementById('ingresoTipo').value || undefined,
    cuenta_id: document.getElementById('ingresoCuenta').value || undefined
  };

  try {
    await apiFetch('/liga/ingresos', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formIngreso').classList.add('oculto');
    cargarIngresos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function borrarIngreso(ingresoId) {
  if (!confirm('¿Borrar este ingreso?')) return;
  try {
    await apiFetch(`/liga/ingresos/${ingresoId}`, { method: 'DELETE' });
    cargarIngresos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function cargarGastos() {
  const tbody = document.getElementById('tablaGastos');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/gastos');
    const gastos = data.gastos;
    const total = gastos.reduce((acc, g) => acc + Number(g.monto), 0);
    document.getElementById('totalGastos').textContent = formatearMonto(total);

    if (!gastos.length) {
      tbody.innerHTML = '<tr><td colspan="6">Todavía no cargaste ningún gasto.</td></tr>';
      return;
    }
    tbody.innerHTML = gastos.map((g) => `
      <tr>
        <td>${escapeHtml(g.concepto)}</td>
        <td>${escapeHtml(g.tipo_gasto_nombre || g.categoria || '-')}</td>
        <td>${escapeHtml(g.cuenta_nombre || '-')}</td>
        <td>${formatearMonto(g.monto)}</td>
        <td>${new Date(g.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="borrarGasto('${g.id}')">Borrar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarGasto(e) {
  e.preventDefault();
  const errorEl = document.getElementById('gastoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    concepto: document.getElementById('gastoConcepto').value.trim(),
    monto: document.getElementById('gastoMonto').value,
    fecha: document.getElementById('gastoFecha').value || undefined,
    tipo_gasto_id: document.getElementById('gastoTipo').value || undefined,
    cuenta_id: document.getElementById('gastoCuenta').value || undefined
  };

  try {
    await apiFetch('/liga/gastos', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formGasto').classList.add('oculto');
    cargarGastos();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function borrarGasto(gastoId) {
  if (!confirm('¿Borrar este gasto?')) return;
  try {
    await apiFetch(`/liga/gastos/${gastoId}`, { method: 'DELETE' });
    cargarGastos();
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ===================== AGENDA =====================

async function cargarAgenda() {
  const tbody = document.getElementById('tablaAgenda');
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
  try {
    const data = await apiFetch('/liga/agenda');
    const eventos = data.eventos;
    if (!eventos.length) {
      tbody.innerHTML = '<tr><td colspan="5">Todavía no cargaste ningún evento.</td></tr>';
      return;
    }
    tbody.innerHTML = eventos.map((ev) => `
      <tr>
        <td>${new Date(ev.fecha).toLocaleDateString('es-AR', { timeZone: 'UTC' })}${ev.hora ? ' ' + ev.hora.slice(0, 5) : ''}</td>
        <td>${escapeHtml(ev.titulo)}</td>
        <td>${escapeHtml(ev.tipo)}</td>
        <td>${escapeHtml(ev.lugar || '-')}</td>
        <td><button class="btn btn-peligro btn-pequeno" onclick="borrarEvento('${ev.id}')">Borrar</button></td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5">Error: ${escapeHtml(err.message)}</td></tr>`;
  }
}

async function guardarEvento(e) {
  e.preventDefault();
  const errorEl = document.getElementById('eventoFormError');
  errorEl.classList.add('oculto');

  const cuerpo = {
    titulo: document.getElementById('eventoTitulo').value.trim(),
    tipo: document.getElementById('eventoTipo').value,
    fecha: document.getElementById('eventoFecha').value,
    hora: document.getElementById('eventoHora').value || undefined,
    lugar: document.getElementById('eventoLugar').value.trim() || undefined,
    descripcion: document.getElementById('eventoDescripcion').value.trim() || undefined
  };

  try {
    await apiFetch('/liga/agenda', { method: 'POST', body: JSON.stringify(cuerpo) });
    document.getElementById('formEvento').classList.add('oculto');
    cargarAgenda();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('oculto');
  }
}

async function borrarEvento(eventoId) {
  if (!confirm('¿Borrar este evento?')) return;
  try {
    await apiFetch(`/liga/agenda/${eventoId}`, { method: 'DELETE' });
    cargarAgenda();
  } catch (err) {
    alert('Error: ' + err.message);
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

// Chip de color de marca de un club, para usar junto a su nombre en
// listados (equipos, fixture, tabla de posiciones) — así el color del club
// se ve en toda la plataforma y no solo en su propio encabezado.
function swatch(color) {
  if (!color) return '';
  return `<span class="club-swatch" style="background:${color};"></span>`;
}

document.addEventListener('DOMContentLoaded', init);
