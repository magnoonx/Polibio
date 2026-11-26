// Polibio Full-Ecosystem Integration Test Suite
const { spawn } = require('child_process');
const path = require('path');

const services = [
  { name: 'Crypto', script: 'services/crypto-service/index.js', port: 8003 },
  { name: 'Ledger', script: 'services/ledger-service/index.js', port: 8004 },
  { name: 'AI', script: 'services/ai-service/index.js', port: 8005 },
  { name: 'Telemetry', script: 'services/telemetry-service/index.js', port: 8006 },
  { name: 'Doc', script: 'services/doc-service/index.js', port: 8002 },
  { name: 'Gateway', script: 'services/gateway/index.js', port: 8000 }
];

const procs = [];

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runTests() {
  console.log('🚀 Iniciando clúster Polibio para pruebas de integración...');
  
  for (const s of services) {
    const p = spawn(process.execPath, [path.join(__dirname, s.script)], { stdio: ['inherit', 'pipe', 'pipe'] });
    p.stdout.on('data', d => console.log(`[${s.name}] ${d.toString().trim()}`));
    p.stderr.on('data', d => console.error(`[${s.name} ERR] ${d.toString().trim()}`));
    procs.push(p);
  }

  // Allow services to boot up
  console.log('⏳ Esperando inicialización de microservicios...');
  await delay(1800);

  let passed = 0;
  let total = 0;

  async function assert(desc, fn) {
    total++;
    try {
      const res = await fn();
      if (res !== false) {
        console.log(`  ✅ [PASS] ${desc}`);
        passed++;
      } else {
        console.error(`  ❌ [FAIL] ${desc}`);
      }
    } catch (e) {
      console.error(`  ❌ [FAIL] ${desc}: ${e.message}`);
    }
  }

  console.log('\n--- 1. Pruebas de API Gateway y Salud del Clúster ---');
  await assert('Gateway responde y agrupa salud de todos los microservicios', async () => {
    const res = await fetch('http://localhost:8000/api/health');
    const data = await res.json();
    return data.status === 'ALL_SYSTEMS_OPERATIONAL' && Object.keys(data.services).length === 6;
  });

  console.log('\n--- 2. Pruebas de Criptografía, PKI y Firma Digital ---');
  let sampleThumbprint = '';
  await assert('Root CA institucional inicializada y disponible', async () => {
    const res = await fetch('http://localhost:8000/api/crypto/ca/info');
    const data = await res.json();
    return data.rootCA && data.rootCA.metadata.commonName.includes('Polibio');
  });

  await assert('Certificados de funcionarios emitidos y activos', async () => {
    const res = await fetch('http://localhost:8000/api/crypto/certificates');
    const data = await res.json();
    if (data.certificates && data.certificates.length > 0) {
      sampleThumbprint = data.certificates[0].thumbprint;
      return true;
    }
    return false;
  });

  let signedHash = '';
  let sampleSignature = '';
  await assert('Firma digital matemática de documento con Root CA confiable', async () => {
    const hashRes = await fetch('http://localhost:8000/api/crypto/hash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'DOCUMENTO OFICIAL DE PRUEBA POLIBIO 2026' })
    });
    const hashData = await hashRes.json();
    signedHash = hashData.sha256;

    const signRes = await fetch('http://localhost:8000/api/crypto/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentHash: signedHash, thumbprint: sampleThumbprint })
    });
    const signData = await signRes.json();
    sampleSignature = signData.signature;
    return !!signData.signature;
  });

  await assert('Verificación de integridad de firma digital y validez de certificado', async () => {
    const verifyRes = await fetch('http://localhost:8000/api/crypto/verify-signature', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentHash: signedHash,
        signature: sampleSignature,
        thumbprint: sampleThumbprint
      })
    });
    const verifyData = await verifyRes.json();
    return verifyData.valid === true && verifyData.rootCaTrusted === true;
  });

  await assert('Cifrado de sobre AES-256-GCM y control de acceso MLS', async () => {
    const encRes = await fetch('http://localhost:8000/api/crypto/encrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: 'SECRETOS ESTRATÉGICOS DEL ESTADO',
        confidentialityLevel: 5
      })
    });
    const encData = await encRes.json();
    if (!encData.encrypted) return false;

    // Intentar descifrar con nivel insuficiente (Nivel 2) -> Debe fallar
    const failRes = await fetch('http://localhost:8000/api/crypto/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelope: encData, userClearanceLevel: 2 })
    });
    if (failRes.status !== 403) return false;

    // Descifrar con nivel suficiente (Nivel 5) -> Debe tener éxito
    const okRes = await fetch('http://localhost:8000/api/crypto/decrypt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envelope: encData, userClearanceLevel: 5 })
    });
    const okData = await okRes.json();
    return okData.decrypted === true && okData.content === 'SECRETOS ESTRATÉGICOS DEL ESTADO';
  });

  console.log('\n--- 3. Pruebas de Blockchain y Trazabilidad Inmutable ---');
  await assert('Verificación de integridad criptográfica de toda la cadena de bloques', async () => {
    const res = await fetch('http://localhost:8000/api/ledger/verify');
    const data = await res.json();
    return data.valid === true;
  });

  await assert('Registro de auditoría y emisión de Recibo Criptográfico con Merkle Root', async () => {
    const recordRes = await fetch('http://localhost:8000/api/ledger/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TEST_AUDIT',
        documentId: 'DOC-TEST-001',
        action: 'TEST_VERIFICATION',
        operator: 'Auditor de Pruebas'
      })
    });
    const recData = await recordRes.json();
    
    // Consultar recibo
    const rcptRes = await fetch(`http://localhost:8000/api/ledger/receipt/${recData.txId}`);
    const rcptData = await rcptRes.json();
    return rcptData.blockNumber >= 0 && !!rcptData.merkleRoot;
  });

  console.log('\n--- 4. Pruebas de IA Soberana On-Premise ---');
  await assert('Generación de documento oficial con Asistente Soberano local', async () => {
    const res = await fetch('http://localhost:8000/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Redactar oficio formal solicitando informe presupuestario urgente a la Dirección de Finanzas'
      })
    });
    const data = await res.json();
    return data.response && data.response.includes('OFICIO') && data.isLocalSovereign === true;
  });

  console.log('\n--- 5. Pruebas del Motor Documental y Notarización Completa ---');
  let createdDocId = '';
  await assert('Creación de oficio institucional con sellado hash automático', async () => {
    const res = await fetch('http://localhost:8000/api/docs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'OFICIO',
        title: 'Prueba Automatizada de Oficio Soberano',
        recipient: 'Dirección General de Auditoría',
        body: 'El presente documento certifica la correcta operación de la suite Polibio.',
        confidentialityLevel: 3
      })
    });
    const data = await res.json();
    if (data.document && data.document.correlativeNumber) {
      createdDocId = data.document.id;
      return !!data.document.blockchainNotarization;
    }
    return false;
  });

  await assert('Firma digital del oficio y actualización de estado en Blockchain', async () => {
    const res = await fetch(`http://localhost:8000/api/docs/${createdDocId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        thumbprint: sampleThumbprint,
        signerName: 'Lic. Carlos Mendoza'
      })
    });
    const data = await res.json();
    return data.document && data.document.status === 'FIRMADO' && data.verification.valid === true;
  });

  console.log('\n--- 6. Pruebas de Telemetría y Exportador Prometheus ---');
  await assert('Exportador de métricas Prometheus (/metrics) responde con datos válidos', async () => {
    const res = await fetch('http://localhost:8000/metrics');
    const text = await res.text();
    return text.includes('polibio_uptime_seconds') && text.includes('polibio_blockchain_height');
  });

  // Final summary
  console.log('\n=======================================================');
  console.log(`📊 RESULTADO DE LA SUITE DE PRUEBAS POLIBIO: ${passed}/${total} PASADAS`);
  console.log('=======================================================');

  // Terminate child processes
  procs.forEach(p => p.kill());
  process.exit(passed === total ? 0 : 1);
}

runTests().catch(err => {
  console.error('Error fatal en pruebas:', err);
  procs.forEach(p => p.kill());
  process.exit(1);
});
