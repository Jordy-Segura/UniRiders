const { Pool } = require('pg');

const useSsl = process.env.DB_SSL === 'true';
const connectionString = process.env.DATABASE_URL || null;
const config = connectionString
  ? { connectionString, ssl: useSsl ? { rejectUnauthorized: false } : false }
  : {
      host: process.env.DB_HOST || process.env.DB_SERVER || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'uniriders',
      port: Number(process.env.DB_PORT || 5432),
      ssl: useSsl ? { rejectUnauthorized: false } : false
    };

const pool = new Pool(config);

class PgRequest {
  constructor(clientOrPool) {
    this.client = clientOrPool;
    this.params = new Map();
  }

  input(name, typeOrValue, valueMaybe) {
    const value = valueMaybe === undefined ? typeOrValue : valueMaybe;
    this.params.set(name, value);
    return this;
  }

  async query(sqlText) {
    const { text, values } = buildQuery(sqlText, this.params);
    const result = await this.client.query(text, values);
    return {
      recordset: result.rows,
      rowCount: result.rowCount,
      rowsAffected: [result.rowCount]
    };
  }
}

class PgPoolWrapper {
  constructor(poolInstance) {
    this.pool = poolInstance;
  }

  request() {
    return new PgRequest(this.pool);
  }
}

class PgTransaction {
  constructor(poolWrapper) {
    this.pool = poolWrapper?.pool || poolWrapper;
    this.client = null;
  }

  async begin() {
    this.client = await this.pool.connect();
    await this.client.query('BEGIN');
  }

  async commit() {
    await this.client.query('COMMIT');
    this.client.release();
  }

  async rollback() {
    await this.client.query('ROLLBACK');
    this.client.release();
  }

  request() {
    if (!this.client) {
      throw new Error('Transaction has not started.');
    }

    return new PgRequest(this.client);
  }
}

function buildQuery(sqlText, params) {
  const values = [];
  const indexMap = new Map();

  const text = sqlText.replace(/@([a-zA-Z0-9_]+)/g, (_, name) => {
    if (!params.has(name)) {
      throw new Error(`Missing parameter: ${name}`);
    }

    if (!indexMap.has(name)) {
      indexMap.set(name, values.length + 1);
      values.push(params.get(name));
    }

    return `$${indexMap.get(name)}`;
  });

  return { text, values };
}

const poolPromise = pool
  .connect()
  .then(client => {
    console.log('✅ Conectado a PostgreSQL');
    client.release();
    return new PgPoolWrapper(pool);
  })
  .catch(err => {
    console.log('❌ Error al conectar con PostgreSQL:', err);
    throw err;
  });

const sql = {
  Transaction: PgTransaction,
  NVarChar: 'text',
  Int: 'int',
  Bit: 'bool',
  VarBinary: () => 'bytea',
  MAX: 'max',
  Decimal: () => 'numeric'
};

module.exports = {
  sql,
  poolPromise
};
