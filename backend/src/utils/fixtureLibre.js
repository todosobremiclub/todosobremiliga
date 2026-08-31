// Calcula, para una unidad (torneo + categoría + subcategoría) con cantidad
// IMPAR de equipos, en qué jornada le toca descansar a cada equipo -- el
// generador de fixture (ver fixtureGenerator.js, método del círculo) ya deja
// a un equipo sin partido cada jornada en ese caso, pero hasta ahora eso no
// se guardaba ni se mostraba en ningún lado: el equipo simplemente
// "desaparecía" esa fecha. Esto arma, a partir de los partidos YA cargados,
// una entrada de "descanso" por cada jornada donde a algún equipo no le tocó
// jugar, para que el fixture pueda mostrar "vs LIBRE" en su lugar.
//
// No toca la base de datos ni el fixture guardado -- se calcula al vuelo
// cada vez que se pide el fixture, así que nunca puede quedar desincronizado
// y no había que migrar nada. Por la misma razón, un descanso nunca cuenta
// como partido jugado ni suma puntos: no es una fila de la tabla `partidos`.
//
// `equipoIds` es el padrón completo de equipos inscriptos en la unidad
// (mismo criterio que usa fixtureGenerator para armar el fixture). `partidos`
// son las filas ya cargadas (necesita al menos `jornada`, `equipo_local_id`,
// `equipo_visitante_id`). Devuelve [{ jornada, equipoTorneoId }].
function calcularDescansos(equipoIds, partidos) {
  if (equipoIds.length % 2 === 0) return [];

  const porJornada = new Map();
  for (const p of partidos) {
    if (p.jornada == null) continue;
    if (!porJornada.has(p.jornada)) porJornada.set(p.jornada, new Set());
    porJornada.get(p.jornada).add(p.equipo_local_id);
    porJornada.get(p.jornada).add(p.equipo_visitante_id);
  }

  const descansos = [];
  for (const [jornada, jugaron] of porJornada) {
    const libre = equipoIds.find((id) => !jugaron.has(id));
    if (libre) descansos.push({ jornada, equipoTorneoId: libre });
  }
  return descansos;
}

module.exports = { calcularDescansos };
