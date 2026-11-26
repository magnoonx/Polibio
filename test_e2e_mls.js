// Polibio E2E MLS Integration Test
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('========================================================================');
console.log('🛡️ PRUEBA DE INTEGRACIÓN E2E: SEGURIDAD MULTINIVEL MLS & BLOCKCHAIN');
console.log('========================================================================\n');

const procs = [];

function runSvc(scriptPath, port) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [scriptPath], { stdio: 'pipe' });
    procs.push(p);

    const checkHealth = async () => {
      for (let i = 0; i < 30; i++) {
        try {
          const res = await fetch(`http://localhost:${port}/health`);
          if (res.ok) return resolve(p);
        } catch (e) {}
        await new Promise(r => setTimeout(r, 200));
      }
      reject(new Error(`Timeout iniciando servicio en puerto ${port}`));
    };
    checkHealth();
  });
}

async function runE2ETests() {
  try {
    console.log('[1/5] Iniciando crypto-service (8003) y ledger-service (8004)...');
    await runSvc(path.join(__dirname, 'services/crypto-service/index.js'), 8003);
    await runSvc(path.join(__dirname, 'services/ledger-service/index.js'), 8004);

    console.log('[2/5] Iniciando doc-service (8002)...');
    await runSvc(path.join(__dirname, 'services/doc-service/index.js'), 8002);

    console.log('  ✓ Servicios centrales operativos.');

    // 1. Create a Level 4 Confidential Document
    console.log('\n[3/5] Creando documento clasificado Nivel 4 (Confidencial)...');
    const secretText = 'INFORME ULTRA SECRETO: Auditoría de infraestructura nuclear y redes soberanas.';
    const createRes = await fetch('http://localhost:8002/api/docs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Clearance': '4'
      },
      body: JSON.stringify({
        type: 'OFICIO',
        title: 'Inspección de Seguridad Soberana Criptográfica',
        recipient: 'Comando de Operaciones Especiales',
        subject: 'Auditoría clasificada',
        confidentialityLevel: 4,
        body: secretText,
        author: { name: 'Lic. Carlos Mendoza', role: 'Director de Planificación' }
      })
    });

    const createData = await createRes.json();
    if (!createData.document || !createData.document.id) {
      throw new Error('No se pudo crear el documento clasificado: ' + JSON.stringify(createData));
    }
    const docId = createData.document.id;
    console.log(`  ✓ Documento creado: ${createData.document.correlativeNumber} (Nivel 4)`);
    console.log(`  ✓ Notarizado en Blockchain: Bloque #${createData.document.blockchainNotarization.blockIndex}`);

    // Verify Data-at-Rest
    const diskDocs = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/documents/documents.json'), 'utf8'));
    const savedDoc = diskDocs.find(d => d.id === docId);
    if (!savedDoc.envelope || !savedDoc.envelope.encrypted) {
      throw new Error('FALLO: El documento en disco no contiene sobre cifrado.');
    }
    if (savedDoc.body.includes(secretText)) {
      throw new Error('FALLO DE SEGURIDAD EN REPOSO: El texto plano se guardó en disco!');
    }
    console.log('  ✓ Cero Fuga en Reposo: El archivo documents.json almacena únicamente el sobre cifrado AES-256-GCM.');

    // 2. Query with Clearance Level 1 (Should be blocked 403 and logged in Blockchain)
    console.log('\n[4/5] Simulando intento de acceso por usuario sin autorización (Clearance Nivel 1)...');
    const deniedRes = await fetch(`http://localhost:8002/api/docs/${docId}`, {
      headers: { 'X-User-Clearance': '1' }
    });

    if (deniedRes.status !== 403) {
      throw new Error(`FALLO MLS: Esperaba 403 Forbidden, pero obtuve ${deniedRes.status}`);
    }
    const deniedData = await deniedRes.json();
    console.log(`  ✓ Respuesta HTTP 403 Forbidden recibida conforme a política Bell-LaPadula.`);
    console.log(`  ✓ Violación de seguridad registrada en Blockchain: Tx ${deniedData.ledgerTx} (Bloque #${deniedData.blockIndex})`);

    // Verify Blockchain has the SECURITY_ACCESS_DENIED record
    const chainRes = await fetch('http://localhost:8004/api/ledger/blocks?limit=5');
    const chainData = await chainRes.json();
    const violationTx = chainData.blocks
      .flatMap(b => b.transactions)
      .find(t => t.type === 'SECURITY_ACCESS_DENIED' && t.documentId === docId);

    if (!violationTx) {
      throw new Error('FALLO: La tentativa de intrusión no fue registrada en el libro mayor.');
    }
    console.log(`  ✓ Auditoría forense verificada en el bloque: Operador "${violationTx.operator}", Acción "${violationTx.action}".`);

    // 3. Query with Authorized Clearance Level 4 (Should decrypt in flight)
    console.log('\n[5/5] Simulando acceso por funcionario autorizado (Clearance Nivel 4)...');
    const authRes = await fetch(`http://localhost:8002/api/docs/${docId}`, {
      headers: { 'X-User-Clearance': '4' }
    });

    if (!authRes.ok) {
      throw new Error(`FALLO: Usuario autorizado fue denegado (${authRes.status})`);
    }
    const authData = await authRes.json();
    if (authData.body !== secretText) {
      throw new Error('FALLO: El cuerpo descifrado al vuelo no coincide con el texto original.');
    }
    if (!authData.decryptedInFlight || authData.cryptoIntegrity !== 'VERIFIED_AES_256_GCM_OK') {
      throw new Error('FALLO: Las banderas de verificación criptográfica no coinciden.');
    }
    console.log('  ✓ Descifrado al vuelo exitoso con AES-256-GCM.');
    console.log(`  ✓ Integridad criptográfica verificada: ${authData.cryptoIntegrity}`);

    console.log('\n========================================================================');
    console.log('🎉 VERIFICACIÓN E2E EXITOSA: SISTEMA DE CONFIDENCIALIDAD AL 100%');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ ERROR E2E:', err);
    process.exitCode = 1;
  } finally {
    console.log('Limpiando procesos de prueba...');
    procs.forEach(p => {
      try { p.kill(); } catch (e) {}
    });
  }
}

runE2ETests();

