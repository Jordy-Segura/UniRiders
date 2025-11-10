const sql = require('mssql');

const config = {
  user: 'sa',          // ej: 'sa' o el que uses
  password: 'sql',   // ej: '12345'
  server: 'localhost',         // o el nombre de tu instancia: 'localhost\\SQLEXPRESS'
  database: 'UniRiders',
  options: {
    encrypt: false, // true si usas Azure
    trustServerCertificate: true
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
  sql, poolPromise
};