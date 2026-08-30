const { Pool, types } = require('pg');

// Por default, node-postgres devuelve las columnas NUMERIC/DECIMAL (OID 1700)
// como STRING en vez de number, para no perder precisión con valores muy
// grandes. Nuestros montos de dinero (club_deudas.monto, club_pagos.monto,
// torneo_conceptos_pago.monto, etc.) son NUMERIC(12,2) -- valores chicos,
// sin riesgo de perder precisión como float -- así que conviene que el JSON
// que reciben la web y la app ya venga como número. Sin esto, cualquier
// pantalla que castea `json['monto'] as num?` en Dart (o `Number(...)` fallido
// en JS) puede romper con "type 'String' is not a subtype of type 'num?'".
types.setTypeParser(1700, (val) => (val === null ? null : parseFloat(val)));

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.warn('⚠️ DATABASE_URL no está configurada.');
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: { rejectUnauthorized: false } // necesario en Render
    })
  : null;

async function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL no configurada');
  return pool.query(text, params);
}

async function getClient() {
  if (!pool) throw new Error('DATABASE_URL no configurada');
  return pool.connect();
}

module.exports = { query, getClient };
