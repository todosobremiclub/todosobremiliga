const express = require('express');
const router = express.Router();

const { query, getClient } = require('../db');

// Todas las rutas usan req.clubId (calculado por resolveClubId en app.js).

// GET /club/fichajes?torneo_id=...&categoria_id=... — todas las solicitudes
// de fichaje de MI club (para ver el estado: pendiente / aprobado /
// rechazado), opcionalmente filtradas por torneo y/o división
router.get('/', async (req, res) => {
  const { liga_id, torneo_id, categoria_id, subcategoria_id } = req.query;
  try {
    const params = [req.clubId];
    let filtros = '';
    if (liga_id) {
      params.push(liga_id);
      filtros += ` AND f.liga_id = $${params.length}`;
    }
    if (torneo_id) {
      params.push(torneo_id);
      filtros += ` AND f.torneo_id = $${params.length}`;
    }
    if (categoria_id) {
      params.push(categoria_id);
      filtros += ` AND f.categoria_id = $${params.length}`;
    }
    if (subcategoria_id) {
      params.push(subcategoria_id);
      filtros += ` AND f.subcategoria_id = $${params.length}`;
    }
    const { rows } = await query(
      `SELECT f.*, j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
              j.foto_url AS jugador_foto_url, j.fecha_nacimiento AS jugador_fecha_nacimiento,
              j.dni_frente_url AS jugador_dni_frente_url, j.dni_dorso_url AS jugador_dni_dorso_url,
              cl.nombre AS club_nombre, cl.logo_url AS club_logo_url, cl.color_primario AS club_color_primario,
              l.nombre AS liga_nombre, t.nombre AS torneo_nombre, cat.nombre AS categoria_nombre,
              sub.nombre AS subcategoria_nombre,
              c.codigo_qr AS carnet_codigo_qr, c.vigente_desde AS carnet_vigente_desde,
              c.vigente_hasta AS carnet_vigente_hasta, c.activo AS carnet_activo
       FROM fichajes f
       JOIN jugadores j ON j.id = f.jugador_id
       JOIN clubes cl ON cl.id = f.club_id
       JOIN ligas l ON l.id = f.liga_id
       LEFT JOIN torneos t ON t.id = f.torneo_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
       LEFT JOIN carnets c ON c.fichaje_id = f.id
       WHERE f.club_id = $1${filtros}
       ORDER BY f.fecha_solicitud DESC`,
      params
    );
    res.json({ ok: true, fichajes: rows });
  } catch (err) {
    console.error('Error en GET /club/fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// POST /club/jugadores/:jugadorId/fichajes — solicitar la habilitación de un
// jugador ante una Liga. El fichaje es SIEMPRE por división puntual dentro
// de un torneo (un torneo puede tener varias divisiones — ej. Baby Fútbol
// con Sub 8, Sub 10, Sub 12 — y hay que fichar para la división exacta en
// la que va a jugar), porque de ahí sale el carnet una vez aprobado.
router.post('/:jugadorId/fichajes', async (req, res) => {
  const { liga_id, torneo_id, categoria_id, subcategoria_id, documentos, dni_frente_url, dni_dorso_url } = req.body;

  if (!liga_id || !torneo_id || !categoria_id) {
    return res.status(400).json({ ok: false, error: 'Faltan liga_id, torneo_id y/o categoria_id' });
  }

  try {
    const jugador = await query(
      'SELECT 1 FROM jugadores WHERE id = $1 AND club_id = $2',
      [req.params.jugadorId, req.clubId]
    );
    if (!jugador.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Jugador no encontrado en tu club' });
    }

    const clubEnLiga = await query(
      'SELECT 1 FROM club_liga WHERE club_id = $1 AND liga_id = $2 AND activo = TRUE',
      [req.clubId, liga_id]
    );
    if (!clubEnLiga.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Tu club no participa en esa Liga' });
    }

    const torneo = await query(
      'SELECT 1 FROM torneos WHERE id = $1 AND liga_id = $2',
      [torneo_id, liga_id]
    );
    if (!torneo.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Ese torneo no pertenece a la Liga indicada' });
    }

    const categoria = await query(
      'SELECT 1 FROM categorias WHERE id = $1 AND torneo_id = $2',
      [categoria_id, torneo_id]
    );
    if (!categoria.rows[0]) {
      return res.status(404).json({ ok: false, error: 'Esa división no pertenece al torneo indicado' });
    }

    if (subcategoria_id) {
      const subcategoria = await query(
        'SELECT 1 FROM categoria_subcategorias WHERE id = $1 AND categoria_id = $2',
        [subcategoria_id, categoria_id]
      );
      if (!subcategoria.rows[0]) {
        return res.status(404).json({ ok: false, error: 'Esa categoría no pertenece a la división indicada' });
      }
    }

    // No permitir dos solicitudes de fichaje vigentes (pendiente o aprobado)
    // para el mismo jugador en el mismo torneo.
    const yaFichado = await query(
      `SELECT 1 FROM fichajes
       WHERE jugador_id = $1 AND torneo_id = $2 AND estado IN ('pendiente', 'aprobado')`,
      [req.params.jugadorId, torneo_id]
    );
    if (yaFichado.rows[0]) {
      return res.status(409).json({
        ok: false,
        error: 'Ese jugador ya tiene una solicitud de fichaje pendiente o aprobada en ese torneo',
      });
    }

    // Aviso informativo (no bloqueante): mismo DNI ya fichado en OTRO torneo
    // Y/O en OTRA división/categoría de la misma Liga. Sirve para que la
    // Liga detecte un jugador que se quiere fichar por más de un club, o en
    // más de una división/categoría, dentro de su misma Liga.
    const { rows: otrosFichajes } = await query(
      `SELECT f.id, f.estado, f.torneo_id, t.nombre AS torneo_nombre,
              cat.nombre AS categoria_nombre, sub.nombre AS subcategoria_nombre,
              cl.id AS club_id, cl.nombre AS club_nombre
       FROM fichajes f
       JOIN jugadores j ON j.id = f.jugador_id
       JOIN torneos t ON t.id = f.torneo_id
       JOIN clubes cl ON cl.id = f.club_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
       WHERE j.dni = (SELECT dni FROM jugadores WHERE id = $1)
         AND f.liga_id = $2
         AND f.estado IN ('pendiente', 'aprobado')`,
      [req.params.jugadorId, liga_id]
    );

    // El DNI (frente/dorso) se guarda en el JUGADOR, no en el fichaje: es el
    // mismo documento en todos los fichajes que tenga a lo largo del tiempo,
    // así que si el club lo sube/actualiza acá de paso queda disponible para
    // cualquier otro fichaje futuro también (ver migración 0041). Sólo se
    // pisa lo que vino en este pedido -- si no mandaron una foto nueva, se
    // deja la que ya tenía cargada.
    if (dni_frente_url || dni_dorso_url) {
      await query(
        `UPDATE jugadores SET
           dni_frente_url = COALESCE($1, dni_frente_url),
           dni_dorso_url = COALESCE($2, dni_dorso_url)
         WHERE id = $3 AND club_id = $4`,
        [dni_frente_url || null, dni_dorso_url || null, req.params.jugadorId, req.clubId]
      );
    }

    const { rows } = await query(
      `INSERT INTO fichajes (jugador_id, club_id, liga_id, torneo_id, categoria_id, subcategoria_id, documentos)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, '[]'::jsonb))
       RETURNING *`,
      [req.params.jugadorId, req.clubId, liga_id, torneo_id, categoria_id, subcategoria_id || null,
       documentos ? JSON.stringify(documentos) : null]
    );
    res.status(201).json({
      ok: true,
      fichaje: rows[0],
      aviso_otros_fichajes: otrosFichajes.length ? otrosFichajes : undefined,
    });
  } catch (err) {
    console.error('Error en POST fichajes:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  }
});

// DELETE /club/fichajes/:fichajeId — el Club da de baja un fichado por su
// cuenta ("Baja directa con aviso", decisión del roadmap): NO pasa por
// aprobación de la Liga, se borra directo. Antes de borrarlo se guarda un
// registro en fichajes_bajas (nombre, torneo, división, motivo) para que la
// Liga vea el aviso -- después de la baja no queda ningún otro rastro del
// fichaje (el carnet, si tenía, queda con fichaje_id en NULL por el
// ON DELETE SET NULL de la FK, y a partir de ahí no vuelve a validar
// habilitado porque GET /liga/carnets/validar hace INNER JOIN con fichajes).
router.delete('/:fichajeId', async (req, res) => {
  const { motivo } = req.body || {};
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT f.id, f.liga_id, f.club_id, f.estado,
              j.nombre AS jugador_nombre, j.apellido AS jugador_apellido, j.dni AS jugador_dni,
              t.nombre AS torneo_nombre, cat.nombre AS categoria_nombre, sub.nombre AS subcategoria_nombre
       FROM fichajes f
       JOIN jugadores j ON j.id = f.jugador_id
       LEFT JOIN torneos t ON t.id = f.torneo_id
       LEFT JOIN categorias cat ON cat.id = f.categoria_id
       LEFT JOIN categoria_subcategorias sub ON sub.id = f.subcategoria_id
       WHERE f.id = $1 AND f.club_id = $2
       FOR UPDATE OF f`,
      [req.params.fichajeId, req.clubId]
    );
    const fichaje = rows[0];
    if (!fichaje) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, error: 'Fichaje no encontrado en tu club' });
    }

    await client.query(
      `INSERT INTO fichajes_bajas
         (liga_id, club_id, jugador_nombre, jugador_apellido, jugador_dni,
          torneo_nombre, categoria_nombre, subcategoria_nombre, estado_al_momento, motivo, dado_de_baja_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        fichaje.liga_id,
        fichaje.club_id,
        fichaje.jugador_nombre,
        fichaje.jugador_apellido,
        fichaje.jugador_dni,
        fichaje.torneo_nombre,
        fichaje.categoria_nombre,
        fichaje.subcategoria_nombre,
        fichaje.estado,
        motivo && motivo.trim() ? motivo.trim() : null,
        req.usuario.id,
      ]
    );

    await client.query('DELETE FROM fichajes WHERE id = $1', [fichaje.id]);

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en DELETE /club/fichajes/:fichajeId:', err);
    res.status(500).json({ ok: false, error: 'Error interno' });
  } finally {
    client.release();
  }
});

module.exports = router;
