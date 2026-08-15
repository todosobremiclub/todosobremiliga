const { query } = require('../db');

// Calcula los puntos que se llevan local y visitante para UN partido, según
// el sistema_puntaje configurado en el torneo (JSON libre, ver docs/modelo-datos.md).
//
// Soporta dos "modos" sin que el resto del código tenga que saber de deportes:
//  - Modo "goles" (fútbol, handball, futsal): sistema_puntaje = {"victoria":3,"empate":1,"derrota":0}
//  - Modo "sets" (vóley, etc.): sistema_puntaje = {"3-0":3,"3-1":3,"3-2":2,"2-3":1,"1-3":0,"0-3":0}
//    (la clave es "sets del que está siendo evaluado - sets del rival")
function calcularPuntosPartido(resultadoLocal, resultadoVisitante, sistemaPuntaje) {
  const sp = sistemaPuntaje || {};

  if ('victoria' in sp || 'empate' in sp || 'derrota' in sp) {
    const v = sp.victoria ?? 3;
    const e = sp.empate ?? 1;
    const d = sp.derrota ?? 0;
    if (resultadoLocal > resultadoVisitante) return { local: v, visitante: d };
    if (resultadoLocal < resultadoVisitante) return { local: d, visitante: v };
    return { local: e, visitante: e };
  }

  const claveLocal = `${resultadoLocal}-${resultadoVisitante}`;
  const claveVisitante = `${resultadoVisitante}-${resultadoLocal}`;
  if (sp[claveLocal] != null && sp[claveVisitante] != null) {
    return { local: sp[claveLocal], visitante: sp[claveVisitante] };
  }

  // Fallback genérico si no hay sistema_puntaje configurado: gana 3, pierde 0, empata 1.
  if (resultadoLocal > resultadoVisitante) return { local: 3, visitante: 0 };
  if (resultadoLocal < resultadoVisitante) return { local: 0, visitante: 3 };
  return { local: 1, visitante: 1 };
}

// Recalcula TODA la tabla de posiciones de una categoría, a partir de los
// partidos jugados. Se recalcula desde cero cada vez (simple y sin riesgo de
// arrastrar errores de un cálculo incremental) — el volumen de partidos por
// categoría es chico, así que no hay problema de performance.
async function recalcularTablaPosiciones(torneoId, categoriaId) {
  const torneoResult = await query('SELECT sistema_puntaje FROM torneos WHERE id = $1', [torneoId]);
  const sistemaPuntaje = torneoResult.rows[0]?.sistema_puntaje || {};

  const equiposResult = await query(
    'SELECT id FROM equipos_torneo WHERE torneo_id = $1 AND categoria_id = $2',
    [torneoId, categoriaId]
  );

  const stats = {};
  for (const equipo of equiposResult.rows) {
    stats[equipo.id] = {
      partidos_jugados: 0, ganados: 0, empatados: 0, perdidos: 0,
      a_favor: 0, en_contra: 0, puntos: 0
    };
  }

  const partidosResult = await query(
    `SELECT equipo_local_id, equipo_visitante_id, resultado_local, resultado_visitante
     FROM partidos
     WHERE torneo_id = $1 AND categoria_id = $2 AND estado = 'jugado'
       AND resultado_local IS NOT NULL AND resultado_visitante IS NOT NULL`,
    [torneoId, categoriaId]
  );

  for (const p of partidosResult.rows) {
    const local = stats[p.equipo_local_id];
    const visitante = stats[p.equipo_visitante_id];
    if (!local || !visitante) continue; // equipo dado de baja, se ignora

    const { local: ptsLocal, visitante: ptsVisitante } = calcularPuntosPartido(
      p.resultado_local, p.resultado_visitante, sistemaPuntaje
    );

    local.partidos_jugados += 1;
    visitante.partidos_jugados += 1;
    local.a_favor += p.resultado_local;
    local.en_contra += p.resultado_visitante;
    visitante.a_favor += p.resultado_visitante;
    visitante.en_contra += p.resultado_local;
    local.puntos += ptsLocal;
    visitante.puntos += ptsVisitante;

    if (p.resultado_local > p.resultado_visitante) {
      local.ganados += 1;
      visitante.perdidos += 1;
    } else if (p.resultado_local < p.resultado_visitante) {
      local.perdidos += 1;
      visitante.ganados += 1;
    } else {
      local.empatados += 1;
      visitante.empatados += 1;
    }
  }

  for (const [equipoTorneoId, s] of Object.entries(stats)) {
    await query(
      `INSERT INTO tabla_posiciones
         (torneo_id, categoria_id, equipo_torneo_id, partidos_jugados, ganados, empatados, perdidos, a_favor, en_contra, diferencia, puntos, actualizado_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       ON CONFLICT (torneo_id, categoria_id, equipo_torneo_id) DO UPDATE SET
         partidos_jugados = EXCLUDED.partidos_jugados,
         ganados = EXCLUDED.ganados,
         empatados = EXCLUDED.empatados,
         perdidos = EXCLUDED.perdidos,
         a_favor = EXCLUDED.a_favor,
         en_contra = EXCLUDED.en_contra,
         diferencia = EXCLUDED.diferencia,
         puntos = EXCLUDED.puntos,
         actualizado_at = NOW()`,
      [torneoId, categoriaId, equipoTorneoId, s.partidos_jugados, s.ganados, s.empatados,
       s.perdidos, s.a_favor, s.en_contra, s.a_favor - s.en_contra, s.puntos]
    );
  }
}

module.exports = { calcularPuntosPartido, recalcularTablaPosiciones };
