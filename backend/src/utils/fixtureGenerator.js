// Generador de fixture automático "todos contra todos" (round-robin), método
// del círculo: garantiza que cada equipo juegue como máximo una vez por
// jornada (nunca hay dos partidos de un mismo equipo en la misma fecha).
//
// Devuelve un array de rondas; cada ronda es un array de pares [localId, visitanteId].
// Si el ida_vuelta es true, se agregan las mismas rondas con local/visitante
// invertidos, numeradas después de las de ida.
function generarRoundRobin(equipoIds, idaVuelta) {
  const ids = equipoIds.slice();
  if (ids.length < 2) return [];

  const conBye = ids.length % 2 !== 0;
  if (conBye) ids.push(null); // "bye": el equipo que le toca descansa esa jornada

  const n = ids.length;
  const rondas = n - 1;
  const mitad = n / 2;

  let arr = ids.slice();
  const idaSchedule = [];

  for (let r = 0; r < rondas; r++) {
    const partidosRonda = [];
    for (let i = 0; i < mitad; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a !== null && b !== null) {
        // Alterna quién es local para repartir más parejo la localía.
        partidosRonda.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    idaSchedule.push(partidosRonda);

    // Rotación método del círculo: el primero queda fijo, el resto rota.
    const fijo = arr[0];
    const resto = arr.slice(1);
    resto.unshift(resto.pop());
    arr = [fijo, ...resto];
  }

  if (!idaVuelta) return idaSchedule;

  const vueltaSchedule = idaSchedule.map((ronda) => ronda.map(([local, visitante]) => [visitante, local]));
  return [...idaSchedule, ...vueltaSchedule];
}

module.exports = { generarRoundRobin };
