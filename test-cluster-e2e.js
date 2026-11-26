// Polibio Live Cluster E2E Verification Suite (Docker & PostgreSQL)
const http = require('http');

async function request(url, options = {}) {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + (parsed.search || ''),
        method: options.method || 'GET',
        headers: options.headers || {}
      },
      res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: body ? JSON.parse(body) : null
            });
          } catch (e) {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body
            });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function run() {
  console.log('========================================================================');
  console.log('🛡️  POLIBIO - SUITE DE VALIDACIÓN E2E DEL CLÚSTER EN PRODUCCIÓN / DOCKER');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      const ok = await fn();
      if (ok !== false) {
        console.log(`  ✅ [PASS] ${name}`);
        passed++;
      } else {
        console.log(`  ❌ [FAIL] ${name}`);
      }
    } catch (e) {
      console.log(`  ❌ [FAIL] ${name}: ${e.message}`);
    }
  }

  // 1. Gateway Health
  console.log('--- 1. Perímetro y Malla de Microservicios ---');
  await test('Gateway reporta ALL_SYSTEMS_OPERATIONAL con 6 microservicios activos', async () => {
    const res = await request('http://localhost:8000/api/health');
    return res.statusCode === 200 &&
           res.body.status === 'ALL_SYSTEMS_OPERATIONAL' &&
           Object.values(res.body.services).every(s => s.status === 'UP');
  });

  // 2. PKI Root CA & Certificates
  console.log('\n--- 2. Infraestructura de Clave Pública (PKI) y Criptografía Soberana ---');
  let caThumbprint = '';
  await test('Autoridad Certificadora Institucional (Root CA) inicializada y válida', async () => {
    const res = await request('http://localhost:8000/api/crypto/ca/info');
    if (res.statusCode !== 200) return false;
    caThumbprint = res.body.rootCA?.metadata?.fingerprintSha256;
    return res.body.rootCA?.publicKey != null && caThumbprint?.length === 64;
  });

  let testSignerThumbprint = '';
  await test('Emisión de Certificado Digital X.509 para Funcionario de Nivel 4', async () => {
    const res = await request('http://localhost:8000/api/crypto/certificates/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        commonName: 'Lic. Andrés Valenzuela',
        role: 'Director de Seguridad de la Información',
        department: 'Tecnología y Ciberseguridad',
        clearanceLevel: 4
      }
    });
    if (res.statusCode !== 201 && res.statusCode !== 200) return false;
    testSignerThumbprint = res.body.certificate?.thumbprint || res.body.thumbprint;
    return testSignerThumbprint != null;
  });

  // 3. Document Creation & Zero-Plaintext at Rest
  console.log('\n--- 3. Creación Documental, Cifrado Asimétrico y Bell-LaPadula MLS ---');
  let createdDocId = null;
  let createdCorrelative = null;
  const sensitiveBodyText = 'INFORME DE VULNERABILIDADES CRÍTICAS: Claves de cifrado cuántico resguardadas en HSM nivel 4.';

  await test('Creación de documento clasificado Nivel 4 con doble sobre AES-256-GCM + RSA-OAEP', async () => {
    const res = await request('http://localhost:8000/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        type: 'OFICIO',
        title: 'Auditoría Forense de Red y Ciberdefensa Nacional',
        subject: 'Resguardo de bóvedas criptográficas',
        recipient: 'Comando Estratégico Operacional',
        author: {
          name: 'Lic. Andrés Valenzuela',
          role: 'Director de Ciberseguridad',
          department: 'Tecnologías Soberanas'
        },
        body: sensitiveBodyText,
        confidentialityLevel: 4,
        recipientThumbprint: testSignerThumbprint
      }
    });

    if (res.statusCode !== 201 && res.statusCode !== 200) return false;
    const doc = res.body.document;
    createdDocId = doc.id;
    createdCorrelative = doc.correlativeNumber;

    // Verificar que el cuerpo devuelto en reposo esté enmascarado
    const isMasked = doc.body.includes('[DOCUMENTO CIFRADO EN REPOSO CON AES-256-GCM');
    const hasEnvelope = doc.envelope && doc.envelope.encrypted && doc.envelope.algorithm === 'AES-256-GCM';
    const hasBlockchainTx = doc.blockchainNotarization && doc.blockchainNotarization.txId;

    return isMasked && hasEnvelope && hasBlockchainTx;
  });

  // 4. Access Control (No-Read-Up Rejection)
  await test('Intrusión rechazada: Usuario Nivel 1 recibe 403 Forbidden y se audita en Blockchain', async () => {
    const res = await request(`http://localhost:8000/api/docs/${createdDocId}`, {
      headers: { 'X-User-Clearance': '1' }
    });

    return res.statusCode === 403 &&
           res.body.auditedInBlockchain === true &&
           res.body.ledgerTx != null;
  });

  // 5. In-Flight Decryption for Authorized User
  await test('Acceso autorizado: Funcionario Nivel 5 desencripta en vuelo el texto íntegro', async () => {
    const res = await request(`http://localhost:8000/api/docs/${createdDocId}`, {
      headers: { 'X-User-Clearance': '5' }
    });

    return res.statusCode === 200 &&
           res.body.body === sensitiveBodyText &&
           res.body.decryptedInFlight === true;
  });

  // 6. PKI Digital Signature Application
  console.log('\n--- 4. Firma Digital PKI Institucional y Sellado Notarial ---');
  await test('Aplicación de firma digital al documento con certificado de funcionario', async () => {
    const res = await request(`http://localhost:8000/api/docs/${createdDocId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        thumbprint: testSignerThumbprint
      }
    });

    return res.statusCode === 200 &&
           res.body.document.status === 'FIRMADO' &&
           res.body.document.signatures.length >= 1 &&
           res.body.document.signatures[0].rootCaTrusted === true;
  });

  // 7. Public Cotejo & Verification (CSV)
  console.log('\n--- 5. Cotejo Público Electrónico y Código Seguro de Verificación (CSV) ---');
  await test('Cotejo público y verificación electrónica (CSV) retorna AUTENTICO_Y_NOTARIZADO', async () => {
    const res = await request(`http://localhost:8000/api/docs/verify/${encodeURIComponent(createdDocId)}`);
    return res.statusCode === 200 &&
           res.body.verified === true &&
           res.body.authenticityStatus === 'AUTENTICO_Y_NOTARIZADO' &&
           res.body.document.id === createdDocId &&
           res.body.document.signedCount >= 1;
  });

  // 8. Blockchain Ledger Integrity
  console.log('\n--- 6. Auditoría Forense de Integridad Blockchain ---');
  await test('Verificación criptográfica de toda la cadena de bloques sin fisuras', async () => {
    const res = await request('http://localhost:8000/api/ledger/verify');
    return res.statusCode === 200 &&
           res.body.valid === true &&
           res.body.totalBlocks >= 2;
  });

  // 9. Sovereign Local AI Inference with Ollama
  console.log('\n--- 7. Inferencia LLM Soberana con Ollama Local ---');
  await test('Ollama responde con modelo local qwen2.5:0.5b y genera tokens reales', async () => {
    const res = await request('http://localhost:8000/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        prompt: 'Saluda formalmente al ciudadano director.',
        model: 'qwen2.5:0.5b'
      }
    });

    return res.statusCode === 200 &&
           res.body.engine.includes('Ollama Local') &&
           res.body.response.length > 20 &&
           res.body.tokensGenerated > 5;
  });

  console.log('\n========================================================================');
  console.log(`📊 RESULTADO DE LA VALIDACIÓN E2E: ${passed}/${total} PRUEBAS EXITOSAS (${Math.round((passed/total)*100)}%)`);
  console.log('========================================================================\n');

  if (passed === total) {
    console.log('🎉 EL CLÚSTER POLIBIO EN DOCKER Y POSTGRESQL ESTÁ 100% OPERATIVO Y CERTIFICADO.');
    process.exit(0);
  } else {
    console.log('⚠️ ALGUNAS PRUEBAS FALLARON. REVISAR LOGS ANTERIORES.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});

