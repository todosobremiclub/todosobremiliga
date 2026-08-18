const express = require('express');
const router = express.Router();

const { query } = require('../db');

// Todas las rutas usan req.ligaId (calculado por resolveLigaId en app.js).
// Acá vive la "Configuración" de la Liga: categorías de torneo (modalidades)
// con precio, y las listas de tipos de gasto / tipos de ingreso / cuentas
// que después se usan como desplegable en Finanzas.

// ===================== MODALIDADES (Categorías de torneo: Futsal, Senior, Leyendas) =====================

// GET /liga/configuracion/modalidades
router.get('/modalidades', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT m.*, (SELECT COUNT(*)::int FROM club_modalidades cm WHERE cm.modalidad_id = m.id) AS cantidad_clubes
       FROM modalidades_liga m WHERE m.liga_id = $1 ORDER BY m.nombre ASC`,
      [req.ligaId]
    );
    res.json({ ok: true, modalidades: rows });
  } catch (err) {
    console.error('Error en GET /liga/configuracion/modalidades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/configuracion/modalidades
router.post('/modalidades', async (req, res) => {
  const { nombre, precio } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO modalidades_liga (liga_id, nombre, precio) VALUES ($1, $2, $3) RETURNING *`,
      [req.ligaId, nombre.trim(), precio != null && precio !== '' ? precio : null]
    );
    res.status(201).json({ ok: true, modalidad: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe una categoría de torneo con ese nombre' });
    }
    console.error('Error en POST /liga/configuracion/modalidades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/configuracion/modalidades/:id
router.put('/modalidades/:id', async (req, res) => {
  const { nombre, precio, activa } = req.body;
  try {
    const { rows } = await query(
      `UPDATE modalidades_liga SET
         nombre = COALESCE($1, nombre),
         precio = $2,
         activa = COALESCE($3, activa)
       WHERE id = $4 AND liga_id = $5
       RETURNING *`,
      [nombre ? nombre.trim() : null, precio != null && precio !== '' ? precio : null, activa, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada en tu Liga' });
    res.json({ ok: true, modalidad: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ya existe una categoría de torneo con ese nombre' });
    }
    console.error('Error en PUT /liga/configuracion/modalidades/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/configuracion/modalidades/:id
router.delete('/modalidades/:id', async (req, res) => {
  try {
    const { rows } = await query(
      'DELETE FROM modalidades_liga WHERE id = $1 AND liga_id = $2 RETURNING id',
      [req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/modalidades/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===================== TIPOS DE GASTO =====================

router.get('/tipos-gasto', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM tipos_gasto WHERE liga_id = $1 ORDER BY nombre ASC', [req.ligaId]);
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('Error en GET /liga/configuracion/tipos-gasto:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.post('/tipos-gasto', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  try {
    const { rows } = await query(
      'INSERT INTO tipos_gasto (liga_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.ligaId, nombre.trim()]
    );
    res.status(201).json({ ok: true, tipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un tipo de gasto con ese nombre' });
    console.error('Error en POST /liga/configuracion/tipos-gasto:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.put('/tipos-gasto/:id', async (req, res) => {
  const { nombre, activo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE tipos_gasto SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo)
       WHERE id = $3 AND liga_id = $4 RETURNING *`,
      [nombre ? nombre.trim() : null, activo, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true, tipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un tipo de gasto con ese nombre' });
    console.error('Error en PUT /liga/configuracion/tipos-gasto/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.delete('/tipos-gasto/:id', async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM tipos_gasto WHERE id = $1 AND liga_id = $2 RETURNING id', [req.params.id, req.ligaId]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/tipos-gasto/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===================== TIPOS DE INGRESO =====================

router.get('/tipos-ingreso', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM tipos_ingreso WHERE liga_id = $1 ORDER BY nombre ASC', [req.ligaId]);
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('Error en GET /liga/configuracion/tipos-ingreso:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.post('/tipos-ingreso', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  try {
    const { rows } = await query(
      'INSERT INTO tipos_ingreso (liga_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.ligaId, nombre.trim()]
    );
    res.status(201).json({ ok: true, tipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un tipo de ingreso con ese nombre' });
    console.error('Error en POST /liga/configuracion/tipos-ingreso:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.put('/tipos-ingreso/:id', async (req, res) => {
  const { nombre, activo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE tipos_ingreso SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo)
       WHERE id = $3 AND liga_id = $4 RETURNING *`,
      [nombre ? nombre.trim() : null, activo, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true, tipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un tipo de ingreso con ese nombre' });
    console.error('Error en PUT /liga/configuracion/tipos-ingreso/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.delete('/tipos-ingreso/:id', async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM tipos_ingreso WHERE id = $1 AND liga_id = $2 RETURNING id', [req.params.id, req.ligaId]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/tipos-ingreso/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===================== CUENTAS DE LA LIGA =====================

router.get('/cuentas', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM cuentas_liga WHERE liga_id = $1 ORDER BY nombre ASC', [req.ligaId]);
    res.json({ ok: true, cuentas: rows });
  } catch (err) {
    console.error('Error en GET /liga/configuracion/cuentas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.post('/cuentas', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  try {
    const { rows } = await query(
      'INSERT INTO cuentas_liga (liga_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.ligaId, nombre.trim()]
    );
    res.status(201).json({ ok: true, cuenta: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese nombre' });
    console.error('Error en POST /liga/configuracion/cuentas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.put('/cuentas/:id', async (req, res) => {
  const { nombre, activa } = req.body;
  try {
    const { rows } = await query(
      `UPDATE cuentas_liga SET nombre = COALESCE($1, nombre), activa = COALESCE($2, activa)
       WHERE id = $3 AND liga_id = $4 RETURNING *`,
      [nombre ? nombre.trim() : null, activa, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada en tu Liga' });
    res.json({ ok: true, cuenta: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe una cuenta con ese nombre' });
    console.error('Error en PUT /liga/configuracion/cuentas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.delete('/cuentas/:id', async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM cuentas_liga WHERE id = $1 AND liga_id = $2 RETURNING id', [req.params.id, req.ligaId]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrada en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/cuentas/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===================== TIPOS DE CANCHA =====================
// Reemplaza el campo de texto libre "Piso de la cancha" al cargar/editar un
// club: la Liga arma su propia lista (ej: Césped sintético, Cemento,
// Parquet) y se elige de un desplegable.

router.get('/tipos-cancha', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM tipos_cancha WHERE liga_id = $1 ORDER BY nombre ASC', [req.ligaId]);
    res.json({ ok: true, tipos: rows });
  } catch (err) {
    console.error('Error en GET /liga/configuracion/tipos-cancha:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.post('/tipos-cancha', async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  try {
    const { rows } = await query(
      'INSERT INTO tipos_cancha (liga_id, nombre) VALUES ($1, $2) RETURNING *',
      [req.ligaId, nombre.trim()]
    );
    res.status(201).json({ ok: true, tipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un tipo de cancha con ese nombre' });
    console.error('Error en POST /liga/configuracion/tipos-cancha:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.put('/tipos-cancha/:id', async (req, res) => {
  const { nombre, activo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE tipos_cancha SET nombre = COALESCE($1, nombre), activo = COALESCE($2, activo)
       WHERE id = $3 AND liga_id = $4 RETURNING *`,
      [nombre ? nombre.trim() : null, activo, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true, tipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un tipo de cancha con ese nombre' });
    console.error('Error en PUT /liga/configuracion/tipos-cancha/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.delete('/tipos-cancha/:id', async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM tipos_cancha WHERE id = $1 AND liga_id = $2 RETURNING id', [req.params.id, req.ligaId]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/tipos-cancha/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===================== PREDIOS Y CANCHAS PROPIAS DE LA LIGA (opcional) =====================
// Para poder asignarlos después a los partidos del fixture cuando un torneo
// se juega en canchas propias de la Liga (en vez de en las canchas de los clubes).

router.get('/predios', async (req, res) => {
  try {
    const prediosResult = await query('SELECT * FROM predios_liga WHERE liga_id = $1 ORDER BY nombre ASC', [req.ligaId]);
    const canchasResult = await query(
      `SELECT cp.*, tc.nombre AS tipo_cancha_nombre FROM canchas_predio cp
       JOIN predios_liga pr ON pr.id = cp.predio_id
       LEFT JOIN tipos_cancha tc ON tc.id = cp.tipo_cancha_id
       WHERE pr.liga_id = $1 ORDER BY cp.nombre ASC`,
      [req.ligaId]
    );
    const predios = prediosResult.rows.map((p) => ({
      ...p,
      canchas: canchasResult.rows.filter((c) => c.predio_id === p.id)
    }));
    res.json({ ok: true, predios });
  } catch (err) {
    console.error('Error en GET /liga/configuracion/predios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.post('/predios', async (req, res) => {
  const { nombre, direccion } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'Falta el nombre' });
  try {
    const { rows } = await query(
      'INSERT INTO predios_liga (liga_id, nombre, direccion) VALUES ($1, $2, $3) RETURNING *',
      [req.ligaId, nombre.trim(), direccion || null]
    );
    res.status(201).json({ ok: true, predio: { ...rows[0], canchas: [] } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un predio con ese nombre' });
    console.error('Error en POST /liga/configuracion/predios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.put('/predios/:id', async (req, res) => {
  const { nombre, direccion, activo } = req.body;
  try {
    const { rows } = await query(
      `UPDATE predios_liga SET nombre = COALESCE($1, nombre), direccion = $2, activo = COALESCE($3, activo)
       WHERE id = $4 AND liga_id = $5 RETURNING *`,
      [nombre ? nombre.trim() : null, direccion || null, activo, req.params.id, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true, predio: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ ok: false, error: 'Ya existe un predio con ese nombre' });
    console.error('Error en PUT /liga/configuracion/predios/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.delete('/predios/:id', async (req, res) => {
  try {
    const { rows } = await query('DELETE FROM predios_liga WHERE id = $1 AND liga_id = $2 RETURNING id', [req.params.id, req.ligaId]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'No encontrado en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/predios/:id:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Chequea que un predio pertenezca a mi Liga.
async function buscarPredioDeMiLiga(predioId, ligaId) {
  const { rows } = await query('SELECT * FROM predios_liga WHERE id = $1 AND liga_id = $2', [predioId, ligaId]);
  return rows[0] || null;
}

router.post('/predios/:predioId/canchas', async (req, res) => {
  const { nombre, tipo_techo, tamanio, tipo_cancha_id } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ ok: false, error: 'Falta el nombre de la cancha' });
  try {
    const predio = await buscarPredioDeMiLiga(req.params.predioId, req.ligaId);
    if (!predio) return res.status(404).json({ ok: false, error: 'Predio no encontrado en tu Liga' });
    const { rows } = await query(
      `INSERT INTO canchas_predio (predio_id, nombre, tipo_techo, tamanio, tipo_cancha_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.predioId, nombre.trim(), tipo_techo === 'techada' ? 'techada' : 'aire_libre', tamanio || null, tipo_cancha_id || null]
    );
    res.status(201).json({ ok: true, cancha: rows[0] });
  } catch (err) {
    console.error('Error en POST /liga/configuracion/predios/:predioId/canchas:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.put('/predios/:predioId/canchas/:canchaId', async (req, res) => {
  const { nombre, tipo_techo, tamanio, tipo_cancha_id, activa } = req.body;
  try {
    const predio = await buscarPredioDeMiLiga(req.params.predioId, req.ligaId);
    if (!predio) return res.status(404).json({ ok: false, error: 'Predio no encontrado en tu Liga' });
    const { rows } = await query(
      `UPDATE canchas_predio SET
         nombre = COALESCE($1, nombre),
         tipo_techo = COALESCE($2, tipo_techo),
         tamanio = $3, tipo_cancha_id = $4, activa = COALESCE($5, activa)
       WHERE id = $6 AND predio_id = $7 RETURNING *`,
      [nombre ? nombre.trim() : null, tipo_techo === 'techada' ? 'techada' : (tipo_techo === 'aire_libre' ? 'aire_libre' : null),
       tamanio || null, tipo_cancha_id || null, activa, req.params.canchaId, req.params.predioId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Cancha no encontrada en ese predio' });
    res.json({ ok: true, cancha: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/configuracion/predios/:predioId/canchas/:canchaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

router.delete('/predios/:predioId/canchas/:canchaId', async (req, res) => {
  try {
    const predio = await buscarPredioDeMiLiga(req.params.predioId, req.ligaId);
    if (!predio) return res.status(404).json({ ok: false, error: 'Predio no encontrado en tu Liga' });
    const { rows } = await query(
      'DELETE FROM canchas_predio WHERE id = $1 AND predio_id = $2 RETURNING id',
      [req.params.canchaId, req.params.predioId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Cancha no encontrada en ese predio' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/configuracion/predios/:predioId/canchas/:canchaId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
