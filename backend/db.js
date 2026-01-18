<<<<<<< HEAD
const sql = require('mssql');

const config = {
  user: 'sa',          // ej: 'sa' o el que uses
  password: 'sql',   // ej: '12345'
  server: 'localhost',         // o el nombre de tu instancia: 'localhost\\SQLEXPRESS'
  database: 'UniRidersDB',
  options: {
    encrypt: false, // true si usas Azure
    trustServerCertificate: true
=======
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
>>>>>>> 11713c5b9db2c881a1630ad823cc454f9912f9ed
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Conectado a SQL Server');
    return pool;
  })
  .catch(err => console.log('❌ Error al conectar con SQL Server:', err));

module.exports = {
<<<<<<< HEAD
  sql, poolPromise
};
=======
  sql,
  poolPromise
};
>>>>>>> 11713c5b9db2c881a1630ad823cc454f9912f9ed
