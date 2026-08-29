const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');

const { query } = require('../db');

// Solo liga_admin/super_admin pueden dar de alta, editar o asignar. Los
// propios usuarios "autoridad"/"arbitro" solo pueden consultar sus propias
// asignaciones (ver GET /mis-asignaciones más abajo).
function requiereGestionDeRoles(req, res, next) {
  if (req.usuario.rol !== 'liga_admin' && req.usuario.rol !== 'super_admin') {
    return res.status(403).json({ ok: false, error: 'No autorizado para gestionar roles' });
  }
  next();
}

// ============================================================================
// AUTORIDAD — concepto nuevo: usuarios con rol "autoridad", con uno o más
// alcances (Torneo / División / Categoría) donde pueden cargar resultados.
// ============================================================================

async function buscarAutoridadDeMiLiga(usuarioId, ligaId) {
  const { rows } = await query(
    `SELECT * FROM usuarios WHERE id = $1 AND liga_id = $2 AND rol = 'autoridad'`,
    [usuarioId, ligaId]
  );
  return rows[0] || null;
}

// GET /liga/roles/autoridades
router.get('/autoridades', requiereGestionDeRoles, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, nombre, rol, activo, ultimo_login, creado_at
       FROM usuarios WHERE liga_id = $1 AND rol = 'autoridad'
       ORDER BY creado_at DESC`,
      [req.ligaId]
    );
    res.json({ ok: true, autoridades: rows });
  } catch (err) {
    console.error('Error en GET /liga/roles/autoridades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/roles/autoridades — crea un usuario Autoridad para MI liga.
router.post('/autoridades', requiereGestionDeRoles, async (req, res) => {
  const { email, password, nombre } = req.body;
  if (!email || !password || !nombre) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (email, password, nombre)' });
  }
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, liga_id, activo)
       VALUES ($1, $2, $3, 'autoridad', $4, TRUE)
       RETURNING id, email, nombre, rol, activo, creado_at`,
      [email.trim().toLowerCase(), passwordHash, nombre.trim(), req.ligaId]
    );
    res.status(201).json({ ok: true, autoridad: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en POST /liga/roles/autoridades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/roles/autoridades/:usuarioId — edita nombre/email
router.put('/autoridades/:usuarioId', requiereGestionDeRoles, async (req, res) => {
  const { nombre, email } = req.body;
  try {
    const autoridad = await buscarAutoridadDeMiLiga(req.params.usuarioId, req.ligaId);
    if (!autoridad) return res.status(404).json({ ok: false, error: 'Autoridad no encontrada en tu Liga' });

    const { rows } = await query(
      `UPDATE usuarios SET nombre = COALESCE($1, nombre), email = COALESCE($2, email)
       WHERE id = $3 RETURNING id, email, nombre, rol, activo`,
      [nombre && nombre.trim() ? nombre.trim() : null, email && email.trim() ? email.trim().toLowerCase() : null, req.params.usuarioId]
    );
    res.json({ ok: true, autoridad: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en PUT /liga/roles/autoridades/:usuarioId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/roles/autoridades/:usuarioId/password
router.patch('/autoridades/:usuarioId/password', requiereGestionDeRoles, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  try {
    const autoridad = await buscarAutoridadDeMiLiga(req.params.usuarioId, req.ligaId);
    if (!autoridad) return res.status(404).json({ ok: false, error: 'Autoridad no encontrada en tu Liga' });

    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.usuarioId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PATCH .../autoridades/:usuarioId/password:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/roles/autoridades/:usuarioId/activo
router.patch('/autoridades/:usuarioId/activo', requiereGestionDeRoles, async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const autoridad = await buscarAutoridadDeMiLiga(req.params.usuarioId, req.ligaId);
    if (!autoridad) return res.status(404).json({ ok: false, error: 'Autoridad no encontrada en tu Liga' });

    const { rows } = await query('UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, email, nombre, rol, activo', [activo, req.params.usuarioId]);
    res.json({ ok: true, autoridad: rows[0] });
  } catch (err) {
    console.error('Error en PATCH .../autoridades/:usuarioId/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/roles/autoridades/:usuarioId
router.delete('/autoridades/:usuarioId', requiereGestionDeRoles, async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM usuarios WHERE id = $1 AND liga_id = $2 AND rol = 'autoridad' RETURNING id`,
      [req.params.usuarioId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Autoridad no encontrada en tu Liga' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/roles/autoridades/:usuarioId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ----- Asignaciones de alcance de una Autoridad -----

// GET /liga/roles/autoridades/:usuarioId/asignaciones
router.get('/autoridades/:usuarioId/asignaciones', requiereGestionDeRoles, async (req, res) => {
  try {
    const autoridad = await buscarAutoridadDeMiLiga(req.params.usuarioId, req.ligaId);
    if (!autoridad) return res.status(404).json({ ok: false, error: 'Autoridad no encontrada en tu Liga' });

    const { rows } = await query(
      `SELECT a.id, a.torneo_id, a.categoria_id, a.subcategoria_id,
              t.nombre AS torneo_nombre, c.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre
       FROM liga_autoridad_asignaciones a
       JOIN torneos t ON t.id = a.torneo_id
       LEFT JOIN categorias c ON c.id = a.categoria_id
       LEFT JOIN categoria_subcategorias sc ON sc.id = a.subcategoria_id
       WHERE a.usuario_id = $1 AND a.liga_id = $2
       ORDER BY a.creado_at DESC`,
      [req.params.usuarioId, req.ligaId]
    );
    res.json({ ok: true, asignaciones: rows });
  } catch (err) {
    console.error('Error en GET .../asignaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/roles/autoridades/:usuarioId/asignaciones
router.post('/autoridades/:usuarioId/asignaciones', requiereGestionDeRoles, async (req, res) => {
  const { torneo_id, categoria_id, subcategoria_id } = req.body;
  if (!torneo_id) return res.status(400).json({ ok: false, error: 'Falta torneo_id' });
  try {
    const autoridad = await buscarAutoridadDeMiLiga(req.params.usuarioId, req.ligaId);
    if (!autoridad) return res.status(404).json({ ok: false, error: 'Autoridad no encontrada en tu Liga' });

    const torneo = await query('SELECT 1 FROM torneos WHERE id = $1 AND liga_id = $2', [torneo_id, req.ligaId]);
    if (!torneo.rows[0]) return res.status(404).json({ ok: false, error: 'Torneo no encontrado en tu Liga' });

    if (categoria_id) {
      const categoria = await query('SELECT 1 FROM categorias WHERE id = $1 AND torneo_id = $2', [categoria_id, torneo_id]);
      if (!categoria.rows[0]) return res.status(404).json({ ok: false, error: 'División no encontrada en ese Torneo' });
    }
    if (subcategoria_id) {
      if (!categoria_id) return res.status(400).json({ ok: false, error: 'Para asignar una Categoría puntual, indicá también su División' });
      const sub = await query('SELECT 1 FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2', [subcategoria_id, categoria_id]);
      if (!sub.rows[0]) return res.status(404).json({ ok: false, error: 'Categoría no encontrada en esa División' });
    }

    const existente = await query(
      `SELECT id FROM liga_autoridad_asignaciones
       WHERE usuario_id = $1 AND torneo_id = $2
         AND categoria_id IS NOT DISTINCT FROM $3
         AND subcategoria_id IS NOT DISTINCT FROM $4`,
      [req.params.usuarioId, torneo_id, categoria_id || null, subcategoria_id || null]
    );
    if (existente.rows[0]) {
      return res.status(409).json({ ok: false, error: 'Ese alcance ya estaba asignado' });
    }

    const { rows } = await query(
      `INSERT INTO liga_autoridad_asignaciones (usuario_id, liga_id, torneo_id, categoria_id, subcategoria_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, torneo_id, categoria_id, subcategoria_id`,
      [req.params.usuarioId, req.ligaId, torneo_id, categoria_id || null, subcategoria_id || null]
    );
    res.status(201).json({ ok: true, asignacion: rows[0] });
  } catch (err) {
    console.error('Error en POST .../asignaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/roles/autoridades/:usuarioId/asignaciones/:asignacionId
router.delete('/autoridades/:usuarioId/asignaciones/:asignacionId', requiereGestionDeRoles, async (req, res) => {
  try {
    const { rows } = await query(
      `DELETE FROM liga_autoridad_asignaciones WHERE id = $1 AND usuario_id = $2 AND liga_id = $3 RETURNING id`,
      [req.params.asignacionId, req.params.usuarioId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Asignación no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE .../asignaciones/:asignacionId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ============================================================================
// ÁRBITRO — NO es un concepto nuevo: la Liga ya tiene un padrón de árbitros
// (arbitros_liga, Configuración → Árbitros) que se asigna a partidos
// puntuales (partido_arbitros). Acá solo se agrega la posibilidad de darle
// a un árbitro del padrón un login para la futura app (usuarios.rol =
// 'arbitro', vinculado por arbitros_liga.usuario_id).
// ============================================================================

async function buscarArbitroDeMiLiga(arbitroLigaId, ligaId) {
  const { rows } = await query('SELECT * FROM arbitros_liga WHERE id = $1 AND liga_id = $2', [arbitroLigaId, ligaId]);
  return rows[0] || null;
}

// GET /liga/roles/arbitros — el padrón completo, con si tiene acceso o no.
router.get('/arbitros', requiereGestionDeRoles, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT al.id, al.nombre, al.apellido, al.telefono, al.tipo, al.activo,
              u.id AS usuario_id, u.email, u.activo AS acceso_activo
       FROM arbitros_liga al
       LEFT JOIN usuarios u ON u.id = al.usuario_id
       WHERE al.liga_id = $1
       ORDER BY al.apellido ASC, al.nombre ASC`,
      [req.ligaId]
    );
    res.json({ ok: true, arbitros: rows });
  } catch (err) {
    console.error('Error en GET /liga/roles/arbitros:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/roles/arbitros/:arbitroLigaId/acceso — le da login de app a un
// árbitro que ya está en el padrón.
router.post('/arbitros/:arbitroLigaId/acceso', requiereGestionDeRoles, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (email, password)' });
  }
  try {
    const arbitro = await buscarArbitroDeMiLiga(req.params.arbitroLigaId, req.ligaId);
    if (!arbitro) return res.status(404).json({ ok: false, error: 'Árbitro no encontrado en tu Liga' });
    if (arbitro.usuario_id) return res.status(409).json({ ok: false, error: 'Este árbitro ya tiene acceso creado' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, liga_id, activo)
       VALUES ($1, $2, $3, 'arbitro', $4, TRUE)
       RETURNING id, email, nombre, rol, activo`,
      [email.trim().toLowerCase(), passwordHash, `${arbitro.nombre} ${arbitro.apellido}`.trim(), req.ligaId]
    );
    await query('UPDATE arbitros_liga SET usuario_id = $1 WHERE id = $2', [rows[0].id, req.params.arbitroLigaId]);
    res.status(201).json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en POST .../arbitros/:arbitroLigaId/acceso:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/roles/arbitros/:arbitroLigaId/acceso/password
router.patch('/arbitros/:arbitroLigaId/acceso/password', requiereGestionDeRoles, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  try {
    const arbitro = await buscarArbitroDeMiLiga(req.params.arbitroLigaId, req.ligaId);
    if (!arbitro || !arbitro.usuario_id) return res.status(404).json({ ok: false, error: 'Este árbitro no tiene acceso creado' });

    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [passwordHash, arbitro.usuario_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PATCH .../arbitros/:arbitroLigaId/acceso/password:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/roles/arbitros/:arbitroLigaId/acceso/activo
router.patch('/arbitros/:arbitroLigaId/acceso/activo', requiereGestionDeRoles, async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const arbitro = await buscarArbitroDeMiLiga(req.params.arbitroLigaId, req.ligaId);
    if (!arbitro || !arbitro.usuario_id) return res.status(404).json({ ok: false, error: 'Este árbitro no tiene acceso creado' });

    await query('UPDATE usuarios SET activo = $1 WHERE id = $2', [activo, arbitro.usuario_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PATCH .../arbitros/:arbitroLigaId/acceso/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/roles/arbitros/:arbitroLigaId/acceso — revoca el acceso (el
// árbitro sigue existiendo en el padrón, solo pierde el login).
router.delete('/arbitros/:arbitroLigaId/acceso', requiereGestionDeRoles, async (req, res) => {
  try {
    const arbitro = await buscarArbitroDeMiLiga(req.params.arbitroLigaId, req.ligaId);
    if (!arbitro || !arbitro.usuario_id) return res.status(404).json({ ok: false, error: 'Este árbitro no tiene acceso creado' });

    await query('DELETE FROM usuarios WHERE id = $1', [arbitro.usuario_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE .../arbitros/:arbitroLigaId/acceso:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ============================================================================
// GET /liga/roles/mis-asignaciones — autoconsulta para Autoridad/Árbitro
// (esto es lo que va a usar la futura app; ya queda disponible desde ahora).
// ============================================================================
router.get('/mis-asignaciones', async (req, res) => {
  if (req.usuario.rol === 'autoridad') {
    const { rows } = await query(
      `SELECT a.id, a.torneo_id, a.categoria_id, a.subcategoria_id,
              t.nombre AS torneo_nombre, c.nombre AS categoria_nombre, sc.nombre AS subcategoria_nombre
       FROM liga_autoridad_asignaciones a
       JOIN torneos t ON t.id = a.torneo_id
       LEFT JOIN categorias c ON c.id = a.categoria_id
       LEFT JOIN categoria_subcategorias sc ON sc.id = a.subcategoria_id
       WHERE a.usuario_id = $1
       ORDER BY a.creado_at DESC`,
      [req.usuario.id]
    );
    return res.json({ ok: true, rol: 'autoridad', asignaciones: rows });
  }

  if (req.usuario.rol === 'arbitro') {
    const { rows } = await query(
      `SELECT p.id AS partido_id, p.fecha, p.hora, p.sede, p.jornada, p.estado,
              t.nombre AS torneo_nombre, c.nombre AS categoria_nombre,
              el.nombre AS equipo_local_nombre, ev.nombre AS equipo_visitante_nombre
       FROM arbitros_liga al
       JOIN partido_arbitros pa ON pa.arbitro_id = al.id
       JOIN partidos p ON p.id = pa.partido_id
       JOIN torneos t ON t.id = p.torneo_id
       JOIN categorias c ON c.id = p.categoria_id
       JOIN equipos_torneo etl ON etl.id = p.equipo_local_id
       JOIN clubes el ON el.id = etl.club_id
       JOIN equipos_torneo etv ON etv.id = p.equipo_visitante_id
       JOIN clubes ev ON ev.id = etv.club_id
       WHERE al.usuario_id = $1
       ORDER BY p.fecha NULLS LAST, p.hora NULLS LAST`,
      [req.usuario.id]
    );
    return res.json({ ok: true, rol: 'arbitro', partidos: rows });
  }

  // liga_admin/super_admin no tienen "mis asignaciones" propias.
  res.json({ ok: true, rol: req.usuario.rol, asignaciones: [], partidos: [] });
});

module.exports = router;
