require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { query } = require('./db');

const app = express();

app.use(cors());
// Límite subido a 8mb para poder aceptar logos convertidos a base64 desde el
// navegador (Panel Super Admin) sin depender de un servicio externo de archivos.
app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));

// Sirve el frontend estático (admin / liga / web / app se irán agregando acá)
app.use(express.static(path.join(__dirname, '..', 'public')));

// La raíz del dominio (www.tsml.com.ar) redirige directo al login en vez de
// mostrar una respuesta técnica de "servicio activo" — eso queda solo en /health.
app.get('/', (_req, res) => {
  res.redirect('/login.html');
});

// ===== HEALTH =====
// /health también valida que la conexión a la base de datos funcione,
// para detectar problemas de configuración apenas se despliega en Render.
app.get('/health', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, db: 'conectada' });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'error', detalle: err.message });
  }
});

// ===== AUTH =====
app.use('/auth', require('./routes/authRoutes'));

const requireAuth = require('./middleware/requireAuth');
const requireRole = require('./middleware/requireRole');

// ===== MÓDULO SUPER ADMIN =====
// Alta/gestión de Ligas y de sus usuarios. Todo lo que cuelgue de /admin
// requiere estar logueado y tener rol super_admin.
app.use('/admin/ligas', requireAuth, requireRole('super_admin'), require('./routes/adminLigasRoutes'));
app.use('/admin/usuarios', requireAuth, requireRole('super_admin'), require('./routes/adminUsuariosRoutes'));
app.use('/admin/noticias', requireAuth, requireRole('super_admin'), require('./routes/adminNoticiasRoutes'));

// ===== MÓDULO LIGA =====
// Todo lo que cuelgue de /liga requiere estar logueado como liga_admin (o
// super_admin operando en nombre de una liga) y queda automáticamente
// filtrado a la Liga correspondiente (ver middleware resolveLigaId).
const resolveLigaId = require('./middleware/resolveLigaId');
app.use('/liga/clubes', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaClubesRoutes'));
app.use('/liga/torneos', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaTorneosRoutes'));
// Se monta en el mismo prefijo que ligaTorneosRoutes: maneja las sub-rutas de
// equipos inscriptos, fixture, resultados y tabla de posiciones.
app.use('/liga/torneos', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaFixtureRoutes'));
// Datos de marca (nombre/logo/colores) de la propia Liga, solo lectura.
app.use('/liga/perfil', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaPerfilRoutes'));
// Postulaciones de Clubes recibidas por el formulario público (QR/link), a aceptar o rechazar.
app.use('/liga/postulaciones', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaPostulacionesRoutes'));
// Configuración de la Liga: categorías de torneo (modalidades) con precio,
// y las listas de tipos de gasto / tipos de ingreso / cuentas.
app.use('/liga/configuracion', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaConfiguracionRoutes'));
// Cobros: conceptos de pago por torneo (inscripción/mensual/por partido),
// deudas de los clubes y registro de pagos (soporta pagos parciales).
app.use('/liga/cobros', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaCobrosRoutes'));

// ===== MÓDULO WEB (público, sin login) =====
// Lo que consume el sitio web público de cada Liga: info de la liga,
// torneos, categorías, tabla de posiciones y fixture.
app.use('/web', require('./routes/webRoutes'));

// ===== MÓDULO DE FICHAJES =====
// Lado Club (club_admin): carga de jugadores y solicitud de fichajes, queda
// filtrado automáticamente a SU club (ver middleware resolveClubId).
const resolveClubId = require('./middleware/resolveClubId');
app.use('/club/jugadores', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubJugadoresRoutes'));
// Se monta en el mismo prefijo: agrega POST /club/jugadores/:jugadorId/fichajes y GET /club/fichajes.
app.use('/club/fichajes', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubFichajesRoutes'));
app.use('/club/jugadores', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubFichajesRoutes'));
// Ligas en las que participa mi club (para armar el desplegable al pedir un fichaje).
app.use('/club/ligas', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubLigasRoutes'));
// Torneos en los que participa mi club (pestaña "Mis Torneos" del Panel Club).
app.use('/club/torneos', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubTorneosRoutes'));
// Documentos del club (los puede subir tanto el club_admin como la Liga).
app.use('/club/documentos', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubDocumentosRoutes'));
// Configuración propia del Club: Actividades y Categorías de socio, que
// después aparecen como desplegable al cargar un jugador y en el
// formulario público de autorregistro de socios (QR/link).
app.use('/club/configuracion', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubConfiguracionRoutes'));

// Lado Liga (liga_admin): aprobar/rechazar fichajes y verificar carnets el
// día de partido, filtrado automáticamente a SU liga.
app.use('/liga/fichajes', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaFichajesRoutes'));
app.use('/liga/carnets', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaCarnetsRoutes'));

// ===== MÓDULO NOTICIAS Y NOTIFICACIONES =====
// Lado Liga: crear/publicar noticias y enviar notificaciones a uno o todos
// sus clubes. Lado Club: ver las notificaciones que le llegaron.
app.use('/liga/noticias', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaNoticiasRoutes'));
app.use('/liga/notificaciones', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaNotificacionesRoutes'));
app.use('/club/notificaciones', requireAuth, requireRole('super_admin', 'club_admin'), resolveClubId, require('./routes/clubNotificacionesRoutes'));

// ===== MÓDULO GASTOS / INGRESOS / AGENDA (contabilidad y agenda de la Liga) =====
app.use('/liga/gastos', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaGastosRoutes'));
app.use('/liga/ingresos', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaIngresosRoutes'));
app.use('/liga/agenda', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaAgendaRoutes'));
// Pestaña "Reportes": clubes por torneo, recaudado vs gastos, esperado vs
// recaudado y total de fichados, todo a nivel de toda la Liga.
app.use('/liga/reportes', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaReportesRoutes'));

// Job programado: genera automáticamente la cuota mensual de Cobros el
// primer día de cada mes (ver src/jobs/cobrosMensual.js).
const { programarGeneracionMensualAutomatica } = require('./jobs/cobrosMensual');
programarGeneracionMensualAutomatica();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API escuchando en ${PORT}`));
