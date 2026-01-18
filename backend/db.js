// 1. IMPORTANTE: Estas dos líneas deben ir SIEMPRE al principio
require('dotenv').config();
const sql = require('mssql');

const {
  DB_USER,
  DB_PASSWORD,
  DB_SERVER,
  DB_NAME,
  DB_ENCRYPT,
  DB_TRUST_CERT
} = process.env;

if (!DB_USER || !DB_PASSWORD || !DB_SERVER || !DB_NAME) {
  console.error('❌ Faltan variables de entorno para la base de datos (DB_USER, DB_PASSWORD, DB_SERVER, DB_NAME).');
  process.exit(1);
}

const config = {
  user: DB_USER,
  password: DB_PASSWORD,
  server: DB_SERVER,
  database: DB_NAME,
  options: {
    encrypt: DB_ENCRYPT === 'true',
    trustServerCertificate: DB_TRUST_CERT !== 'false'
  }
};

// 3. Crear el pool de conexión (Esta es la parte que te daba error)
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Conectado a SQL Server exitosamente');
    return pool;
  })
  .catch(err => {
    console.error('❌ Error conectando a la base de datos:', err);
    process.exit(1); // Detiene la app si falla la conexión
  });

// 4. Exportamos para usarlo en otros archivos
module.exports = {
  sql,
  poolPromise
};
