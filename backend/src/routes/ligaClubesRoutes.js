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
const COLUMNAS_ORDEN_CLUBES = {
  nombre: 'c.nombre',
  ciudad: 'c.ciudad',
  provincia: 'c.provincia'
};

router.get('/', async (req, res) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const porPagina = Math.min(25, Math.max(1, parseInt(req.query.por_pagina, 10) || 25));
    const offset = (pagina - 1) * porPagina;
    const texto = (req.query.q || '').trim();
    // ciudad/provincia aceptan uno o varios valores (multi-select en el front):
    // ?ciudad=La Plata&ciudad=Berisso, o ?ciudad=La Plata,Berisso
    const normalizarLista = (valor) => {
      if (!valor) return [];
      const arr = Array.isArray(valor) ? valor : String(valor).split(',');
      return arr.map((v) => v.trim()).filter(Boolean);
    };
    const ciudades = normalizarLista(req.query.ciudad);
    const provincias = normalizarLista(req.query.provincia);
    const modalidadIds = normalizarLista(req.query.modalidad_id);
    const canchaTecho = (req.query.cancha_techo || '').trim();
    const soloReglamentaria = req.query.cancha_reglamentaria === 'true';
    const incluirInactivos = req.query.incluir_inactivos === 'true';

    const columnaOrden = COLUMNAS_ORDEN_CLUBES[req.query.orden_campo] || 'c.nombre';
    const direccionOrden = (req.query.orden_direccion || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const params = [req.ligaId];
    let filtros = '';
    if (texto) {
      params.push(`%${texto}%`);
      filtros += ` AND c.nombre ILIKE $${params.length}`;
    }
    if (ciudades.length) {
      params.push(ciudades);
      filtros += ` AND c.ciudad = ANY($${params.length}::text[])`;
    }
    if (provincias.length) {
      params.push(provincias);
      filtros += ` AND c.provincia = ANY($${params.length}::text[])`;
    }
    if (modalidadIds.length) {
      params.push(modalidadIds);
      filtros += ` AND EXISTS (SELECT 1 FROM club_modalidades cm WHERE cm.club_id = c.id AND cm.modalidad_id = ANY($${params.length}::uuid[]))`;
    }
    if (!incluirInactivos) {
      filtros += ` AND cl.activo = TRUE`;
    }
    let filtroCancha = '';
    if (canchaTecho === 'aire_libre' || canchaTecho === 'techada') {
      params.push(canchaTecho);
      filtroCancha += ` AND cc.tipo_techo = $${params.length}`;
    }
    if (soloReglamentaria) {
      filtroCancha += ` AND cc.cancha_reglamentaria = TRUE`;
    }

    const totalResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM club_liga cl
       JOIN clubes c ON c.id = cl.club_id
       LEFT JOIN clubes_canchas cc ON cc.club_id = c.id AND cc.es_principal = TRUE
       WHERE cl.liga_id = $1${filtros}${filtroCancha}`,
      params
    );

    params.push(porPagina, offset);
    const { rows } = await query(
      `SELECT c.*, cl.id AS membresia_id, cl.activo AS activo_en_liga, cl.fecha_alta,
              cc.tipo_techo AS cancha_tipo_techo, cc.tamanio AS cancha_tamanio, cc.piso AS cancha_piso,
              cc.tipo_cancha_id AS cancha_tipo_cancha_id, tc.nombre AS cancha_tipo_cancha_nombre,
              cc.cancha_reglamentaria AS cancha_reglamentaria
       FROM club_liga cl
       JOIN clubes c ON c.id = cl.club_id
       LEFT JOIN clubes_canchas cc ON cc.club_id = c.id AND cc.es_principal = TRUE
       LEFT JOIN tipos_cancha tc ON tc.id = cc.tipo_cancha_id
       WHERE cl.liga_id = $1${filtros}${filtroCancha}
       ORDER BY ${columnaOrden} ${direccionOrden} NULLS LAST
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

// GET /liga/clubes/filtros-disponibles — ciudades y provincias ya cargadas
// en algún club de MI liga, para poblar los selects múltiples del filtro
// (en vez de que el usuario tenga que escribir el texto exacto).
router.get('/filtros-disponibles', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT DISTINCT c.ciudad, c.provincia
       FROM club_liga cl JOIN clubes c ON c.id = cl.club_id
       WHERE cl.liga_id = $1`,
      [req.ligaId]
    );
    const ciudades = [...new Set(rows.map((r) => r.ciudad).filter(Boolean))].sort();
    const provincias = [...new Set(rows.map((r) => r.provincia).filter(Boolean))].sort();
    res.json({ ok: true, ciudades, provincias });
  } catch (err) {
    console.error('Error en GET /liga/clubes/filtros-disponibles:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Crea la cancha "principal" de un club recién creado (siempre existe una).
async function crearCanchaPrincipal(client, clubId, { tipo_techo, tamanio, piso, tipo_cancha_id, reglamentaria }) {
  await client.query(
    `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, piso, tipo_cancha_id, cancha_reglamentaria, es_principal, orden)
     VALUES ($1, 'Cancha principal', $2, $3, $4, $5, $6, TRUE, 0)`,
    [clubId, (tipo_techo === 'techada' ? 'techada' : 'aire_libre'), tamanio || null, piso || null, tipo_cancha_id || null, !!reglamentaria]
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
    cancha_tipo_techo, cancha_tamanio, cancha_piso, cancha_tipo_cancha_id, cancha_reglamentaria
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
      tipo_techo: cancha_tipo_techo, tamanio: cancha_tamanio, piso: cancha_piso,
      tipo_cancha_id: cancha_tipo_cancha_id, reglamentaria: cancha_reglamentaria
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
    cancha_tipo_techo, cancha_tamanio, cancha_piso, cancha_tipo_cancha_id, cancha_reglamentaria
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
    if (cancha_tipo_techo || cancha_tamanio || cancha_piso || cancha_tipo_cancha_id || cancha_reglamentaria !== undefined) {
      const existente = await query(
        'SELECT id FROM clubes_canchas WHERE club_id = $1 AND es_principal = TRUE',
        [req.params.clubId]
      );
      if (existente.rows[0]) {
        await query(
          `UPDATE clubes_canchas SET tipo_techo = $1, tamanio = $2, piso = $3, tipo_cancha_id = $4, cancha_reglamentaria = $5 WHERE id = $6`,
          [cancha_tipo_techo === 'techada' ? 'techada' : 'aire_libre', cancha_tamanio || null, cancha_piso || null,
           cancha_tipo_cancha_id || null, !!cancha_reglamentaria, existente.rows[0].id]
        );
      } else {
        await query(
          `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, piso, tipo_cancha_id, cancha_reglamentaria, es_principal, orden)
           VALUES ($1, 'Cancha principal', $2, $3, $4, $5, $6, TRUE, 0)`,
          [req.params.clubId, cancha_tipo_techo === 'techada' ? 'techada' : 'aire_libre', cancha_tamanio || null, cancha_piso || null,
           cancha_tipo_cancha_id || null, !!cancha_reglamentaria]
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
      `SELECT cc.*, tc.nombre AS tipo_cancha_nombre
       FROM clubes_canchas cc LEFT JOIN tipos_cancha tc ON tc.id = cc.tipo_cancha_id
       WHERE cc.club_id = $1 ORDER BY cc.es_principal DESC, cc.orden ASC, cc.creado_at ASC`,
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
  const { nombre, tipo_techo, tamanio, tipo_cancha_id } = req.body;
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      `INSERT INTO clubes_canchas (club_id, nombre, tipo_techo, tamanio, tipo_cancha_id, es_principal, orden)
       VALUES ($1, $2, $3, $4, $5, FALSE,
         (SELECT COALESCE(MAX(orden), 0) + 1 FROM clubes_canchas WHERE club_id = $1))
       RETURNING *`,
      [req.params.clubId, nombre || null, tipo_techo === 'techada' ? 'techada' : 'aire_libre', tamanio || null, tipo_cancha_id || null]
    );
    res.status(201).json({ ok: true, cancha: rows[0] });
  } catch (err) {
    console.error('Error en POST cancha de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/clubes/:clubId/canchas/:canchaId — edita cualquier cancha (principal o secundaria)
router.put('/:clubId/canchas/:canchaId', async (req, res) => {
  const { nombre, tipo_techo, tamanio, tipo_cancha_id } = req.body;
  try {
    const { rows } = await query(
      `UPDATE clubes_canchas SET nombre = $1, tipo_techo = $2, tamanio = $3, tipo_cancha_id = $4
       WHERE id = $5 AND club_id = $6
       RETURNING *`,
      [nombre || null, tipo_techo === 'techada' ? 'techada' : 'aire_libre', tamanio || null, tipo_cancha_id || null,
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
    const subcategoriasResult = await query(
      `SELECT cs.id, cs.nombre, cs.categoria_id
       FROM categoria_subcategorias cs
       JOIN categorias c ON c.id = cs.categoria_id
       JOIN torneos t ON t.id = c.torneo_id
       WHERE t.liga_id = $1 ORDER BY cs.orden ASC, cs.nombre ASC`,
      [req.ligaId]
    );
    // Un equipo puede estar inscripto a nivel categoría (subcategoria_id NULL)
    // o a nivel subcategoría — según si esa categoría tiene subcategorías.
    const inscriptasResult = await query(
      `SELECT categoria_id, subcategoria_id FROM equipos_torneo et JOIN torneos t ON t.id = et.torneo_id
       WHERE et.club_id = $1 AND t.liga_id = $2`,
      [req.params.clubId, req.ligaId]
    );
    const categoriasInscriptas = new Set(inscriptasResult.rows.filter((r) => !r.subcategoria_id).map((r) => r.categoria_id));
    const subcategoriasInscriptas = new Set(inscriptasResult.rows.filter((r) => r.subcategoria_id).map((r) => r.subcategoria_id));

    const torneos = torneosResult.rows.map((t) => ({
      ...t,
      categorias: categoriasResult.rows
        .filter((c) => c.torneo_id === t.id)
        .map((c) => {
          const subcategorias = subcategoriasResult.rows
            .filter((s) => s.categoria_id === c.id)
            .map((s) => ({ id: s.id, nombre: s.nombre, inscripta: subcategoriasInscriptas.has(s.id) }));
          return {
            id: c.id,
            nombre: c.nombre,
            subcategorias,
            // Solo tiene sentido cuando la categoría NO tiene subcategorías —
            // si las tiene, la inscripción se hace por subcategoría (ver arriba).
            inscripta: subcategorias.length ? false : categoriasInscriptas.has(c.id)
          };
        })
    }));

    res.json({ ok: true, torneos });
  } catch (err) {
    console.error('Error en GET participaciones-editor:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/clubes/:clubId/participaciones — guarda de una el conjunto
// completo de categorías/subcategorías en las que debe quedar inscripto el
// club (viene del popup de selección múltiple). Crea las que faltan y borra
// las que se destildaron (esto último borra también sus partidos/tabla en esa
// categoría/subcategoría). "selecciones" es un array de
// { categoria_id, subcategoria_id } — subcategoria_id va en null cuando esa
// categoría no tiene subcategorías cargadas.
router.put('/:clubId/participaciones', async (req, res) => {
  const { selecciones } = req.body;
  if (!Array.isArray(selecciones)) {
    return res.status(400).json({ ok: false, error: 'Falta selecciones (array)' });
  }
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }

    // Solo se aceptan categorías que efectivamente pertenezcan a torneos de MI liga,
    // y (cuando corresponde) subcategorías que pertenezcan a esa misma categoría.
    const categoriaIds = [...new Set(selecciones.map((s) => s.categoria_id).filter(Boolean))];
    const categoriasValidasResult = await query(
      `SELECT c.id, c.torneo_id,
              (SELECT COUNT(*)::int FROM categoria_subcategorias cs WHERE cs.categoria_id = c.id) AS cant_subcategorias
       FROM categorias c JOIN torneos t ON t.id = c.torneo_id
       WHERE t.liga_id = $1 AND c.id = ANY($2::uuid[])`,
      [req.ligaId, categoriaIds]
    );
    const categoriasValidas = new Map(categoriasValidasResult.rows.map((c) => [c.id, c]));

    const subcategoriaIds = [...new Set(selecciones.map((s) => s.subcategoria_id).filter(Boolean))];
    const subcategoriasValidasResult = subcategoriaIds.length
      ? await query(
          `SELECT cs.id, cs.categoria_id FROM categoria_subcategorias cs
           JOIN categorias c ON c.id = cs.categoria_id
           JOIN torneos t ON t.id = c.torneo_id
           WHERE t.liga_id = $1 AND cs.id = ANY($2::uuid[])`,
          [req.ligaId, subcategoriaIds]
        )
      : { rows: [] };
    const subcategoriasValidas = new Map(subcategoriasValidasResult.rows.map((s) => [s.id, s]));

    // Normaliza y valida cada selección recibida.
    const deseadas = [];
    for (const sel of selecciones) {
      const categoria = categoriasValidas.get(sel.categoria_id);
      if (!categoria) continue; // categoría inexistente o de otra liga: se ignora
      if (categoria.cant_subcategorias > 0) {
        const subcategoria = sel.subcategoria_id ? subcategoriasValidas.get(sel.subcategoria_id) : null;
        if (!subcategoria || subcategoria.categoria_id !== categoria.id) continue; // esta categoría exige subcategoría
        deseadas.push({ torneo_id: categoria.torneo_id, categoria_id: categoria.id, subcategoria_id: subcategoria.id });
      } else {
        deseadas.push({ torneo_id: categoria.torneo_id, categoria_id: categoria.id, subcategoria_id: null });
      }
    }

    const actualesResult = await query(
      `SELECT et.categoria_id, et.subcategoria_id, et.torneo_id FROM equipos_torneo et JOIN torneos t ON t.id = et.torneo_id
       WHERE et.club_id = $1 AND t.liga_id = $2`,
      [req.params.clubId, req.ligaId]
    );
    const clave = (categoriaId, subcategoriaId) => `${categoriaId}::${subcategoriaId || ''}`;
    const deseadasClaves = new Set(deseadas.map((d) => clave(d.categoria_id, d.subcategoria_id)));
    const actualesClaves = new Set(actualesResult.rows.map((r) => clave(r.categoria_id, r.subcategoria_id)));

    const aAgregar = deseadas.filter((d) => !actualesClaves.has(clave(d.categoria_id, d.subcategoria_id)));
    const aQuitar = actualesResult.rows.filter((r) => !deseadasClaves.has(clave(r.categoria_id, r.subcategoria_id)));

    for (const d of aAgregar) {
      await query(
        `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, subcategoria_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT (torneo_id, categoria_id, club_id, subcategoria_clave) DO NOTHING`,
        [d.torneo_id, d.categoria_id, req.params.clubId, d.subcategoria_id]
      );
    }
    for (const r of aQuitar) {
      await query(
        `DELETE FROM equipos_torneo WHERE club_id = $1 AND torneo_id = $2 AND categoria_id = $3
         AND (subcategoria_id = $4 OR (subcategoria_id IS NULL AND $4::uuid IS NULL))`,
        [req.params.clubId, r.torneo_id, r.categoria_id, r.subcategoria_id]
      );
    }

    res.json({ ok: true, agregadas: aAgregar.length, quitadas: aQuitar.length });
  } catch (err) {
    console.error('Error en PUT participaciones:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// ===== Modalidades del club (Categorías de torneo configuradas en la Liga:
// Futsal, Senior, Leyendas, etc. — no confundir con las "categorías" propias
// de cada torneo). Un club puede estar anotado en varias a la vez. =====

// GET /liga/clubes/:clubId/modalidades — modalidades en las que este club
// está anotado + el listado completo de modalidades de la Liga (para poder
// armar los checkboxes de "está anotado / no está anotado" en el front).
router.get('/:clubId/modalidades', async (req, res) => {
  try {
    const pertenece = await query('SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2', [req.params.clubId, req.ligaId]);
    if (!pertenece.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });

    const todas = await query('SELECT * FROM modalidades_liga WHERE liga_id = $1 ORDER BY nombre ASC', [req.ligaId]);
    const anotadas = await query('SELECT modalidad_id FROM club_modalidades WHERE club_id = $1', [req.params.clubId]);
    const anotadasIds = new Set(anotadas.rows.map((r) => r.modalidad_id));
    res.json({
      ok: true,
      modalidades: todas.rows.map((m) => ({ ...m, anotado: anotadasIds.has(m.id) }))
    });
  } catch (err) {
    console.error('Error en GET /:clubId/modalidades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PUT /liga/clubes/:clubId/modalidades — reemplaza por completo el conjunto
// de modalidades del club (body: { modalidad_ids: [] }).
router.put('/:clubId/modalidades', async (req, res) => {
  const { modalidad_ids } = req.body;
  if (!Array.isArray(modalidad_ids)) {
    return res.status(400).json({ ok: false, error: 'Falta modalidad_ids (array)' });
  }
  try {
    const pertenece = await query('SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2', [req.params.clubId, req.ligaId]);
    if (!pertenece.rows[0]) return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });

    const validasResult = modalidad_ids.length
      ? await query('SELECT id FROM modalidades_liga WHERE liga_id = $1 AND id = ANY($2::uuid[])', [req.ligaId, modalidad_ids])
      : { rows: [] };
    const idsValidos = validasResult.rows.map((r) => r.id);

    await query('DELETE FROM club_modalidades WHERE club_id = $1', [req.params.clubId]);
    for (const modalidadId of idsValidos) {
      await query('INSERT INTO club_modalidades (club_id, modalidad_id) VALUES ($1, $2)', [req.params.clubId, modalidadId]);
    }
    res.json({ ok: true, guardadas: idsValidos.length });
  } catch (err) {
    console.error('Error en PUT /:clubId/modalidades:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// GET /liga/clubes/:clubId/participaciones — todas las combinaciones
// torneo+categoría(+subcategoría) en las que ese club tiene un equipo
// inscripto DENTRO de MI liga. Un mismo club puede tener varios equipos a la
// vez (ej. Baby Fútbol Sub 10 y Futsal Primera), esto lo muestra todo junto.
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
              cat.id AS categoria_id, cat.nombre AS categoria_nombre,
              sub.id AS subcategoria_id, sub.nombre AS subcategoria_nombre
       FROM equipos_torneo et
       JOIN torneos t ON t.id = et.torneo_id
       JOIN categorias cat ON cat.id = et.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = et.subcategoria_id
       WHERE et.club_id = $1 AND t.liga_id = $2
       ORDER BY t.nombre ASC, cat.orden ASC, cat.nombre ASC, sub.orden ASC, sub.nombre ASC`,
      [req.params.clubId, req.ligaId]
    );
    res.json({ ok: true, participaciones: rows });
  } catch (err) {
    console.error('Error en GET participaciones de club:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /liga/clubes/:clubId/inscribir — desde el Home de Clubes: anota este
// club en una categoría (o subcategoría, si esa categoría tiene) puntual de
// un torneo de MI liga (mismo efecto que inscribirlo desde la pantalla de
// Torneos, pero más cómodo si lo que tenés a mano es el Club y querés
// sumarlo a varios torneos/categorías seguidos).
router.post('/:clubId/inscribir', async (req, res) => {
  const { torneo_id, categoria_id, subcategoria_id, grupo } = req.body;
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
      `SELECT (SELECT COUNT(*)::int FROM categoria_subcategorias cs WHERE cs.categoria_id = c.id) AS cant_subcategorias
       FROM torneos t JOIN categorias c ON c.torneo_id = t.id
       WHERE t.id = $1 AND c.id = $2 AND t.liga_id = $3`,
      [torneo_id, categoria_id, req.ligaId]
    );
    if (!contexto.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Esa categoría no pertenece a un torneo de tu Liga' });
    }
    if (contexto.rows[0].cant_subcategorias > 0) {
      if (!subcategoria_id) {
        return res.status(400).json({ ok: false, error: 'Esta categoría tiene subcategorías: elegí una para inscribir al club' });
      }
      const subOk = await query(
        'SELECT 1 FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2',
        [subcategoria_id, categoria_id]
      );
      if (!subOk.rows[0]) {
        return res.status(400).json({ ok: false, error: 'Esa subcategoría no pertenece a esta categoría' });
      }
    }

    const { rows } = await query(
      `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, subcategoria_id, grupo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [torneo_id, categoria_id, req.params.clubId, contexto.rows[0].cant_subcategorias > 0 ? subcategoria_id : null, grupo || null]
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

// POST /liga/clubes/inscribir-multiple — inscribe VARIOS clubes de una a la
// misma categoría (o subcategoría) de un torneo. Pensado para cuando tildás
// varios clubes en el Home y elegís "Asignar a categoría". Devuelve el
// detalle de qué se pudo inscribir y qué no (ej: ya estaba inscripto).
router.post('/inscribir-multiple', async (req, res) => {
  const { club_ids, torneo_id, categoria_id, subcategoria_id, grupo } = req.body;
  if (!Array.isArray(club_ids) || !club_ids.length || !torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan club_ids (array), torneo_id y/o categoria_id' });
  }
  try {
    const contexto = await query(
      `SELECT (SELECT COUNT(*)::int FROM categoria_subcategorias cs WHERE cs.categoria_id = c.id) AS cant_subcategorias
       FROM torneos t JOIN categorias c ON c.torneo_id = t.id
       WHERE t.id = $1 AND c.id = $2 AND t.liga_id = $3`,
      [torneo_id, categoria_id, req.ligaId]
    );
    if (!contexto.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Esa categoría no pertenece a un torneo de tu Liga' });
    }
    const tieneSubcategorias = contexto.rows[0].cant_subcategorias > 0;
    if (tieneSubcategorias) {
      if (!subcategoria_id) {
        return res.status(400).json({ ok: false, error: 'Esta categoría tiene subcategorías: elegí una para inscribir a los clubes' });
      }
      const subOk = await query(
        'SELECT 1 FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2',
        [subcategoria_id, categoria_id]
      );
      if (!subOk.rows[0]) {
        return res.status(400).json({ ok: false, error: 'Esa subcategoría no pertenece a esta categoría' });
      }
    }

    const resultados = [];
    for (const clubId of club_ids) {
      const pertenece = await query(
        'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
        [clubId, req.ligaId]
      );
      if (!pertenece.rows[0]) {
        resultados.push({ club_id: clubId, ok: false, error: 'No pertenece a tu Liga' });
        continue;
      }
      // Dentro de un mismo torneo, un club no puede quedar inscripto en dos
      // categorías DISTINTAS (sí puede tener equipo en varias subcategorías
      // de la MISMA categoría, ej: Primera y Reserva).
      const otraCategoria = await query(
        `SELECT c.nombre AS categoria_nombre FROM equipos_torneo et
         JOIN categorias c ON c.id = et.categoria_id
         WHERE et.torneo_id = $1 AND et.club_id = $2 AND et.categoria_id != $3
         LIMIT 1`,
        [torneo_id, clubId, categoria_id]
      );
      if (otraCategoria.rows[0]) {
        resultados.push({ club_id: clubId, ok: false, error: `Ya está inscripto en la categoría "${otraCategoria.rows[0].categoria_nombre}" de este torneo` });
        continue;
      }
      try {
        await query(
          `INSERT INTO equipos_torneo (torneo_id, categoria_id, club_id, subcategoria_id, grupo)
           VALUES ($1, $2, $3, $4, $5)`,
          [torneo_id, categoria_id, clubId, tieneSubcategorias ? subcategoria_id : null, grupo || null]
        );
        resultados.push({ club_id: clubId, ok: true });
      } catch (err) {
        if (err.code === '23505') {
          resultados.push({ club_id: clubId, ok: false, error: 'Ya estaba inscripto' });
        } else {
          resultados.push({ club_id: clubId, ok: false, error: 'Error interno' });
        }
      }
    }
    res.json({ ok: true, resultados, agregados: resultados.filter((r) => r.ok).length });
  } catch (err) {
    console.error('Error en POST /liga/clubes/inscribir-multiple:', err);
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

// GET /liga/clubes/:clubId/usuarios — usuarios club_admin de este club.
router.get('/:clubId/usuarios', async (req, res) => {
  try {
    const pertenece = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2',
      [req.params.clubId, req.ligaId]
    );
    if (!pertenece.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Club no encontrado en tu Liga' });
    }
    const { rows } = await query(
      `SELECT id, email, nombre, rol, activo, ultimo_login, creado_at
       FROM usuarios WHERE club_id = $1 ORDER BY creado_at DESC`,
      [req.params.clubId]
    );
    res.json({ ok: true, usuarios: rows });
  } catch (err) {
    console.error('Error en GET /liga/clubes/:clubId/usuarios:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// Chequea que un usuario club_admin pertenezca a un club de MI liga.
async function buscarUsuarioDeClubDeMiLiga(usuarioId, clubId, ligaId) {
  const { rows } = await query(
    `SELECT u.* FROM usuarios u
     JOIN club_liga cl ON cl.club_id = u.club_id
     WHERE u.id = $1 AND u.club_id = $2 AND cl.liga_id = $3`,
    [usuarioId, clubId, ligaId]
  );
  return rows[0] || null;
}

// PUT /liga/clubes/:clubId/usuarios/:usuarioId — edita nombre/email
router.put('/:clubId/usuarios/:usuarioId', async (req, res) => {
  const { nombre, email } = req.body;
  try {
    const usuario = await buscarUsuarioDeClubDeMiLiga(req.params.usuarioId, req.params.clubId, req.ligaId);
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado en este club' });

    const { rows } = await query(
      `UPDATE usuarios SET
         nombre = COALESCE($1, nombre),
         email = COALESCE($2, email)
       WHERE id = $3
       RETURNING id, email, nombre, rol, activo`,
      [nombre && nombre.trim() ? nombre.trim() : null, email && email.trim() ? email.trim().toLowerCase() : null, req.params.usuarioId]
    );
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ ok: false, error: `Ya existe un usuario con el email "${email}"` });
    }
    console.error('Error en PUT /liga/clubes/:clubId/usuarios/:usuarioId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/clubes/:clubId/usuarios/:usuarioId/password — cambia la contraseña
router.patch('/:clubId/usuarios/:usuarioId/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 4) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 4 caracteres' });
  }
  try {
    const usuario = await buscarUsuarioDeClubDeMiLiga(req.params.usuarioId, req.params.clubId, req.ligaId);
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado en este club' });

    const passwordHash = await bcrypt.hash(password, 10);
    await query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [passwordHash, req.params.usuarioId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en PATCH .../usuarios/:usuarioId/password:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// PATCH /liga/clubes/:clubId/usuarios/:usuarioId/activo — activa/desactiva
router.patch('/:clubId/usuarios/:usuarioId/activo', async (req, res) => {
  const { activo } = req.body;
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ ok: false, error: 'Falta el campo "activo" (true/false)' });
  }
  try {
    const usuario = await buscarUsuarioDeClubDeMiLiga(req.params.usuarioId, req.params.clubId, req.ligaId);
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado en este club' });

    const { rows } = await query(
      'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, activo',
      [activo, req.params.usuarioId]
    );
    res.json({ ok: true, usuario: rows[0] });
  } catch (err) {
    console.error('Error en PATCH .../usuarios/:usuarioId/activo:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /liga/clubes/:clubId/usuarios/:usuarioId
router.delete('/:clubId/usuarios/:usuarioId', async (req, res) => {
  try {
    const usuario = await buscarUsuarioDeClubDeMiLiga(req.params.usuarioId, req.params.clubId, req.ligaId);
    if (!usuario) return res.status(404).json({ ok: false, error: 'Usuario no encontrado en este club' });

    await query('DELETE FROM usuarios WHERE id = $1', [req.params.usuarioId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Error en DELETE .../usuarios/:usuarioId:', err);
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
