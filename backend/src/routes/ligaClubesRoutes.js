const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const XLSX = require('xlsx');
const router = express.Router();

const { query, getClient } = require('../db');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Todas las rutas usan req.ligaId, calculado por el middleware resolveLigaId
// (montado en app.js antes de este router).

// Chequea si ya existe otro club con el mismo nombre (comparación insensible
// a mayúsculas/espacios) DENTRO de mi Liga — el mismo nombre puede existir
// libremente en otra Liga, pero no dos veces en la misma.
async function nombreYaExisteEnLiga(nombre, ligaId, excluirClubId) {
  const { rows } = await query(
    `SELECT 1 FROM club_liga cl
     JOIN clubes c ON c.id = cl.club_id
     WHERE cl.liga_id = $1 AND LOWER(TRIM(c.nombre)) = LOWER(TRIM($2))
       AND ($3::uuid IS NULL OR c.id != $3::uuid)
     LIMIT 1`,
    [ligaId, nombre, excluirClubId || null]
  );
  return !!rows[0];
}

// GET /liga/clubes — clubes que participan en MI liga, con búsqueda y
// paginación (50 por página por defecto).
router.get('/', async (req, res) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(200, Math.max(1, parseInt(req.query.por_pagina, 10) || 50));
    const offset = (pagina - 1) * porPagina;
    const texto = (req.query.q || '').trim();

    const params = [req.ligaId];
    let filtroTexto = '';
    if (texto) {
      params.push(`%${texto}%`);
      filtroTexto = ` AND (c.nombre ILIKE $${params.length} OR c.cuit ILIKE $${params.length})`;
    }

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM club_liga cl JOIN clubes c ON c.id = cl.club_id
       WHERE cl.liga_id = $1${filtroTexto}`,
      params
    );

    params.push(porPagina, offset);
    const { rows } = await query(
      `SELECT c.*, cl.id AS membresia_id, cl.activo AS activo_en_liga, cl.fecha_alta
       FROM club_liga cl
       JOIN clubes c ON c.id = cl.club_id
       WHERE cl.liga_id = $1${filtroTexto}
       ORDER BY c.nombre ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({
      ok: true,
      clubes: rows,
      total: totalResult.rows[0].total,
      pagina,
      por_pagina: porPagina
    });
  } catch (err) {
    console.error('Error en GET /liga/clubes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/clubes/plantilla — descarga la plantilla Excel para carga masiva
router.get('/plantilla', (req, res) => {
  try {
    const encabezados = ['Nombre', 'CUIT', 'Direccion', 'Telefono', 'Email', 'Ciudad', 'Provincia'];
    const filaEjemplo = ['Club Deportivo Ejemplo', '30-12345678-9', 'Av. Siempre Viva 123', '011-4444-5555', 'contacto@club.com', 'La Plata', 'Buenos Aires'];
    const hoja = XLSX.utils.aoa_to_sheet([encabezados, filaEjemplo]);
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, 'Clubes');
    const buffer = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="plantilla-clubes.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Error en GET /liga/clubes/plantilla:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/carga-masiva — sube la plantilla completada (multipart,
// campo "archivo") y da de alta todos los clubes válidos de una vez.
router.post('/carga-masiva', upload.single('archivo'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'Falta el archivo (campo "archivo")' });
  }

  try {
    const libro = XLSX.read(req.file.buffer, { type: 'buffer' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(hoja, { defval: '' });

    const creados = [];
    const omitidos = [];

    for (let i = 0; i < filas.length; i++) {
      const fila = filas[i];
      const nombre = String(fila.Nombre || fila.nombre || '').trim();
      if (!nombre) {
        omitidos.push({ fila: i + 2, motivo: 'Falta el nombre' });
        continue;
      }
      const yaExiste = await nombreYaExisteEnLiga(nombre, req.ligaId);
      if (yaExiste) {
        omitidos.push({ fila: i + 2, nombre, motivo: 'Ya existe un club con ese nombre en tu Liga' });
        continue;
      }

      const cuit = String(fila.CUIT || fila.Cuit || fila.cuit || '').trim() || null;
      const direccion = String(fila.Direccion || fila.Dirección || fila.direccion || '').trim() || null;
      const telefono = String(fila.Telefono || fila.Teléfono || fila.telefono || '').trim() || null;
      const email = String(fila.Email || fila.email || '').trim() || null;
      const ciudad = String(fila.Ciudad || fila.ciudad || '').trim() || null;
      const provincia = String(fila.Provincia || fila.provincia || '').trim() || null;

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const clubResult = await client.query(
          `INSERT INTO clubes (nombre, direccion, telefono, email_contacto, cuit, ciudad, provincia)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [nombre, direccion, telefono, email, cuit, ciudad, provincia]
        );
        const club = clubResult.rows[0];
        await client.query('INSERT INTO club_liga (liga_id, club_id) VALUES ($1, $2)', [req.ligaId, club.id]);
        await client.query('COMMIT');
        creados.push(club);
      } catch (err) {
        await client.query('ROLLBACK');
        omitidos.push({ fila: i + 2, nombre, motivo: 'Error al guardar: ' + err.message });
      } finally {
        client.release();
      }
    }

    res.json({ ok: true, creados: creados.length, omitidos });
  } catch (err) {
    console.error('Error en POST /liga/clubes/carga-masiva:', err);
    res.status(500).json({ ok: false, error: 'No se pudo leer el archivo. ¿Es un Excel válido?' });
  }
});

// POST /liga/clubes — alta de un club NUEVO, que queda automáticamente
// inscripto en mi liga. (Vincular un club ya existente de otra liga es un
// caso que se suma más adelante si hace falta.)
router.post('/', async (req, res) => {
  const {
    nombre, logo_url, direccion, telefono,
    email_contacto, color_primario, color_secundario, cuit, ciudad, provincia
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del club es obligatorio' });
  }

  if (await nombreYaExisteEnLiga(nombre, req.ligaId)) {
    return res.status(409).json({ ok: false, error: `Ya existe un club llamado "${nombre.trim()}" en tu Liga` });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const clubResult = await client.query(
      `INSERT INTO clubes (nombre, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario, cuit, ciudad, provincia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [nombre.trim(), logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null, cuit || null,
       ciudad || null, provincia || null]
    );
    const club = clubResult.rows[0];

    const membresiaResult = await client.query(
      `INSERT INTO club_liga (liga_id, club_id) VALUES ($1, $2) RETURNING *`,
      [req.ligaId, club.id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      ok: true,
      club: {
        ...club,
        membresia_id: membresiaResult.rows[0].id,
        activo_en_liga: membresiaResult.rows[0].activo,
        fecha_alta: membresiaResult.rows[0].fecha_alta
      }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en POST /liga/clubes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

// PUT /liga/clubes/:clubId — edición de los datos de un club (solo si
// participa en MI liga, si no 404 aunque el club exista en la base)
router.put('/:clubId', async (req, res) => {
  const {
    nombre, logo_url, direccion, telefono,
    email_contacto, color_primario, color_secundario, cuit, ciudad, provincia
  } = req.body;

  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ ok: false, error: 'El nombre del club es obligatorio' });
  }

  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    if (await nombreYaExisteEnLiga(nombre, req.ligaId, req.params.clubId)) {
      return res.status(409).json({ ok: false, error: `Ya existe otro club llamado "${nombre.trim()}" en tu Liga` });
    }

    const { rows } = await query(
      `UPDATE clubes SET
         nombre = $1, logo_url = $2, direccion = $3, telefono = $4,
         email_contacto = $5, color_primario = $6, color_secundario = $7, cuit = $8,
         ciudad = $9, provincia = $10,
         actualizado_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [nombre.trim(), logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null, cuit || null,
       ciudad || null, provincia || null,
       req.params.clubId]
    );
    res.json({ ok: true, club: rows[0] });
  } catch (err) {
    console.error('Error en PUT /liga/clubes/:clubId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/clubes/:clubId/activo — activar/desactivar la PARTICIPACIÓN
// de ese club en mi liga (no borra ni afecta al club en sí, que puede seguir
// jugando en otra liga).
router.patch('/:clubId/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const { rows } = await query(
      `UPDATE club_liga SET activo = $1
       WHERE club_id = $2 AND liga_id = $3
       RETURNING *`,
      [activo, req.params.clubId, req.ligaId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    res.json({ ok: true, membresia: rows[0] });
  } catch (err) {
    console.error('Error en PATCH /liga/clubes/:clubId/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/clubes/:clubId — saca al club de MI liga: borra la membresía
// (club_liga) y todas sus inscripciones a categorías de torneos de esta Liga
// (equipos_torneo, lo que en cascada borra también sus partidos y su tabla de
// posiciones). El Club en sí (entidad global) NO se borra — si participa de
// otra Liga, ahí sigue existiendo tal cual.
router.delete('/:clubId', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    await query(
      `DELETE FROM equipos_torneo
       WHERE club_id = $1 AND torneo_id IN (SELECT id FROM torneos WHERE liga_id = $2)`,
      [req.params.clubId, req.ligaId]
    );
    await query('DELETE FROM club_liga WHERE club_id = $1 AND liga_id = $2', [req.params.clubId, req.ligaId]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE /liga/clubes/:clubId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/clubes/:clubId/participaciones — todas las combinaciones
// torneo+categoría en las que ese club tiene un equipo inscripto DENTRO de MI
// liga. Un mismo club puede tener varios equipos a la vez (ej. Baby Fútbol
// Sub 10 y Futsal Primera), esto lo muestra todo junto.
router.get('/:clubId/participaciones', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const { rows } = await query(
      `SELECT et.id AS equipo_torneo_id, et.grupo, et.activo,
              t.id AS torneo_id, t.nombre AS torneo_nombre, t.deporte, t.temporada, t.estado AS torneo_estado,
              cat.id AS categoria_id, cat.nombre AS categoria_nombre
       FROM equipos_torneo et
       JOIN torneos t ON t.id = et.torneo_id
       JOIN categorias cat ON cat.id = et.categoria_id
       WHERE et.club_id = $1 AND t.liga_id = $2
       ORDER BY t.nombre ASC, cat.orden ASC, cat.nombre ASC`,
      [req.params.clubId, req.ligaId]
    );
    res.json({ ok: true, participaciones: rows });
  } catch (err) {
    console.error('Error en GET participaciones de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/inscribir — desde el Home de Clubes: anota este
// club en una categoría puntual de un torneo de MI liga (mismo efecto que
// inscribirlo desde la pantalla de Torneos, pero más cómodo si lo que tenés
// a mano es el Club y querés sumarlo a varios torneos/categorías seguidos).
router.post('/:clubId/inscribir', async (req, res) => {
  const { torneo_id, categoria_id, grupo } = req.body;
  if (!torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan torneo_id y/o categoria_id' });
  }
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const contexto = await query(
      `SELECT 1 FROM torneos t JOIN categorias c ON c.torneo_id = t.id
       WHERE t.id = $1 AND c.id = $2 AND t.liga_id = $3`,
      [torneo_id, categoria_id, req.ligaId]
    );
    if (!contexto.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Esa categoría no pertenece a un torneo de tu Liga' });
    }

    const { rows } = await query(
      `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, grupo)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [torneo_id, categoria_id, req.params.clubId, grupo || null]
    );
    res.status(201).json({ ok: true, equipo: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: 'Ese club ya está inscripto en esa categoría' });
    }
    console.error('Error en POST /liga/clubes/:clubId/inscribir:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/usuarios — la Liga crea el usuario club_admin
// que va a administrar ese club (cargar jugadores, pedir fichajes, mostrar
// carnets el día de partido). El club_admin no queda atado a esta Liga en
// particular (un club puede jugar en más de una), solo al club.
router.post('/:clubId/usuarios', async (req, res) => {
  const { email, password, nombre } = req.body;

  if (!email || !password || !nombre) {
    return res.status(400).json({ ok: false, error: 'Faltan datos obligatorios (email, password, nombre)' });
  }

  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await query(
      `INSERT INTO usuarios (email, password_hash, nombre, rol, club_id, activo)
       VALUES ($1, $2, $3, 'club_admin', $4, TRUE)
       RETURNING id, email, nombre, rol, club_id, activo, creado_at`,
      [email.trim().toLowerCase(), passwordHash, nombre.trim(), req.params.clubId]
    );
    res.status(201).json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en POST /liga/clubes/:clubId/usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
