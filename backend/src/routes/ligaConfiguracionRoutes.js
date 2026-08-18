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

module.exports = router;
