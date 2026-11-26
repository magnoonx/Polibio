// Polibio PostgreSQL Sovereign Database Adapter
// Provides connection pooling, automatic failover, and Row-Level Security (RLS) enforcement
const fs = require('fs');
const path = require('path');

let pool = null;
let isConnected = false;
let pgModule = null;

// Lazy-load 'pg' so the application can run in pure zero-dependency JSON mode if pg is not installed
try {
  pgModule = require('pg');
} catch (e) {
  // pg module not installed yet
}

const DATABASE_URL = process.env.DATABASE_URL || null;

async function getPool() {
  if (pool) return pool;
  if (!pgModule || !DATABASE_URL) return null;

  try {
    const { Pool } = pgModule;
    pool = new Pool({
      connectionString: DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000
    });

    // Test connection
    const client = await pool.connect();
    isConnected = true;
    client.release();
    console.log('[PostgreSQL] Conexión establecida exitosamente con el clúster de base de datos.');
    return pool;
  } catch (err) {
    console.warn('[PostgreSQL] No se pudo conectar a PostgreSQL (' + err.message + '). Operando en modo local.');
    pool = null;
    isConnected = false;
    return null;
  }
}

// Execute query with native PostgreSQL Row-Level Security (RLS) enforcement
async function queryWithClearance(sql, params = [], userClearance = 1) {
  const p = await getPool();
  if (!p) return null;

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    // Set user clearance for RLS policy evaluation
    await client.query(`SET LOCAL polibio.user_clearance = $1`, [userClearance.toString()]);
    const res = await client.query(sql, params);
    await client.query('COMMIT');
    return res.rows;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Standard query
async function query(sql, params = []) {
  const p = await getPool();
  if (!p) return null;
  const res = await p.query(sql, params);
  return res.rows;
}

// Initialize database schema from config/schema.sql
async function initializeSchema() {
  const p = await getPool();
  if (!p) return false;

  const schemaPath = path.join(__dirname, '../../config/schema.sql');
  if (!fs.existsSync(schemaPath)) return false;

  try {
    const ddl = fs.readFileSync(schemaPath, 'utf8');
    await p.query(ddl);
    console.log('[PostgreSQL] Esquema DDL y políticas RLS inicializadas correctamente.');
    return true;
  } catch (err) {
    console.error('[PostgreSQL] Error al ejecutar schema.sql:', err.message);
    return false;
  }
}

module.exports = {
  isConfigured: () => Boolean(DATABASE_URL && pgModule),
  isConnected: () => isConnected,
  getPool,
  query,
  queryWithClearance,
  initializeSchema
};

