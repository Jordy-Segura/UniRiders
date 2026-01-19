const sql = require('mssql');

const config = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('✅ Conectado a Azure SQL');
    return pool;
  })
  .catch(err => console.log('❌ Error al conectar con SQL Server:', err));

module.exports = { sql, poolPromise };
