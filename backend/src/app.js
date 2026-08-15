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

// ===== RUTAS DE PRUEBA POR ROL =====
// Sirven para validar el circuito login -> token -> permisos de punta a punta
// antes de construir el CRUD real de cada módulo. Se van a ir reemplazando
// por las rutas reales de cada fase (adminRoutes, ligaRoutes, clubRoutes, appRoutes).
app.get('/admin/ping', requireAuth, requireRole('super_admin'), (req, res) => {
  res.json({ ok: true, mensaje: 'Acceso Super Admin OK', usuario: req.usuario });
});

app.get('/liga/ping', requireAuth, requireRole('super_admin', 'liga_admin'), (req, res) => {
  res.json({ ok: true, mensaje: 'Acceso Liga OK', usuario: req.usuario });
});

app.get('/club/ping', requireAuth, requireRole('super_admin', 'liga_admin', 'club_admin'), (req, res) => {
  res.json({ ok: true, mensaje: 'Acceso Club OK', usuario: req.usuario });
});

app.get('/app/ping', requireAuth, (req, res) => {
  res.json({ ok: true, mensaje: 'Acceso autenticado OK (cualquier rol)', usuario: req.usuario });
});

// ===== ROUTES =====
// A medida que avancemos con cada módulo (Super Admin, Liga, Web, Fichajes)
// se irán agregando acá, siguiendo el mismo patrón que TSMC:
// app.use('/admin', require('./routes/adminRoutes'));
// app.use('/liga', require('./routes/ligaRoutes'));
// app.use('/app', require('./routes/appRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API escuchando en ${PORT}`));
