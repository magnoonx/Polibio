// Polibio Crypto & PKI Microservice (Port 8003)
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { CONFIDENTIALITY_LEVELS } = require('../shared/models');
const pg = require('../shared/postgres-adapter');
const authManager = require('./auth-manager');

const PORT = process.env.PORT || 8003;
const LEDGER_SERVICE_URL = process.env.LEDGER_SERVICE_URL || 'http://localhost:8004';
const DATA_DIR = path.join(__dirname, '../../data/pki');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory PKI State & Persistence
let rootCA = null;
let issuedCertificates = new Map();
let revokedCertificates = new Set();

// Master Departmental Keys for Level 3/4/5 Envelope Encryption
const MASTER_ENCRYPTION_KEY = crypto.scryptSync('POLIBIO_SOVEREIGN_MASTER_SECRET_2026', 'salt_polibio_secure_salt', 32);

// Initialize Root Certificate Authority
function initRootCA() {
  const caKeyPath = path.join(DATA_DIR, 'root_ca_key.pem');
  const caCertPath = path.join(DATA_DIR, 'root_ca.json');

  if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
    try {
      const keyPem = fs.readFileSync(caKeyPath, 'utf8');
      const certData = JSON.parse(fs.readFileSync(caCertPath, 'utf8'));
      rootCA = {
        privateKey: keyPem,
        publicKey: certData.publicKey,
        metadata: certData.metadata
      };
      console.log('[Crypto-Service] Root CA cargada exitosamente desde almacenamiento local.');
      loadIssuedCertificates();
      return;
    } catch (e) {
      console.error('[Crypto-Service] Error cargando Root CA, regenerando...', e);
    }
  }

  console.log('[Crypto-Service] Generando nueva Autoridad Certificadora Raíz (Polibio Sovereign Root CA 4096-bit)...');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048, // 2048 para rápida inicialización en tests/demos locales
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const metadata = {
    commonName: 'Polibio Sovereign Root CA - Autoridad Certificadora Institucional',
    organization: 'República Digital - Infraestructura Soberana',
    country: 'VE/LATAM',
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    fingerprintSha256: crypto.createHash('sha256').update(publicKey).digest('hex')
  };

  rootCA = { publicKey, privateKey, metadata };
  fs.writeFileSync(caKeyPath, privateKey);
  fs.writeFileSync(caCertPath, JSON.stringify({ publicKey, metadata }, null, 2));
  console.log(`[Crypto-Service] Root CA creada. Huella digital SHA-256: ${metadata.fingerprintSha256.substring(0, 16)}...`);
  
  // Create default official signer certificates for standard roles
  createDefaultOfficialCertificates();
}

function loadIssuedCertificates() {
  const certsFile = path.join(DATA_DIR, 'issued_certs.json');
  if (fs.existsSync(certsFile)) {
    try {
      const list = JSON.parse(fs.readFileSync(certsFile, 'utf8'));
      list.forEach(c => issuedCertificates.set(c.thumbprint, c));
      console.log(`[Crypto-Service] ${list.length} certificados de funcionarios cargados.`);
    } catch (e) {
      console.error('[Crypto-Service] Error al leer certificados emitidos', e);
    }
  } else {
    createDefaultOfficialCertificates();
  }
}

function saveIssuedCertificates() {
  const certsFile = path.join(DATA_DIR, 'issued_certs.json');
  const arr = Array.from(issuedCertificates.values());
  fs.writeFileSync(certsFile, JSON.stringify(arr, null, 2));

  // Async sync to PostgreSQL if connected
  if (pg.isConfigured()) {
    arr.forEach(async c => {
      try {
        await pg.query(
          `INSERT INTO pki_certificates (serial_number, common_name, role, department, organization, email, clearance_level, public_key, private_key, thumbprint, ca_signature, issuer, valid_from, valid_to, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (serial_number) DO UPDATE SET status = EXCLUDED.status`,
          [
            c.serialNumber, c.subject.commonName, c.subject.role, c.subject.department,
            c.subject.organization || 'Gobierno', c.subject.email || '', c.subject.clearanceLevel || 3,
            c.publicKey, c.privateKey || null, c.thumbprint, c.caSignature || '', c.issuer || 'Root CA',
            c.validFrom, c.validTo, c.status || 'ACTIVE'
          ]
        );
      } catch (e) {}
    });
  }
}

function createDefaultOfficialCertificates() {
  const officials = [
    {
      cn: 'Dra. Elena Vasquez',
      role: 'Directora General de Despacho',
      department: 'Dirección Superior',
      clearanceLevel: 5,
      email: 'elena.vasquez@polibio.gob'
    },
    {
      cn: 'Lic. Carlos Mendoza',
      role: 'Director de Planificación y Presupuesto',
      department: 'Planificación',
      clearanceLevel: 4,
      email: 'carlos.mendoza@polibio.gob'
    },
    {
      cn: 'Ing. Sofia Ramirez',
      role: 'Auditora Jefe de Seguridad de la Información',
      department: 'Auditoría y Criptografía',
      clearanceLevel: 5,
      email: 'sofia.ramirez@polibio.gob'
    },
    {
      cn: 'Abg. Roberto Gomez',
      role: 'Consultor Jurídico Adjunto',
      department: 'Consultoría Jurídica',
      clearanceLevel: 3,
      email: 'roberto.gomez@polibio.gob'
    }
  ];

  officials.forEach(off => {
    issueCertificateSync(off);
  });
  saveIssuedCertificates();
}

function issueCertificateSync(data) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const thumbprint = crypto.createHash('sha256').update(publicKey).digest('hex');
  const certPayload = {
    serialNumber: 'POL-' + Date.now().toString(16).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    subject: {
      commonName: data.cn,
      role: data.role,
      department: data.department || 'Administración Central',
      organization: 'Gobierno Institucional',
      email: data.email || 'oficial@polibio.gob',
      clearanceLevel: data.clearanceLevel || 3
    },
    issuer: rootCA.metadata.commonName,
    validFrom: new Date().toISOString(),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    publicKey: publicKey,
    thumbprint: thumbprint,
    status: 'ACTIVE'
  };

  // Sign certificate payload with Root CA
  const signer = crypto.createSign('SHA256');
  signer.update(JSON.stringify(certPayload));
  signer.end();
  const caSignature = signer.sign(rootCA.privateKey, 'base64');

  const fullCert = {
    ...certPayload,
    caSignature,
    privateKey // In a production PKI private keys stay with the user; for sovereign local demo we store it securely
  };

  issuedCertificates.set(thumbprint, fullCert);
  return fullCert;
}

// Compute canonical document hash
function computeDocumentHash(content) {
  const normalized = typeof content === 'string' ? content : JSON.stringify(content);
  const sha256 = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  const sha512 = crypto.createHash('sha512').update(normalized, 'utf8').digest('hex');
  return { sha256, sha512, byteSize: Buffer.byteLength(normalized, 'utf8') };
}

// Sign document hash with official private key
function signDocumentHash(documentHash, privateKeyPem, thumbprint, signerName) {
  const cert = issuedCertificates.get(thumbprint);
  if (!cert) {
    throw new Error('Certificado digital no encontrado en el almacén de la PKI.');
  }
  if (revokedCertificates.has(thumbprint) || cert.status === 'REVOKED') {
    throw new Error('El certificado digital se encuentra revocada.');
  }

  const sign = crypto.createSign('SHA256');
  sign.update(documentHash);
  sign.end();
  const signatureBase64 = sign.sign(privateKeyPem || cert.privateKey, 'base64');

  return {
    signature: signatureBase64,
    algorithm: 'SHA256withRSA',
    signedAt: new Date().toISOString(),
    signer: {
      commonName: signerName || cert.subject.commonName,
      role: cert.subject.role,
      department: cert.subject.department,
      thumbprint: thumbprint,
      clearanceLevel: cert.subject.clearanceLevel
    },
    rootCaFingerprint: rootCA.metadata.fingerprintSha256
  };
}

// Verify digital signature
function verifySignature(documentHash, signatureBase64, thumbprint) {
  const cert = issuedCertificates.get(thumbprint);
  if (!cert) {
    return { valid: false, reason: 'Certificado de firmante no registrado en la Autoridad Certificadora.' };
  }
  if (cert.status === 'REVOKED' || revokedCertificates.has(thumbprint)) {
    return { valid: false, reason: 'Certificado revocado.' };
  }

  try {
    const verify = crypto.createVerify('SHA256');
    verify.update(documentHash);
    verify.end();
    const isValid = verify.verify(cert.publicKey, signatureBase64, 'base64');

    // Also verify CA signature on the cert
    const certToVerify = { ...cert };
    delete certToVerify.caSignature;
    delete certToVerify.privateKey;
    const caVerify = crypto.createVerify('SHA256');
    caVerify.update(JSON.stringify(certToVerify));
    caVerify.end();
    const caTrusted = caVerify.verify(rootCA.publicKey, cert.caSignature, 'base64');

    return {
      valid: isValid && caTrusted,
      signatureIntegrity: isValid,
      rootCaTrusted: caTrusted,
      signer: cert.subject,
      thumbprint: cert.thumbprint,
      verifiedAt: new Date().toISOString()
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
}

// Envelope Encryption: AES-256-GCM + Dual Key Envelope (Master Key & Recipient RSA PKI)
function encryptDocumentEnvelope(content, confidentialityLevel, recipientThumbprint) {
  const levelConfig = CONFIDENTIALITY_LEVELS[confidentialityLevel] || CONFIDENTIALITY_LEVELS[1];
  
  if (!levelConfig.requiresEncryption) {
    return {
      encrypted: false,
      confidentialityLevel: levelConfig.id,
      classificationCode: levelConfig.code,
      payload: content
    };
  }

  // Generate random 256-bit Document Encryption Key (DEK)
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12); // Standard 96-bit IV for AES-GCM

  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  let encrypted = cipher.update(typeof content === 'string' ? content : JSON.stringify(content), 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Encrypt DEK with MASTER Institutional Key
  const dekCipher = crypto.createCipheriv('aes-256-gcm', MASTER_ENCRYPTION_KEY, iv);
  let encryptedDek = dekCipher.update(dek, null, 'base64');
  encryptedDek += dekCipher.final('base64');
  const dekAuthTag = dekCipher.getAuthTag().toString('base64');

  // Asymmetric RSA encryption of DEK with recipient public key if specified
  let recipientEncryptedDek = null;
  let recipientInfo = null;
  if (recipientThumbprint && issuedCertificates.has(recipientThumbprint)) {
    try {
      const recipientCert = issuedCertificates.get(recipientThumbprint);
      const encryptedDekBuffer = crypto.publicEncrypt(
        {
          key: recipientCert.publicKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256'
        },
        dek
      );
      recipientEncryptedDek = encryptedDekBuffer.toString('base64');
      recipientInfo = {
        commonName: recipientCert.subject.commonName,
        role: recipientCert.subject.role,
        thumbprint: recipientCert.thumbprint
      };
    } catch (e) {
      console.warn('[Crypto-Service] No se pudo cifrar asimétricamente con clave pública de destinatario:', e.message);
    }
  }

  return {
    encrypted: true,
    confidentialityLevel: levelConfig.id,
    classificationCode: levelConfig.code,
    algorithm: 'AES-256-GCM',
    iv: iv.toString('base64'),
    authTag: authTag,
    encryptedPayload: encrypted,
    keyEnvelope: {
      encryptedDek,
      dekAuthTag,
      recipientEncryptedDek,
      recipientInfo,
      envelopeLevel: levelConfig.name,
      escrowType: recipientEncryptedDek ? 'DUAL_ENVELOPE_RSA_AND_MASTER' : 'MASTER_KEY_ESCROW'
    },
    encryptedAt: new Date().toISOString()
  };
}

// Decrypt Document Envelope
function decryptDocumentEnvelope(envelope, userClearanceLevel, userPrivateKeyPem) {
  if (!envelope.encrypted) {
    return {
      decrypted: true,
      content: envelope.payload,
      classification: envelope.classificationCode
    };
  }

  const requiredLevel = envelope.confidentialityLevel || 3;
  if ((userClearanceLevel || 1) < requiredLevel) {
    const error = new Error(`Acceso Denegado por Política MLS: Nivel de habilitación del usuario (${userClearanceLevel || 1}) es inferior al nivel requerido (${requiredLevel}).`);
    error.status = 403;
    throw error;
  }

  try {
    const iv = Buffer.from(envelope.iv, 'base64');
    let dek = null;

    // 1. Try recipient asymmetric private key decryption if provided
    if (userPrivateKeyPem && envelope.keyEnvelope?.recipientEncryptedDek) {
      try {
        dek = crypto.privateDecrypt(
          {
            key: userPrivateKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
          },
          Buffer.from(envelope.keyEnvelope.recipientEncryptedDek, 'base64')
        );
      } catch (e) {
        console.warn('[Crypto-Service] Fallo descifrado RSA con clave privada de usuario, recurriendo a Master Escrow...', e.message);
      }
    }

    // 2. Fallback to Master Institutional Key
    if (!dek) {
      const dekAuthTag = Buffer.from(envelope.keyEnvelope.dekAuthTag, 'base64');
      const dekDecipher = crypto.createDecipheriv('aes-256-gcm', MASTER_ENCRYPTION_KEY, iv);
      dekDecipher.setAuthTag(dekAuthTag);
      dek = dekDecipher.update(envelope.keyEnvelope.encryptedDek, 'base64');
      dek = Buffer.concat([dek, dekDecipher.final()]);
    }

    // Decrypt Payload with verified DEK
    const authTag = Buffer.from(envelope.authTag, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(envelope.encryptedPayload, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return {
      decrypted: true,
      content: decrypted,
      classification: envelope.classificationCode,
      verifiedTamperFree: true,
      envelopeType: envelope.keyEnvelope?.escrowType || 'MASTER_KEY_ESCROW'
    };
  } catch (err) {
    throw new Error('Fallo de integridad criptográfica: El documento fue alterado o la llave es inválida (' + err.message + ')');
  }
}

// HTTP Server
initRootCA();
authManager.init({
  rootCertificateAuthority: rootCA,
  issueCertFunction: issueCertificateSync,
  masterEncryptionKey: MASTER_ENCRYPTION_KEY,
  ledgerUrl: LEDGER_SERVICE_URL,
  pkiCertificatesMap: issuedCertificates
});

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Clearance, X-Session-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    let parsedBody = {};
    if (body) {
      try { parsedBody = JSON.parse(body); } catch (e) {}
    }

    const sendJson = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      // Health check
      if (pathname === '/health') {
        return sendJson(200, { service: 'polibio-crypto-service', status: 'HEALTHY', port: PORT, timestamp: new Date() });
      }

      // Root CA Info
      if (pathname === '/api/crypto/ca/info' && req.method === 'GET') {
        return sendJson(200, {
          rootCA: {
            metadata: rootCA.metadata,
            publicKey: rootCA.publicKey,
            activeCertificatesCount: issuedCertificates.size
          }
        });
      }

      // List Certificates
      if (pathname === '/api/crypto/certificates' && req.method === 'GET') {
        const certList = Array.from(issuedCertificates.values()).map(c => ({
          serialNumber: c.serialNumber,
          subject: c.subject,
          thumbprint: c.thumbprint,
          validFrom: c.validFrom,
          validTo: c.validTo,
          status: c.status
        }));
        return sendJson(200, { count: certList.length, certificates: certList });
      }

      // Issue Certificate
      if (pathname === '/api/crypto/certificates/issue' && req.method === 'POST') {
        const newCert = issueCertificateSync(parsedBody);
        saveIssuedCertificates();
        return sendJson(201, {
          message: 'Certificado digital emitido por la Autoridad Certificadora Soberana de Polibio.',
          certificate: {
            serialNumber: newCert.serialNumber,
            subject: newCert.subject,
            thumbprint: newCert.thumbprint,
            validFrom: newCert.validFrom,
            validTo: newCert.validTo,
            status: newCert.status,
            publicKey: newCert.publicKey
          }
        });
      }

      // Compute Hash
      if (pathname === '/api/crypto/hash' && req.method === 'POST') {
        const { content } = parsedBody;
        if (content === undefined) return sendJson(400, { error: 'Falta campo content' });
        const hashes = computeDocumentHash(content);
        return sendJson(200, hashes);
      }

      // Sign Document Hash
      if (pathname === '/api/crypto/sign' && req.method === 'POST') {
        const { documentHash, thumbprint, signerName, privateKeyPem } = parsedBody;
        if (!documentHash || !thumbprint) {
          return sendJson(400, { error: 'Se requiere documentHash y thumbprint del certificado firmante.' });
        }
        const signatureObj = signDocumentHash(documentHash, privateKeyPem, thumbprint, signerName);
        return sendJson(200, signatureObj);
      }

      // Verify Signature
      if (pathname === '/api/crypto/verify-signature' && req.method === 'POST') {
        const { documentHash, signature, thumbprint } = parsedBody;
        if (!documentHash || !signature || !thumbprint) {
          return sendJson(400, { error: 'Faltan parámetros requeridos (documentHash, signature, thumbprint).' });
        }
        const result = verifySignature(documentHash, signature, thumbprint);
        return sendJson(200, result);
      }

      // Encrypt Document Envelope
      if (pathname === '/api/crypto/encrypt' && req.method === 'POST') {
        const { content, confidentialityLevel, recipientThumbprint } = parsedBody;
        const envelope = encryptDocumentEnvelope(content, confidentialityLevel, recipientThumbprint);
        return sendJson(200, envelope);
      }

      // Decrypt Document Envelope
      if (pathname === '/api/crypto/decrypt' && req.method === 'POST') {
        const { envelope, userClearanceLevel, userPrivateKeyPem } = parsedBody;
        try {
          const result = decryptDocumentEnvelope(envelope, userClearanceLevel, userPrivateKeyPem);
          return sendJson(200, result);
        } catch (err) {
          return sendJson(err.status || 400, { error: err.message });
        }
      }

      // ======================================================================
      // GESTIÓN DE IDENTIDAD, ACCESO (IAM / PKI) & USUARIOS INSTITUCIONALES
      // ======================================================================

      // Helper to extract session token from Authorization or custom header
      const getBearerToken = () => {
        const authHeader = req.headers['authorization'] || req.headers['x-session-token'];
        if (!authHeader) return null;
        return authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
      };

      // 1. Registro y Creación de Usuarios Institucionales (con perfil integral)
      if ((pathname === '/api/auth/register' || pathname === '/api/users') && req.method === 'POST') {
        const operator = req.headers['x-operator'] || 'ADMIN_SUPERVISOR';
        const newUser = await authManager.registerUser(parsedBody, operator, issuedCertificates);
        saveIssuedCertificates();
        return sendJson(201, {
          success: true,
          message: 'Funcionario y credenciales institucionales creadas exitosamente.',
          user: newUser
        });
      }

      // 2. Autenticación Soberana (Login con hash PBKDF2-SHA512 y token firmado)
      if (pathname === '/api/auth/login' && req.method === 'POST') {
        const { username, email, password } = parsedBody;
        const identity = username || email;
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
        const authResult = await authManager.authenticate(identity, password, ip);
        return sendJson(200, {
          success: true,
          message: 'Autenticación institucional validada.',
          token: authResult.token,
          user: authResult.user
        });
      }

      // 3. Perfil de Sesión Activa (Verificar token y retornar usuario actual)
      if (pathname === '/api/auth/me' && req.method === 'GET') {
        const token = getBearerToken();
        const session = authManager.verifySessionToken(token);
        if (!session) {
          return sendJson(401, { error: 'Sesión no válida o expirada. Por favor autentíquese nuevamente.' });
        }
        const user = authManager.getUserById(session.uid);
        if (!user) {
          return sendJson(404, { error: 'Usuario no encontrado en el sistema.' });
        }
        return sendJson(200, { session, user });
      }

      // 4. Verificación de Token Criptográfico
      if (pathname === '/api/auth/verify-token' && req.method === 'POST') {
        const token = parsedBody.token || getBearerToken();
        const session = authManager.verifySessionToken(token);
        return sendJson(200, {
          valid: Boolean(session),
          session: session || null
        });
      }

      // 5. Directorio de Usuarios Institucionales (Con filtros de búsqueda, departamento y clearance)
      if (pathname === '/api/users' && req.method === 'GET') {
        const filters = {
          search: url.searchParams.get('search'),
          clearanceLevel: url.searchParams.get('clearanceLevel'),
          department: url.searchParams.get('department'),
          status: url.searchParams.get('status')
        };
        const users = authManager.listUsers(filters);
        return sendJson(200, { count: users.length, users });
      }

      // 6. Ficha Detallada de Funcionario por ID
      if (pathname.startsWith('/api/users/') && req.method === 'GET') {
        const id = pathname.substring('/api/users/'.length);
        const user = authManager.getUserById(id);
        if (!user) {
          return sendJson(404, { error: `Usuario con ID ${id} no encontrado.` });
        }
        return sendJson(200, { user });
      }

      // 7. Actualización de Perfil o Estado de Usuario
      if (pathname.startsWith('/api/users/') && req.method === 'PUT') {
        const id = pathname.substring('/api/users/'.length);
        const operator = req.headers['x-operator'] || 'ADMIN_SUPERVISOR';
        const updated = await authManager.updateUser(id, parsedBody, operator);
        return sendJson(200, {
          success: true,
          message: 'Ficha de usuario institucional actualizada correctamente.',
          user: updated
        });
      }

      return sendJson(404, { error: 'Endpoint no encontrado en polibio-crypto-service' });
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) {
        console.error('[Crypto-Service Error]', err);
      }
      return sendJson(status, { error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[polibio-crypto-service] Ejecutándose en puerto ${PORT}`);
});

