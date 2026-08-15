require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const { query } = require('./db');

const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Sirve el frontend estático (admin / liga / web / app se irán agregando acá)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (_req, res) => {
  res.json({ ok: true, servicio: 'todosobremiliga-backend' });
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

// Lado Liga (liga_admin): aprobar/rechazar fichajes y verificar carnets el
// día de partido, filtrado automáticamente a SU liga.
app.use('/liga/fichajes', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaFichajesRoutes'));
app.use('/liga/carnets', requireAuth, requireRole('super_admin', 'liga_admin'), resolveLigaId, require('./routes/ligaCarnetsRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API escuchando en ${PORT}`));
