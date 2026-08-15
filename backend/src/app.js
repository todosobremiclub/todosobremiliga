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

// ===== ROUTES =====
// A medida que avancemos con cada módulo (Super Admin, Liga, Web, Fichajes)
// se irán agregando acá, siguiendo el mismo patrón que TSMC:
// app.use('/admin', require('./routes/adminRoutes'));
// app.use('/liga', require('./routes/ligaRoutes'));
// app.use('/app', require('./routes/appRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API escuchando en ${PORT}`));
