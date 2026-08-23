// Job programado: el primer día de cada mes, a las 06:00 (hora Argentina),
// genera automáticamente la deuda de "cuota mensual" del período que arranca
// para todos los torneos que tengan ese concepto activo — así la Liga no
// tiene que entrar a generarlo a mano todos los meses (el botón manual en
// Configuración → Cobros queda para casos puntuales: un período pasado, o
// forzarlo antes de que corra este proceso).
//
// OJO si el servicio de Render es de un plan que "duerme" por inactividad:
// este job corre DENTRO del proceso de la app, así que si el proceso está
// dormido a la hora programada, esa corrida no sucede (recién se pone al día
// cuando alguien vuelve a abrir la app y el proceso arranca de nuevo, pero
// no created retroactivamente). En un plan siempre activo (o con un "cron
// job" separado de Render pegándole a algún endpoint para mantenerlo
// despierto) no hay problema.

const cron = require('node-cron');
const { query } = require('../db');
const { generarDeudasMensual, periodoActualArgentina } = require('../utils/cobros');

async function ejecutarGeneracionMensualAutomatica() {
  const periodo = periodoActualArgentina();
  console.log(`[cobrosMensual] Generando cuota mensual del período ${periodo}...`);
  try {
    const torneosResult = await query(
      `SELECT DISTINCT torneo_id FROM torneo_conceptos_pago WHERE tipo = 'mensual' AND activo = TRUE`
    );
    let totalGeneradas = 0;
    for (const { torneo_id } of torneosResult.rows) {
      const resultado = await generarDeudasMensual(torneo_id, periodo);
      totalGeneradas += resultado.generadas;
    }
    console.log(`[cobrosMensual] Listo: ${totalGeneradas} deuda(s) generada(s) en ${torneosResult.rows.length} torneo(s) para el período ${periodo}.`);
  } catch (err) {
    console.error('[cobrosMensual] Error generando la cuota mensual automática:', err);
  }
}

// Se registra una sola vez al arrancar el servidor (ver src/app.js).
function programarGeneracionMensualAutomatica() {
  cron.schedule('0 6 1 * *', ejecutarGeneracionMensualAutomatica, {
    timezone: 'America/Argentina/Buenos_Aires'
  });
  console.log('[cobrosMensual] Programado: se ejecuta el día 1 de cada mes a las 06:00 (hora Argentina).');
}

module.exports = { programarGeneracionMensualAutomatica, ejecutarGeneracionMensualAutomatica };
