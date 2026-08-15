// Script de uso único (o cada vez que necesites resetear la clave) para crear
// o actualizar el usuario Super Admin. Se corre a mano, nunca queda expuesto
// como endpoint HTTP por seguridad.
//
// Uso (parado en la carpeta backend/, con el .env apuntando a la DATABASE_URL
// de Render — la External Database URL):
//   node scripts/crear-super-admin.js correo@ejemplo.com "unaClaveSegura" "Nombre Completo"

require('dotenv').config();
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

async function main() {
  const [, , email, password, nombre] = process.argv;

  if (!email || !password) {
    console.log('Uso: node scripts/crear-super-admin.js <email> <password> ["Nombre Completo"]');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('❌ Falta DATABASE_URL en el .env (usar la External Database URL de Render).');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const passwordHash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO usuarios (email, password_hash, nombre, rol, activo)
     VALUES ($1, $2, $3, 'super_admin', TRUE)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, nombre = EXCLUDED.nombre
     RETURNING id, email, nombre, rol`,
    [email, passwordHash, nombre || 'Super Admin']
  );

  console.log('✅ Super admin listo:', rows[0]);
  await pool.end();
}

main().catch((err) => {
  console.error('❌ Error creando el super admin:', err.message);
  process.exit(1);
});
