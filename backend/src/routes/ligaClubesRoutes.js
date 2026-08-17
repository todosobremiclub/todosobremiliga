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
    const porPagina = Math.min(200, Math.max(1, parseInt(req.query.por_pagina, 10) || 25));
    const offset = (pagina - 1) * porPagina;
    const texto = (req.query.q || '').trim();

    const params = [req.ligaId];
    let filtroTexto = '';
    if (texto) {
      params.push(`%${texto}%`);
      filtroTexto = ` AND c.nombre ILIKE $${params.length}`;
    }

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM club_liga cl JOIN clubes c ON c.id = cl.club_id
       WHERE cl.liga_id = $1${filtroTexto}`,
      params
    );

    params.push(porPagina, offset);
    const { rows } = await query(
      `SELECT c.*, cl.id AS membresia_id, cl.activo AS activo_en_liga, cl.fecha_alta,
              cc.tipo_techo AS cancha_tipo_techo, cc.tamanio AS cancha_tamanio, cc.piso AS cancha_piso
       FROM club_liga cl
       JOIN clubes c ON c.id = cl.club_id
       LEFT JOIN clubes_canchas cc ON cc.club_id = c.id AND cc.es_principal = TRUE
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

// Crea la cancha "principal" de un club recién creado (siempre existe una).
async function crearCanchaPrincipal(client, clubId, { tipo_techo, tamanio, piso }) {
  await client.query(
    `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, piso, es_principal, orden)
     VALUES ($1, 'Cancha principal', $2, $3, $4, TRUE, 0)`,
    [clubId, (tipo_techo === 'techada' ? 'techada' : 'aire_libre'), tamanio || null, piso || null]
  );
}

// GET /liga/clubes/plantilla — descarga la plantilla Excel para carga masiva
router.get('/plantilla', (req, res) => {
  try {
    const encabezados = ['Nombre', 'Direccion', 'Telefono', 'Email', 'Ciudad', 'Provincia', 'Cancha Techada o Aire Libre', 'Tamaño Cancha', 'Piso Cancha'];
    const filaEjemplo = ['Club Deportivo Ejemplo', 'Av. Siempre Viva 123', '011-4444-5555', 'contacto@club.com', 'La Plata', 'Buenos Aires', 'aire_libre', 'Reglamentaria (40x20m)', 'Césped sintético'];
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

      const direccion = String(fila.Direccion || fila.Dirección || fila.direccion || '').trim() || null;
      const telefono = String(fila.Telefono || fila.Teléfono || fila.telefono || '').trim() || null;
      const email = String(fila.Email || fila.email || '').trim() || null;
      const ciudad = String(fila.Ciudad || fila.ciudad || '').trim() || null;
      const provincia = String(fila.Provincia || fila.provincia || '').trim() || null;
      const canchaTipoTexto = String(fila['Cancha Techada o Aire Libre'] || fila['Cancha techada o aire libre'] || '').trim().toLowerCase();
      const canchaTipoTecho = canchaTipoTexto.startsWith('tech') ? 'techada' : 'aire_libre';
      const canchaTamanio = String(fila['Tamaño Cancha'] || fila['Tamanio Cancha'] || fila['Tamaño cancha'] || '').trim() || null;
      const canchaPiso = String(fila['Piso Cancha'] || fila['Piso cancha'] || '').trim() || null;

      const client = await getClient();
      try {
        await client.query('BEGIN');
        const clubResult = await client.query(
          `INSERT INTO clubes (nombre, direccion, telefono, email_contacto, ciudad, provincia)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [nombre, direccion, telefono, email, ciudad, provincia]
        );
        const club = clubResult.rows[0];
        await client.query('INSERT INTO club_liga (liga_id, club_id) VALUES ($1, $2)', [req.ligaId, club.id]);
        await crearCanchaPrincipal(client, club.id, { tipo_techo: canchaTipoTecho, tamanio: canchaTamanio, piso: canchaPiso });
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
    email_contacto, color_primario, color_secundario, ciudad, provincia,
    cancha_tipo_techo, cancha_tamanio, cancha_piso
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
      `INSERT INTO clubes (nombre, logo_url, direccion, telefono, email_contacto, color_primario, color_secundario, ciudad, provincia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [nombre.trim(), logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null,
       ciudad || null, provincia || null]
    );
    const club = clubResult.rows[0];

    const membresiaResult = await client.query(
      `INSERT INTO club_liga (liga_id, club_id) VALUES ($1, $2) RETURNING *`,
      [req.ligaId, club.id]
    );

    await crearCanchaPrincipal(client, club.id, {
      tipo_techo: cancha_tipo_techo, tamanio: cancha_tamanio, piso: cancha_piso
    });

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
    email_contacto, color_primario, color_secundario, ciudad, provincia,
    cancha_tipo_techo, cancha_tamanio, cancha_piso
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
         email_contacto = $5, color_primario = $6, color_secundario = $7,
         ciudad = $8, provincia = $9,
         actualizado_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [nombre.trim(), logo_url || null, direccion || null, telefono || null,
       email_contacto || null, color_primario || null, color_secundario || null,
       ciudad || null, provincia || null,
       req.params.clubId]
    );

    // Actualiza (o crea, si es un club viejo que todavía no tenía) la cancha
    // principal con los datos del formulario.
    if (cancha_tipo_techo || cancha_tamanio || cancha_piso) {
      const existente = await query(
        'SELECT id FROM clubes_canchas WHERE club_id = $1 AND es_principal = TRUE',
        [req.params.clubId]
      );
      if (existente.rows[0]) {
        await query(
          `UPDATE clubes_canchas SET tipo_techo = $1, tamanio = $2, piso = $3 WHERE id = $4`,
          [cancha_tipo_techo === 'techada' ? 'techada' : 'aire_libre', cancha_tamanio || null, cancha_piso || null, existente.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, piso, es_principal, orden)
           VALUES ($1, 'Cancha principal', $2, $3, $4, TRUE, 0)`,
          [req.params.clubId, cancha_tipo_techo === 'techada' ? 'techada' : 'aire_libre', cancha_tamanio || null, cancha_piso || null]
        );
      }
    }

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

// ===== CANCHAS =====

// GET /liga/clubes/:clubId/canchas — todas las canchas del club (principal + secundarias)
router.get('/:clubId/canchas', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      'SELECT * FROM clubes_canchas WHERE club_id = $1 ORDER BY es_principal DESC, orden ASC, creado_at ASC',
      [req.params.clubId]
    );
    res.json({ ok: true, canchas: rows });
  } catch (err) {
    console.error('Error en GET canchas de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/canchas — agrega una cancha SECUNDARIA
router.post('/:clubId/canchas', async (req, res) => {
  const { nombre, tipo_techo, tamanio, piso } = req.body;
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, piso, es_principal, orden)
       VALUES ($1, $2, $3, $4, $5, FALSE,
         (SELECT COALESCE(MAX(orden), 0) + 1 FROM clubes_canchas WHERE club_id = $1))
       RETURNING *`,
      [req.params.clubId, nombre || null, tipo_techo === 'techada' ? 'techada' : 'aire_libre', tamanio || null, piso || null]
    );
    res.status(201).json({ ok: true, cancha: rows[0] });
  } catch (err) {
    console.error('Error en POST cancha de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/clubes/:clubId/canchas/:canchaId — edita cualquier cancha (principal o secundaria)
router.put('/:clubId/canchas/:canchaId', async (req, res) => {
  const { nombre, tipo_techo, tamanio, piso } = req.body;
  try {
    const { rows } = await query(
      `UPDATE clubes_canchas SET nombre = $1, tipo_techo = $2, tamanio = $3, piso = $4
       WHERE id = $5 AND club_id = $6
       RETURNING *`,
      [nombre || null, tipo_techo === 'techada' ? 'techada' : 'aire_libre', tamanio || null, piso || null,
       req.params.canchaId, req.params.clubId]
    );
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Cancha no encontrada' });
    res.json({ ok: true, cancha: rows[0] });
  } catch (err) {
    console.error('Error en PUT cancha de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/clubes/:clubId/canchas/:canchaId — solo canchas SECUNDARIAS
// (la principal no se borra, se edita).
router.delete('/:clubId/canchas/:canchaId', async (req, res) => {
  try {
    const cancha = await query(
      'SELECT * FROM clubes_canchas WHERE id = $1 AND club_id = $2',
      [req.params.canchaId, req.params.clubId]
    );
    if (!cancha.rows[0]) return res.status(404).json({ ok: false, error: 'Cancha no encontrada' });
    if (cancha.rows[0].es_principal) {
      return res.status(400).json({ ok: false, error: 'La cancha principal no se puede eliminar, solo editar' });
    }
    await query('DELETE FROM clubes_canchas WHERE id = $1', [req.params.canchaId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE cancha de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/clubes/:clubId/participaciones-editor — todos los torneos y
// categorías de MI liga, marcando cuáles ya tiene el club (para el popup de
// selección múltiple: un club puede jugar Femenino, Masculino, Baby Fútbol, y
// además solo algunas categorías o todas dentro de cada torneo).
router.get('/:clubId/participaciones-editor', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    const torneosResult = await query(
      'SELECT id, nombre, deporte FROM torneos WHERE liga_id = $1 ORDER BY nombre ASC',
      [req.ligaId]
    );
    const categoriasResult = await query(
      `SELECT c.id, c.nombre, c.torneo_id
       FROM categorias c JOIN torneos t ON t.id = c.torneo_id
       WHERE t.liga_id = $1 ORDER BY c.orden ASC, c.nombre ASC`,
      [req.ligaId]
    );
    const inscriptasResult = await query(
      `SELECT categoria_id FROM equipos_torneo et JOIN torneos t ON t.id = et.torneo_id
       WHERE et.club_id = $1 AND t.liga_id = $2`,
      [req.params.clubId, req.ligaId]
    );
    const inscriptas = new Set(inscriptasResult.rows.map((r) => r.categoria_id));

    const torneos = torneosResult.rows.map((t) => ({
      ...t,
      categorias: categoriasResult.rows
        .filter((c) => c.torneo_id === t.id)
        .map((c) => ({ id: c.id, nombre: c.nombre, inscripta: inscriptas.has(c.id) }))
    }));

    res.json({ ok: true, torneos });
  } catch (err) {
    console.error('Error en GET participaciones-editor:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/clubes/:clubId/participaciones — guarda de una el conjunto
// completo de categorías en las que debe quedar inscripto el club (viene del
// popup de selección múltiple). Crea las que faltan y borra las que se
// destildaron (esto último borra también sus partidos/tabla en esa categoría).
router.put('/:clubId/participaciones', async (req, res) => {
  const { categoria_ids } = req.body;
  if (!Array.isArray(categoria_ids)) {
    return res.status(400).json({ ok: false, error: 'Falta categoria_ids (array)' });
  }
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    // Solo se aceptan categorías que efectivamente pertenezcan a torneos de MI liga.
    const categoriasValidas = await query(
      `SELECT c.id FROM categorias c JOIN torneos t ON t.id = c.torneo_id
       WHERE t.liga_id = $1 AND c.id = ANY($2::uuid[])`,
      [req.ligaId, categoria_ids]
    );
    const idsValidos = new Set(categoriasValidas.rows.map((r) => r.id));

    const actualesResult = await query(
      `SELECT et.categoria_id, et.torneo_id FROM equipos_torneo et JOIN torneos t ON t.id = et.torneo_id
       WHERE et.club_id = $1 AND t.liga_id = $2`,
      [req.params.clubId, req.ligaId]
    );
    const actuales = new Set(actualesResult.rows.map((r) => r.categoria_id));

    const aAgregar = [...idsValidos].filter((id) => !actuales.has(id));
    const aQuitar = actualesResult.rows.filter((r) => !idsValidos.has(r.categoria_id));

    for (const categoriaId of aAgregar) {
      const torneo = await query('SELECT torneo_id FROM categorias WHERE id = $1', [categoriaId]);
      await query(
        `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id)
         VALUES ($1, $2, $3) ON CONFLICT (torneo_id, categoria_id, club_id) DO NOTHING`,
        [torneo.rows[0].torneo_id, categoriaId, req.params.clubId]
      );
    }
    for (const r of aQuitar) {
      await query(
        'DELETE FROM equipos_torneo WHERE club_id = $1 AND torneo_id = $2 AND categoria_id = $3',
        [req.params.clubId, r.torneo_id, r.categoria_id]
      );
    }

    res.json({ ok: true, agregadas: aAgregar.length, quitadas: aQuitar.length });
  } catch (err) {
    console.error('Error en PUT participaciones:', err);
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

// ===== DOCUMENTOS DEL CLUB (los puede subir la Liga o el propio Club) =====

// GET /liga/clubes/:clubId/documentos
router.get('/:clubId/documentos', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      'SELECT * FROM club_documentos WHERE club_id = $1 ORDER BY creado_at DESC',
      [req.params.clubId]
    );
    res.json({ ok: true, documentos: rows });
  } catch (err) {
    console.error('Error en GET documentos de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/documentos — la Liga sube un documento del club
router.post('/:clubId/documentos', async (req, res) => {
  const { nombre, archivo_url } = req.body;
  if (!nombre || !nombre.trim() || !archivo_url) {
    return res.status(400).json({ ok: false, error: 'Faltan nombre y/o archivo' });
  }
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      `INSERT INTO club_documentos (club_id, nombre, archivo_url, subido_por_rol, subido_por_id)
       VALUES ($1, $2, $3, 'liga', $4)
       RETURNING *`,
      [req.params.clubId, nombre.trim(), archivo_url, req.usuario.id]
    );
    res.status(201).json({ ok: true, documento: rows[0] });
  } catch (err) {
    console.error('Error en POST documento de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/clubes/:clubId/documentos/:documentoId — la Liga puede borrar cualquier documento del club
router.delete('/:clubId/documentos/:documentoId', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rowCount } = await query(
      'DELETE FROM club_documentos WHERE id = $1 AND club_id = $2',
      [req.params.documentoId, req.params.clubId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE documento de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== COMENTARIOS INTERNOS DE LA LIGA SOBRE EL CLUB (el Club nunca los ve) =====

// GET /liga/clubes/:clubId/comentarios
router.get('/:clubId/comentarios', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      'SELECT * FROM club_comentarios WHERE club_id = $1 AND liga_id = $2 ORDER BY creado_at DESC',
      [req.params.clubId, req.ligaId]
    );
    res.json({ ok: true, comentarios: rows });
  } catch (err) {
    console.error('Error en GET comentarios de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/comentarios
router.post('/:clubId/comentarios', async (req, res) => {
  const { comentario } = req.body;
  if (!comentario || !comentario.trim()) {
    return res.status(400).json({ ok: false, error: 'El comentario no puede estar vacío' });
  }
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      `INSERT INTO club_comentarios (club_id, liga_id, autor_nombre, comentario)
       VALUES ($1, $2, (SELECT nombre FROM usuarios WHERE id = $3), $4)
       RETURNING *`,
      [req.params.clubId, req.ligaId, req.usuario.id, comentario.trim()]
    );
    res.status(201).json({ ok: true, comentario: rows[0] });
  } catch (err) {
    console.error('Error en POST comentario de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/clubes/:clubId/comentarios/:comentarioId
router.delete('/:clubId/comentarios/:comentarioId', async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM club_comentarios WHERE id = $1 AND club_id = $2 AND liga_id = $3',
      [req.params.comentarioId, req.params.clubId, req.ligaId]
    );
    if (!rowCount) return res.status(404).json({ ok: false, error: 'Comentario no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE comentario de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

module.exports = router;
