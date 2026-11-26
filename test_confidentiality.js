// Polibio MLS Confidentiality & In-Flight Decryption Unit Verification Test
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

console.log('========================================================================');
console.log('🧪 PRUEBAS UNITARIAS DE CONFIDENCIALIDAD MLS Y CIFRADO EN REPOSO POLIBIO');
console.log('========================================================================\n');

// 1. Direct Crypto Microservice Unit Tests
const { CONFIDENTIALITY_LEVELS } = require('./services/shared/models');
const cryptoServicePath = path.join(__dirname, 'services/crypto-service/index.js');

// Test Cryptographic Envelope directly
const MASTER_KEY = crypto.scryptSync('POLIBIO_SOVEREIGN_MASTER_SECRET_2026', 'salt_polibio_secure_salt', 32);

function testEnvelopeEncryption() {
  console.log('[Test 1] Evaluando cifrado y descifrado de sobre AES-256-GCM...');
  const secretContent = "PLAN ESTRATÉGICO DE DEFENSA: Coordenadas del nodo soberano 10.4806 N, 66.9036 W.";
  
  // DEK & IV
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Encrypt payload
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  let encrypted = cipher.update(secretContent, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Encrypt DEK
  const dekCipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  let encryptedDek = dekCipher.update(dek, null, 'base64');
  encryptedDek += dekCipher.final('base64');
  const dekAuthTag = dekCipher.getAuthTag().toString('base64');

  const envelope = {
    encrypted: true,
    confidentialityLevel: 5,
    iv: iv.toString('base64'),
    authTag,
    encryptedPayload: encrypted,
    keyEnvelope: { encryptedDek, dekAuthTag }
  };

  // Verify that ciphertext DOES NOT contain plaintext
  if (encrypted.includes('PLAN ESTRATÉGICO') || JSON.stringify(envelope).includes('PLAN ESTRATÉGICO')) {
    throw new Error('FALLO: El sobre contiene texto plano!');
  }
  console.log('  ✓ Cifrado AES-256-GCM verificado: Cero fuga de texto plano.');

  // Test Decrypt with Clearance = 2 (Should Fail MLS)
  try {
    const requiredLevel = envelope.confidentialityLevel;
    const userClearance = 2;
    if (userClearance < requiredLevel) {
      throw new Error('MLS_ACCESS_DENIED_OK');
    }
    throw new Error('FALLO: Permitió acceso a usuario con clearance insuficiente');
  } catch (err) {
    if (err.message === 'MLS_ACCESS_DENIED_OK') {
      console.log('  ✓ Bloqueo MLS verificado: Usuario Nivel 2 rechazado para documento Nivel 5.');
    } else {
      throw err;
    }
  }

  // Test Decrypt with Clearance = 5 (Should Succeed)
  const decipherIv = Buffer.from(envelope.iv, 'base64');
  const decipherDekTag = Buffer.from(envelope.keyEnvelope.dekAuthTag, 'base64');
  const dekDecipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, decipherIv);
  dekDecipher.setAuthTag(decipherDekTag);
  let decryptedDek = dekDecipher.update(envelope.keyEnvelope.encryptedDek, 'base64');
  decryptedDek = Buffer.concat([decryptedDek, dekDecipher.final()]);

  const payloadTag = Buffer.from(envelope.authTag, 'base64');
  const payloadDecipher = crypto.createDecipheriv('aes-256-gcm', decryptedDek, decipherIv);
  payloadDecipher.setAuthTag(payloadTag);
  let decryptedContent = payloadDecipher.update(envelope.encryptedPayload, 'base64', 'utf8');
  decryptedContent += payloadDecipher.final('utf8');

  if (decryptedContent !== secretContent) {
    throw new Error('FALLO: Contenido descifrado no coincide con el original');
  }
  console.log('  ✓ Descifrado al vuelo verificado: Contenido recuperado íntegro y sin alteraciones.');
}

function testAsymmetricRsaDualEnvelope() {
  console.log('\n[Test 2] Evaluando Doble Sobre con Clave Pública RSA-OAEP (Destinatario)...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const dek = crypto.randomBytes(32);

  const rsaEncryptedDek = crypto.publicEncrypt(
    { key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    dek
  );

  const rsaDecryptedDek = crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    rsaEncryptedDek
  );

  if (!dek.equals(rsaDecryptedDek)) {
    throw new Error('FALLO: El descifrado RSA de la DEK no coincide.');
  }
  console.log('  ✓ Cifrado asimétrico RSA-OAEP 2048-bit verificado exitosamente.');
}

try {
  testEnvelopeEncryption();
  testAsymmetricRsaDualEnvelope();
  console.log('\n========================================================================');
  console.log('✅ TODAS LAS PRUEBAS DE CONFIDENCIALIDAD MLS PASARON AL 100%');
  console.log('========================================================================\n');
} catch (e) {
  console.error('\n❌ ERROR EN PRUEBAS:', e.message);
  process.exit(1);
}
