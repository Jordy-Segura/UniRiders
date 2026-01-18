// 1. IMPORTANTE: Estas dos líneas deben ir SIEMPRE al principio
require('dotenv').config();
const sql = require('mssql'); // <-- Esta es la que te faltaba


const config = {
    user: 'db_ac3f91_uniridersdb_admin', 
    password: 'Jordy.2005',  // <--- Escríbela aquí directo
    server: 'SQL5110.site4now.net',
    database: 'db_ac3f91_uniridersdb',
    options: {
        encrypt: false,
        trustServerCertificate: true
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