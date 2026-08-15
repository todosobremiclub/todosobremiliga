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

// ===== RUTAS DE PRUEBA POR ROL (Club / App) =====
// Todavía no construimos esos módulos, quedan estas rutas de prueba hasta
// que lleguemos a esas fases (6 y 7 del roadmap).
app.get('/club/ping', requireAuth, requireRole('super_admin', 'liga_admin', 'club_admin'), (req, res) => {
  res.json({ ok: true, mensaje: 'Acceso Club OK', usuario: req.usuario });
});

app.get('/app/ping', requireAuth, (req, res) => {
  res.json({ ok: true, mensaje: 'Acceso autenticado OK (cualquier rol)', usuario: req.usuario });
});

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

// A medida que avancemos con los próximos módulos (fixtures, resultados,
// Web, Fichajes) se irán agregando acá, siguiendo el mismo patrón:
// app.use('/app', require('./routes/appRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API escuchando en ${PORT}`));
