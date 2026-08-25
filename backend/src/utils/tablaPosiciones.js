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

// Calcula las estadísticas (PJ, G, E, P, GF, GC, Pts) de una lista de
// equipoIds a partir de una lista de partidos ya jugados.
function calcularStats(equipoIds, partidos, sistemaPuntaje) {
  const stats = {};
  for (const id of equipoIds) {
    stats[id] = { partidos_jugados: 0, ganados: 0, empatados: 0, perdidos: 0, a_favor: 0, en_contra: 0, puntos: 0 };
  }
  for (const p of partidos) {
    const local = stats[p.equipo_local_id];
    const visitante = stats[p.equipo_visitante_id];
    if (!local || !visitante) continue; // equipo dado de baja, se ignora

    local.partidos_jugados += 1;
    visitante.partidos_jugados += 1;

    // Doble incomparecencia: ningún equipo se presentó, así que pierden los
    // dos (0 puntos cada uno) sin comparar ningún marcador — de lo
    // contrario el 0 a 0 que se guarda para tener algo que mostrar se
    // contaría, incorrectamente, como un empate para ambos.
    if (p.no_presento_local && p.no_presento_visitante) {
      local.perdidos += 1;
      visitante.perdidos += 1;
      continue;
    }

    const { local: ptsLocal, visitante: ptsVisitante } = calcularPuntosPartido(
      p.resultado_local, p.resultado_visitante, sistemaPuntaje
    );

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
  return stats;
}

async function guardarTabla(torneoId, categoriaId, ronda, stats) {
  for (const [equipoTorneoId, s] of Object.entries(stats)) {
    await query(
      `INSERT INTO tabla_posiciones
         (torneo_id, categoria_id, equipo_torneo_id, ronda, partidos_jugados, ganados, empatados, perdidos, a_favor, en_contra, diferencia, puntos, actualizado_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (torneo_id, categoria_id, equipo_torneo_id, ronda) DO UPDATE SET
         partidos_jugados = EXCLUDED.partidos_jugados,
         ganados = EXCLUDED.ganados,
         empatados = EXCLUDED.empatados,
         perdidos = EXCLUDED.perdidos,
         a_favor = EXCLUDED.a_favor,
         en_contra = EXCLUDED.en_contra,
         diferencia = EXCLUDED.diferencia,
         puntos = EXCLUDED.puntos,
         actualizado_at = NOW()`,
      [torneoId, categoriaId, equipoTorneoId, ronda, s.partidos_jugados, s.ganados, s.empatados,
       s.perdidos, s.a_favor, s.en_contra, s.a_favor - s.en_contra, s.puntos]
    );
  }
}

// Recalcula TODA la tabla de posiciones de una división, a partir de los
// partidos jugados. Se recalcula desde cero cada vez (simple y sin riesgo de
// arrastrar errores de un cálculo incremental) — el volumen de partidos por
// división es chico, así que no hay problema de performance.
//
// Si el torneo tiene formato "apertura_clausura", se guardan TRES tablas
// separadas (ronda='apertura', ronda='clausura' y ronda='general' con el
// acumulado de ambas). Para el resto de los formatos, se guarda solo la
// tabla "general" (comportamiento de siempre).
async function recalcularTablaPosiciones(torneoId, categoriaId) {
  const torneoResult = await query('SELECT sistema_puntaje, formato_juego FROM torneos WHERE id = $1', [torneoId]);
  const sistemaPuntaje = torneoResult.rows[0]?.sistema_puntaje || {};
  const formatoJuego = torneoResult.rows[0]?.formato_juego;

  const equiposResult = await query(
    'SELECT id FROM equipos_torneo WHERE torneo_id = $1 AND categoria_id = $2',
    [torneoId, categoriaId]
  );
  const equipoIds = equiposResult.rows.map((e) => e.id);

  // Importante: se excluyen los partidos de la llave de eliminación (fase
  // 'octavos', 'cuartos', etc. — todo lo que no sea NULL o 'grupos'). La
  // tabla de posiciones representa la fase de grupos/temporada regular; los
  // resultados de playoffs no tienen que mezclarse ahí ni afectarla.
  const partidosResult = await query(
    `SELECT equipo_local_id, equipo_visitante_id, resultado_local, resultado_visitante, ronda,
            no_presento_local, no_presento_visitante
     FROM partidos
     WHERE torneo_id = $1 AND categoria_id = $2 AND estado = 'jugado'
       AND resultado_local IS NOT NULL AND resultado_visitante IS NOT NULL
       AND (fase IS NULL OR fase = 'grupos')`,
    [torneoId, categoriaId]
  );

  if (formatoJuego === 'apertura_clausura') {
    const deApertura = partidosResult.rows.filter((p) => p.ronda === 'apertura');
    const deClausura = partidosResult.rows.filter((p) => p.ronda === 'clausura');
    await guardarTabla(torneoId, categoriaId, 'apertura', calcularStats(equipoIds, deApertura, sistemaPuntaje));
    await guardarTabla(torneoId, categoriaId, 'clausura', calcularStats(equipoIds, deClausura, sistemaPuntaje));
    await guardarTabla(torneoId, categoriaId, 'general', calcularStats(equipoIds, partidosResult.rows, sistemaPuntaje));
  } else {
    await guardarTabla(torneoId, categoriaId, 'general', calcularStats(equipoIds, partidosResult.rows, sistemaPuntaje));
  }
}

module.exports = { calcularPuntosPartido, recalcularTablaPosiciones };
