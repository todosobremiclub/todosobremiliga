const { query } = require('../db');

// Chequea si un usuario con rol "autoridad" tiene alcance para cargar el
// resultado de un partido puntual. El alcance se guarda en
// liga_autoridad_asignaciones como (torneo_id, categoria_id?, subcategoria_id?)
// -- NULL en categoria_id/subcategoria_id significa "todo lo de abajo".
// La subcategoría de un partido no está en `partidos` directamente: se
// deduce del equipo local (equipos_torneo.subcategoria_id), igual que en
// el resto de la plataforma.
async function autoridadTieneAlcance(usuarioId, torneoId, categoriaId, partidoId) {
  const { rows: partidoRows } = await query(
    `SELECT et.subcategoria_id
     FROM partidos p
     JOIN equipos_torneo et ON et.id = p.equipo_local_id
     WHERE p.id = $1`,
    [partidoId]
  );
  const subcategoriaId = partidoRows[0] ? partidoRows[0].subcategoria_id : null;

  const { rows } = await query(
    `SELECT 1 FROM liga_autoridad_asignaciones
     WHERE usuario_id = $1
       AND torneo_id = $2
       AND (categoria_id IS NULL OR categoria_id = $3)
       AND (subcategoria_id IS NULL OR subcategoria_id = $4)
     LIMIT 1`,
    [usuarioId, torneoId, categoriaId, subcategoriaId]
  );
  return rows.length > 0;
}

module.exports = { autoridadTieneAlcance };
