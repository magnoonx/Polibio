// Polibio Document Management & Official Communications Microservice (Port 8002)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { CONFIDENTIALITY_LEVELS, DOCUMENT_TYPES, DOCUMENT_STATUS } = require('../shared/models');
const pg = require('../shared/postgres-adapter');
const templateManager = require('./template-manager');

const PORT = process.env.PORT || 8002;
const DATA_DIR = path.join(__dirname, '../../data/documents');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Initialize Departmental Templates and Correlative Sequences
templateManager.init();

let documents = new Map();
let documentCounters = {
  OF: 104,
  MEM: 58,
  CIR: 12,
  RES: 34
};

// Downstream Service URLs
const CRYPTO_SERVICE_URL = process.env.CRYPTO_SERVICE_URL || 'http://localhost:8003';
const LEDGER_SERVICE_URL = process.env.LEDGER_SERVICE_URL || 'http://localhost:8004';
const TELEMETRY_SERVICE_URL = process.env.TELEMETRY_SERVICE_URL || 'http://localhost:8006';

// Internal API Callers
async function callCryptoService(endpoint, body) {
  try {
    const res = await fetch(`${CRYPTO_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    console.error('[Doc-Service] Error llamando a Crypto-Service:', e.message);
    return null;
  }
}

async function callLedgerService(endpoint, body) {
  try {
    const res = await fetch(`${LEDGER_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) {
    console.error('[Doc-Service] Error llamando a Ledger-Service:', e.message);
    return null;
  }
}

// In-Flight Decryption Helper for MLS Authorized Access
async function decryptDocumentContent(doc, userClearance) {
  if (!doc.envelope || !doc.envelope.encrypted) {
    return doc.body;
  }
  const decRes = await callCryptoService('/api/crypto/decrypt', {
    envelope: doc.envelope,
    userClearanceLevel: userClearance
  });
  if (decRes && decRes.decrypted) {
    return decRes.content;
  }
  return null;
}

async function emitTelemetryEvent(eventType, details) {
  try {
    await fetch(`${TELEMETRY_SERVICE_URL}/api/telemetry/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType, service: 'polibio-doc-service', details })
    });
  } catch (e) {}
}

// Generate Official Dynamic Correlative (Departmental & Autoincremental)
function generateCorrelative(type, department, customPrefix, paddingDigits = 3, allocate = true) {
  const result = templateManager.generateNextCorrelative({
    docType: type,
    department,
    customPrefix,
    paddingDigits,
    allocate
  });
  return result.fullCorrelative;
}

// Seed Initial Official Documents
async function seedInitialDocuments() {
  const docFile = path.join(DATA_DIR, 'documents.json');
  if (fs.existsSync(docFile)) {
    try {
      const list = JSON.parse(fs.readFileSync(docFile, 'utf8'));
      list.forEach(d => documents.set(d.id, d));
      console.log(`[Doc-Service] ${list.length} documentos oficiales cargados desde disco.`);
      return;
    } catch (e) {
      console.error('[Doc-Service] Error cargando documentos, regenerando semillas...', e);
    }
  }

  console.log('[Doc-Service] Sembrando documentos oficiales modelo...');

  const sample1 = {
    id: 'DOC-2026-OF-001',
    correlativeNumber: 'OF-2026-POL-0104',
    type: 'OFICIO',
    title: 'Adopción de Protocolo Criptográfico y Blockchain Polibio en la Administración Central',
    subject: 'Instrucción de despliegue de infraestructura soberana y firma digital',
    recipient: 'Ciudadanos Ministros y Directores Generales de Organismos del Estado',
    author: {
      name: 'Dra. Elena Vasquez',
      role: 'Directora General de Despacho',
      department: 'Dirección Superior'
    },
    body: `Por medio de la presente comunicación oficial, me dirijo a ustedes para notificar el inicio formal del despliegue del Sistema Polibio en todas las dependencias ministeriales.

A partir de la fecha, todo oficio, memorando y circular con clasificación de seguridad deberá ser firmado criptográficamente con los certificados emitidos por la Autoridad Certificadora Institucional (Root CA) y registrado en el Libro Mayor Blockchain para garantizar su inmutabilidad, trazabilidad y soberanía del dato.

Se instruye coordinar con la Dirección de Tecnologías la habilitación de los certificados para el personal con facultades de firma.`,
    confidentialityLevel: 2,
    status: DOCUMENT_STATUS.APROBADO,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    signatures: [],
    auditHistory: [
      { action: 'CREADO', by: 'Dra. Elena Vasquez', date: new Date(Date.now() - 86400000 * 2).toISOString() },
      { action: 'APROBADO', by: 'Consultoría Jurídica', date: new Date(Date.now() - 86400000).toISOString() }
    ]
  };

  const sample2 = {
    id: 'DOC-2026-MEM-002',
    correlativeNumber: 'MEM-2026-POL-0058',
    type: 'MEMORANDO',
    title: 'Asignación de Partida Presupuestaria Extraordinaria para Servidores GPU de IA Local',
    subject: 'Dotación de clúster on-premise para procesamiento de LLMs soberanos',
    recipient: 'Dirección de Administración y Finanzas',
    author: {
      name: 'Lic. Carlos Mendoza',
      role: 'Director de Planificación y Presupuesto',
      department: 'Planificación'
    },
    body: `Se solicita con carácter de máxima prioridad la liberación de fondos correspondientes a la adquisición de servidores equipados con aceleradores Tensor Core para el alojamiento 100% on-premise de modelos de lenguaje de código abierto.

Esta medida obedece al requerimiento de Soberanía Absoluta del Dato, impidiendo cualquier procesamiento en servidores extranjeros o nubes comerciales.`,
    confidentialityLevel: 4, // Confidencial
    status: DOCUMENT_STATUS.FIRMADO,
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    signatures: [
      {
        signer: {
          commonName: 'Lic. Carlos Mendoza',
          role: 'Director de Planificación y Presupuesto',
          department: 'Planificación'
        },
        algorithm: 'SHA256withRSA',
        signedAt: new Date(Date.now() - 3600000).toISOString(),
        thumbprint: '0A894B129CF4400192EA8917FEBA9012A34CDE67',
        rootCaTrusted: true
      }
    ],
    auditHistory: [
      { action: 'CREADO', by: 'Lic. Carlos Mendoza', date: new Date(Date.now() - 43200000).toISOString() },
      { action: 'CLASIFICADO_NIVEL_4', by: 'Oficial de Seguridad', date: new Date(Date.now() - 40000000).toISOString() },
      { action: 'FIRMADO_DIGITALMENTE', by: 'Lic. Carlos Mendoza', date: new Date(Date.now() - 3600000).toISOString() }
    ]
  };

  documents.set(sample1.id, sample1);
  documents.set(sample2.id, sample2);

  // Hash and notarize in background
  computeAndNotarizeDocument(sample1);
  computeAndNotarizeDocument(sample2);
  saveDocuments();
}

async function computeAndNotarizeDocument(doc) {
  const originalBody = doc.body;
  const hashRes = await callCryptoService('/api/crypto/hash', { content: originalBody });
  if (hashRes) {
    doc.documentHash = hashRes.sha256;
    doc.documentHash512 = hashRes.sha512;
  }

  // If Level >= 3, encrypt envelope and sanitize resting body from disk
  if (doc.confidentialityLevel >= 3 && !doc.envelope) {
    const encRes = await callCryptoService('/api/crypto/encrypt', {
      content: originalBody,
      confidentialityLevel: doc.confidentialityLevel
    });
    if (encRes) {
      doc.envelope = encRes;
      doc.body = `[DOCUMENTO CIFRADO EN REPOSO CON AES-256-GCM - Requiere Nivel ${doc.confidentialityLevel}]`;
    }
  }

  const ledgerRes = await callLedgerService('/api/ledger/record', {
    type: 'DOCUMENT_AUDIT',
    documentId: doc.id,
    documentNumber: doc.correlativeNumber,
    documentHash: doc.documentHash || '',
    action: `DOCUMENT_${doc.status}`,
    confidentialityLevel: doc.confidentialityLevel,
    operator: doc.author.name,
    details: { title: doc.title, type: doc.type }
  });

  if (ledgerRes) {
    doc.blockchainNotarization = {
      txId: ledgerRes.txId,
      txHash: ledgerRes.txHash,
      blockIndex: ledgerRes.blockIndex,
      notarizedAt: ledgerRes.timestamp
    };
  }
}

function saveDocuments() {
  const docFile = path.join(DATA_DIR, 'documents.json');
  const arr = Array.from(documents.values());
  fs.writeFileSync(docFile, JSON.stringify(arr, null, 2));

  // Asynchronous sync to PostgreSQL if connected
  if (pg.isConfigured()) {
    arr.forEach(async d => {
      try {
        await pg.query(
          `INSERT INTO documents (id, correlative_number, type, title, subject, recipient, author, confidentiality_level, status, document_hash, document_hash512, body, envelope, template_snapshot, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             body = EXCLUDED.body,
             envelope = EXCLUDED.envelope,
             template_snapshot = EXCLUDED.template_snapshot,
             updated_at = EXCLUDED.updated_at`,
          [
            d.id, d.correlativeNumber, d.type, d.title, d.subject || '', d.recipient, JSON.stringify(d.author),
            d.confidentialityLevel, d.status, d.documentHash, d.documentHash512 || '', d.body,
            d.envelope ? JSON.stringify(d.envelope) : null,
            d.templateSnapshot ? JSON.stringify(d.templateSnapshot) : null,
            d.createdAt, d.updatedAt
          ]
        );
      } catch (e) {
        console.error('[Doc-Service] Error sincronizando documento en PostgreSQL:', e.message);
      }
    });
  }
}

// HTTP Server
seedInitialDocuments();

// Auto-initialize PostgreSQL Schema if configured
(async () => {
  if (pg.isConfigured()) {
    await pg.initializeSchema();
  }
})();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Clearance, X-Operator');

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
      if (pathname === '/health') {
        return sendJson(200, { service: 'polibio-doc-service', status: 'HEALTHY', documentCount: documents.size, port: PORT });
      }

      // List all documents with optional filtering & MLS clearance check
      if (pathname === '/api/docs' && req.method === 'GET') {
        const userClearance = parseInt(req.headers['x-user-clearance'] || '5');
        const list = await Promise.all(Array.from(documents.values()).map(async doc => {
          // If user clearance is below document confidentiality, mask the sensitive body
          if (userClearance < doc.confidentialityLevel) {
            return {
              ...doc,
              body: '[CONTENIDO CIFRADO Y RESTRINGIDO - Requiere nivel de habilitación ' + doc.confidentialityLevel + ']',
              isRestricted: true
            };
          }

          // If authorized and document is encrypted, decrypt preview safely in flight
          if (doc.confidentialityLevel >= 3 && doc.envelope) {
            const dec = await decryptDocumentContent(doc, userClearance);
            return {
              ...doc,
              body: dec || doc.body,
              isRestricted: false,
              decryptedInFlight: true
            };
          }

          return { ...doc, isRestricted: false };
        }));

        return sendJson(200, {
          total: list.length,
          userClearance,
          documents: list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
      }

      // Public Verification & Cotejo Endpoint (CSV - Código Seguro de Verificación)
      if (pathname.startsWith('/api/docs/verify/') && req.method === 'GET') {
        const queryStr = decodeURIComponent(pathname.replace('/api/docs/verify/', '')).trim();
        let matchedDoc = null;
        for (const d of documents.values()) {
          if (
            (d.correlativeNumber && d.correlativeNumber.toLowerCase() === queryStr.toLowerCase()) ||
            (d.documentHash && d.documentHash.toLowerCase() === queryStr.toLowerCase()) ||
            (d.id && d.id.toLowerCase() === queryStr.toLowerCase()) ||
            (d.blockchainNotarization?.txId && d.blockchainNotarization.txId.toLowerCase() === queryStr.toLowerCase())
          ) {
            matchedDoc = d;
            break;
          }
        }

        if (!matchedDoc) {
          return sendJson(404, {
            verified: false,
            query: queryStr,
            error: 'No se encontró ningún documento oficial registrado con este correlativo, hash o TxID.'
          });
        }

        return sendJson(200, {
          verified: true,
          authenticityStatus: 'AUTENTICO_Y_NOTARIZADO',
          document: {
            id: matchedDoc.id,
            correlativeNumber: matchedDoc.correlativeNumber,
            type: matchedDoc.type,
            title: matchedDoc.title,
            subject: matchedDoc.subject,
            recipient: matchedDoc.recipient,
            author: matchedDoc.author,
            confidentialityLevel: matchedDoc.confidentialityLevel,
            status: matchedDoc.status,
            documentHash: matchedDoc.documentHash,
            documentHash512: matchedDoc.documentHash512,
            createdAt: matchedDoc.createdAt,
            signedCount: matchedDoc.signatures ? matchedDoc.signatures.length : 0,
            signatures: (matchedDoc.signatures || []).map(s => ({
              signer: s.signer,
              algorithm: s.algorithm,
              signedAt: s.signedAt,
              rootCaTrusted: s.rootCaTrusted,
              thumbprint: s.thumbprint || s.signer?.thumbprint
            })),
            blockchainNotarization: matchedDoc.blockchainNotarization
          },
          verifiedAt: new Date().toISOString()
        });
      }

      // ======================================================================
      // GESTIÓN DE PLANTILLAS DEPARTAMENTALES, LOGOS Y CORRELATIVOS (MLS >= 2)
      // ======================================================================

      // 1. Catálogo Oficial de Logos y Escudos
      if (pathname === '/api/docs/logos' && req.method === 'GET') {
        return sendJson(200, { logos: templateManager.getLogosCatalog() });
      }

      // 2. Listar todas las plantillas departamentales
      if (pathname === '/api/docs/templates' && req.method === 'GET') {
        return sendJson(200, { templates: templateManager.listDepartmentTemplates() });
      }

      // 3. Obtener plantilla de un departamento específico
      if (pathname.startsWith('/api/docs/templates/') && req.method === 'GET') {
        const dept = decodeURIComponent(pathname.substring('/api/docs/templates/'.length));
        const tpl = templateManager.getTemplateForDepartment(dept);
        return sendJson(200, { template: tpl });
      }

      // 4. Modificar Diagramación de Formato, Logos, Membrete y Correlativos (Restringido MLS >= 2)
      if (pathname === '/api/docs/templates' && req.method === 'POST') {
        const userClearance = parseInt(req.headers['x-user-clearance'] || '1', 10);
        const operator = req.headers['x-operator'] || 'Funcionario';
        try {
          const updated = templateManager.updateDepartmentTemplate(parsedBody, userClearance, operator);
          return sendJson(200, {
            success: true,
            message: `Diagramación y correlativo para "${updated.department}" actualizados satisfactoriamente.`,
            template: updated
          });
        } catch (err) {
          return sendJson(err.status || 400, { error: err.message });
        }
      }

      // 5. Previsualizar / Reservar Próximo Correlativo Autoincremental
      if (pathname === '/api/docs/correlatives/next' && req.method === 'GET') {
        const type = url.searchParams.get('type') || 'OFICIO';
        const department = url.searchParams.get('department') || '';
        const customPrefix = url.searchParams.get('prefix') || '';
        const digits = parseInt(url.searchParams.get('digits') || '3', 10);
        const allocate = url.searchParams.get('allocate') === 'true';

        const corrData = templateManager.generateNextCorrelative({
          docType: type,
          department,
          customPrefix,
          paddingDigits: digits,
          allocate
        });
        return sendJson(200, corrData);
      }

      // ======================================================================
      // GESTIÓN DE CARGA Y SERVIDO DE IMÁGENES / LOGOS INSTITUCIONALES
      // ======================================================================

      // 6. Subir imagen (para incrustar en documento o logo institucional)
      if (pathname === '/api/docs/upload' && req.method === 'POST') {
        const { filename, base64Data, mimeType, description } = parsedBody;
        if (!base64Data) {
          return sendJson(400, { error: 'Se requiere base64Data para almacenar la imagen.' });
        }

        const allowedMimes = {
          'image/png': '.png',
          'image/jpeg': '.jpg',
          'image/jpg': '.jpg',
          'image/webp': '.webp',
          'image/svg+xml': '.svg',
          'image/gif': '.gif'
        };

        let detectedMime = (mimeType || '').toLowerCase();
        let rawBase64 = base64Data;

        if (base64Data.startsWith('data:')) {
          const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            detectedMime = match[1].toLowerCase();
            rawBase64 = match[2];
          }
        }

        if (!allowedMimes[detectedMime]) {
          detectedMime = 'image/png';
        }

        const ext = allowedMimes[detectedMime] || '.png';
        const cleanBaseName = (filename || 'imagen')
          .replace(/[^a-zA-Z0-9_\-\.]/g, '_')
          .replace(/\.[^.]+$/, '');
        const safeFilename = `${Date.now()}_${cleanBaseName.substring(0, 40)}${ext}`;
        const filePath = path.join(UPLOADS_DIR, safeFilename);

        try {
          const buffer = Buffer.from(rawBase64, 'base64');
          fs.writeFileSync(filePath, buffer);

          return sendJson(201, {
            success: true,
            url: `/api/docs/uploads/${safeFilename}`,
            filename: safeFilename,
            originalName: filename || safeFilename,
            sizeBytes: buffer.length,
            mimeType: detectedMime,
            description: description || ''
          });
        } catch (err) {
          return sendJson(500, { error: 'Error guardando archivo de imagen: ' + err.message });
        }
      }

      // 7. Servir imagen subida
      if (pathname.startsWith('/api/docs/uploads/') && req.method === 'GET') {
        const rawFilename = pathname.substring('/api/docs/uploads/'.length);
        const safeFilename = path.basename(rawFilename); // Previene Directory Traversal
        const filePath = path.join(UPLOADS_DIR, safeFilename);

        if (!fs.existsSync(filePath)) {
          return sendJson(404, { error: 'Imagen no encontrada.' });
        }

        const ext = path.extname(safeFilename).toLowerCase();
        const mimeMap = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.gif': 'image/gif'
        };
        const contentType = mimeMap[ext] || 'application/octet-stream';

        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*'
        });
        const readStream = fs.createReadStream(filePath);
        readStream.pipe(res);
        return;
      }

      // Get single document (Strict MLS Bell-LaPadula check & In-Flight Decryption)
      if (pathname.startsWith('/api/docs/') && req.method === 'GET' && !pathname.endsWith('/sign')) {
        const id = pathname.split('/').pop();
        const doc = documents.get(id);
        if (!doc) return sendJson(404, { error: 'Documento oficial no encontrado' });

        const userClearance = parseInt(req.headers['x-user-clearance'] || '5');
        if (userClearance < doc.confidentialityLevel) {
          // Record access denial in audit ledger
          const ledgerRes = await callLedgerService('/api/ledger/record', {
            type: 'SECURITY_ACCESS_DENIED',
            documentId: doc.id,
            documentNumber: doc.correlativeNumber,
            action: 'MLS_ACCESS_REJECTED',
            confidentialityLevel: doc.confidentialityLevel,
            operator: `Funcionario Clearance Nivel ${userClearance}`,
            details: {
              attemptedLevel: doc.confidentialityLevel,
              userClearance: userClearance,
              title: doc.title,
              violation: 'Intento de lectura no autorizado (Bell-LaPadula No-Read-Up)'
            }
          });
          emitTelemetryEvent('SECURITY_VIOLATION', { docId: doc.id, userClearance, requiredLevel: doc.confidentialityLevel });
          return sendJson(403, {
            error: `Acceso Denegado por Política MLS (Bell-LaPadula): Su nivel de habilitación (${userClearance}) es insuficiente para acceder a este documento clasificado Nivel ${doc.confidentialityLevel}.`,
            requiredLevel: doc.confidentialityLevel,
            userClearance: userClearance,
            auditedInBlockchain: true,
            ledgerTx: ledgerRes?.txId,
            blockIndex: ledgerRes?.blockIndex
          });
        }

        // Clone document to avoid modifying in-memory ciphered state
        const responseDoc = { ...doc };
        if (doc.confidentialityLevel >= 3 && doc.envelope) {
          const decryptedContent = await decryptDocumentContent(doc, userClearance);
          if (decryptedContent) {
            responseDoc.body = decryptedContent;
            responseDoc.decryptedInFlight = true;
            responseDoc.cryptoIntegrity = 'VERIFIED_AES_256_GCM_OK';
          }
        }

        return sendJson(200, responseDoc);
      }

      // Create new official document
      if (pathname === '/api/docs' && req.method === 'POST') {
        const {
          type,
          title,
          subject,
          recipient,
          author,
          body,
          confidentialityLevel,
          recipientThumbprint,
          correlativeNumber,
          customPrefix,
          paddingDigits,
          templateSnapshot
        } = parsedBody;

        if (!title || !body) return sendJson(400, { error: 'Faltan campos obligatorios (title, body)' });

        const docType = type || 'OFICIO';
        const docId = 'DOC-' + Date.now();
        const dept = author?.department || 'Dirección Superior';
        const correlative = correlativeNumber || generateCorrelative(docType, dept, customPrefix, paddingDigits, true);
        const resolvedTemplateSnapshot = templateSnapshot || templateManager.getTemplateForDepartment(dept);
        const level = parseInt(confidentialityLevel) || 1;

        // Hash original plaintext content
        const hashRes = await callCryptoService('/api/crypto/hash', { content: body });

        const newDoc = {
          id: docId,
          correlativeNumber: correlative,
          type: docType,
          title,
          subject: subject || 'Sin asunto especificado',
          recipient: recipient || 'A quien corresponda',
          author: author || { name: 'Funcionario Polibio', role: 'Redactor Oficial', department: dept },
          body,
          templateSnapshot: resolvedTemplateSnapshot,
          confidentialityLevel: level,
          status: DOCUMENT_STATUS.BORRADOR,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          signatures: [],
          documentHash: hashRes ? hashRes.sha256 : '',
          documentHash512: hashRes ? hashRes.sha512 : '',
          auditHistory: [
            { action: 'CREACION_BORRADOR', by: author?.name || 'Funcionario', date: new Date().toISOString() }
          ]
        };

        // If level >= 3, encrypt with crypto envelope and sanitize body in resting storage
        if (level >= 3) {
          const encRes = await callCryptoService('/api/crypto/encrypt', {
            content: body,
            confidentialityLevel: level,
            recipientThumbprint: recipientThumbprint || null
          });
          if (encRes) {
            newDoc.envelope = encRes;
            // Strict Data-at-Rest protection: DO NOT store plaintext body on disk!
            newDoc.body = `[DOCUMENTO CIFRADO EN REPOSO CON AES-256-GCM - Requiere Nivel ${level}]`;
          }
        }

        // Notarize creation in blockchain
        const ledgerRes = await callLedgerService('/api/ledger/record', {
          type: 'DOCUMENT_CREATE',
          documentId: newDoc.id,
          documentNumber: newDoc.correlativeNumber,
          documentHash: newDoc.documentHash,
          action: 'DOCUMENT_CREATED',
          confidentialityLevel: newDoc.confidentialityLevel,
          operator: newDoc.author.name,
          details: { title: newDoc.title, type: newDoc.type, encryptedAtRest: level >= 3 }
        });

        if (ledgerRes) {
          newDoc.blockchainNotarization = {
            txId: ledgerRes.txId,
            txHash: ledgerRes.txHash,
            blockIndex: ledgerRes.blockIndex,
            notarizedAt: ledgerRes.timestamp
          };
        }

        documents.set(newDoc.id, newDoc);
        saveDocuments();
        emitTelemetryEvent('DOC_CREATED', { docId: newDoc.id, correlative: newDoc.correlativeNumber, level });

        return sendJson(201, {
          message: 'Documento oficial creado, sellado con hash y notarizado en Blockchain.',
          document: newDoc
        });
      }

      // Sign document with digital certificate
      if (pathname.endsWith('/sign') && req.method === 'POST') {
        const parts = pathname.split('/');
        const docId = parts[parts.length - 2];
        const doc = documents.get(docId);
        if (!doc) return sendJson(404, { error: 'Documento no encontrado' });

        const { thumbprint, signerName } = parsedBody;
        if (!thumbprint) return sendJson(400, { error: 'Falta huella digital (thumbprint) del certificado de firma.' });

        // Ensure hash is fresh: use the canonical documentHash already recorded
        const docHash = doc.documentHash;
        if (!docHash) {
          return sendJson(400, { error: 'El documento no posee hash canónico registrado.' });
        }

        // Sign with crypto service
        const signRes = await callCryptoService('/api/crypto/sign', {
          documentHash: docHash,
          thumbprint,
          signerName
        });

        if (!signRes || signRes.error) {
          return sendJson(400, { error: signRes?.error || 'Error al generar firma digital' });
        }

        // Verify signature integrity
        const verifyRes = await callCryptoService('/api/crypto/verify-signature', {
          documentHash: docHash,
          signature: signRes.signature,
          thumbprint
        });

        const signatureRecord = {
          ...signRes,
          verified: verifyRes.valid,
          rootCaTrusted: verifyRes.rootCaTrusted
        };

        doc.signatures.push(signatureRecord);
        doc.status = DOCUMENT_STATUS.FIRMADO;
        doc.updatedAt = new Date().toISOString();
        doc.auditHistory.push({
          action: 'FIRMADO_DIGITALMENTE',
          by: signatureRecord.signer.commonName,
          date: new Date().toISOString(),
          thumbprint
        });

        // Record in Blockchain
        const ledgerRes = await callLedgerService('/api/ledger/record', {
          type: 'DOCUMENT_SIGN',
          documentId: doc.id,
          documentNumber: doc.correlativeNumber,
          documentHash: docHash,
          action: 'DIGITAL_SIGNATURE_APPLIED',
          confidentialityLevel: doc.confidentialityLevel,
          signerThumbprint: thumbprint,
          operator: signatureRecord.signer.commonName,
          details: { signatureAlgorithm: signRes.algorithm, verified: verifyRes.valid }
        });

        if (ledgerRes) {
          doc.blockchainNotarization = {
            txId: ledgerRes.txId,
            txHash: ledgerRes.txHash,
            blockIndex: ledgerRes.blockIndex,
            notarizedAt: ledgerRes.timestamp
          };
        }

        saveDocuments();
        emitTelemetryEvent('DOC_SIGNED', { docId: doc.id, signer: signatureRecord.signer.commonName });

        return sendJson(200, {
          message: 'Firma digital aplicada con éxito y notarizada en la Blockchain.',
          document: doc,
          verification: verifyRes
        });
      }

      // Update document status (Flujo de aprobación)
      if (pathname.endsWith('/status') && req.method === 'POST') {
        const parts = pathname.split('/');
        const docId = parts[parts.length - 2];
        const doc = documents.get(docId);
        if (!doc) return sendJson(404, { error: 'Documento no encontrado' });

        const { newStatus, operator } = parsedBody;
        if (!DOCUMENT_STATUS[newStatus]) return sendJson(400, { error: 'Estado inválido' });

        doc.status = newStatus;
        doc.updatedAt = new Date().toISOString();
        doc.auditHistory.push({
          action: `CAMBIO_ESTADO_${newStatus}`,
          by: operator || 'Oficial Autorizado',
          date: new Date().toISOString()
        });

        // Notarize state transition in blockchain
        callLedgerService('/api/ledger/record', {
          type: 'DOCUMENT_STATUS_CHANGE',
          documentId: doc.id,
          documentNumber: doc.correlativeNumber,
          documentHash: doc.documentHash || '',
          action: `STATUS_CHANGED_TO_${newStatus}`,
          operator: operator || 'Oficial Autorizado'
        });

        saveDocuments();
        return sendJson(200, { message: `Estado actualizado a ${newStatus}`, document: doc });
      }

      return sendJson(404, { error: 'Ruta no encontrada en polibio-doc-service' });
    } catch (err) {
      console.error('[Doc-Service Error]', err);
      return sendJson(500, { error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[polibio-doc-service] Ejecutándose en puerto ${PORT}`);
});

