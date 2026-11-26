// Polibio PostgreSQL Schema Initialization Script
const path = require('path');
const fs = require('fs');

console.log('========================================================================');
console.log('🗄️ INICIALIZADOR DE BASE DE DATOS POSTGRESQL PARA POLIBIO');
console.log('========================================================================\n');

const POSTGRES_PORT = process.env.POSTGRES_PORT || '15432';
const DATABASE_URL = process.env.DATABASE_URL || `postgres://polibio_admin:polibio_secure_password_2026@localhost:${POSTGRES_PORT}/polibio_db`;

async function init() {
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    console.error('El módulo "pg" no está instalado.');
    console.log('Por favor instálelo ejecutando: npm install pg\n');
    process.exit(1);
  }

  const { Client } = pg;
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log(`Conectando a: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}...`);
    await client.connect();
    console.log('✓ Conexión establecida.');

    const schemaPath = path.join(__dirname, '../config/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Archivo schema.sql no encontrado en: ${schemaPath}`);
    }

    console.log('Ejecutando DDL (Tablas, Índices, RLS, Triggers y Bloque Génesis)...');
    const sql = fs.readFileSync(schemaPath, 'utf8');
    await client.query(sql);

    console.log('\n========================================================================');
    console.log('✅ ESQUEMA POSTGRESQL INICIALIZADO SATISFACTORIAMENTE');
    console.log('========================================================================\n');
    console.log('Tablas listas:');
    console.log(' • documents (con Row-Level Security activo)');
    console.log(' • document_signatures (firmas PKI X.509)');
    console.log(' • blockchain_blocks (con Bloque Génesis inicializado)');
    console.log(' • blockchain_transactions (auditoría forense inmutable)');
    console.log(' • pki_certificates (almacén de certificados de funcionarios)\n');
  } catch (err) {
    console.error('\n❌ ERROR INICIALIZANDO POSTGRESQL:', err.message);
  } finally {
    await client.end();
  }
}

init();

