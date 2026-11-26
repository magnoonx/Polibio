// End-to-End Integration Test for Departmental Templates and Autoincremental Correlatives
const assert = require('assert');

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:8000';
const DOC_SERVICE_URL = process.env.DOC_SERVICE_URL || 'http://localhost:8002';

async function runE2ETests() {
  console.log('========================================================================');
  console.log('🌐 PRUEBAS E2E HTTP: DIAGRAMACIÓN DE FORMATOS Y CORRELATIVOS POLIBIO');
  console.log('========================================================================\n');

  // Test against Doc Service or Gateway
  let targetUrl = GATEWAY_URL;
  try {
    const health = await fetch(`${GATEWAY_URL}/api/docs/templates`);
    if (!health.ok) targetUrl = DOC_SERVICE_URL;
  } catch (e) {
    targetUrl = DOC_SERVICE_URL;
  }
  console.log(`[Target URL] Conectando a: ${targetUrl}\n`);

  // 1. Logos Catalog
  console.log('[E2E 1] GET /api/docs/logos - Catálogo de Escudos y Logos Oficiales...');
  const logosRes = await fetch(`${targetUrl}/api/docs/logos`);
  assert.strictEqual(logosRes.status, 200, 'Debe retornar 200 OK');
  const logosData = await logosRes.json();
  assert(logosData.logos && logosData.logos.ESCUDO_NACIONAL, 'Debe incluir ESCUDO_NACIONAL');
  console.log('  ✓ Logos oficiales disponibles:', Object.keys(logosData.logos).join(', '));

  // 2. Templates List
  console.log('\n[E2E 2] GET /api/docs/templates - Listado de Plantillas Departamentales...');
  const tplsRes = await fetch(`${targetUrl}/api/docs/templates`);
  assert.strictEqual(tplsRes.status, 200, 'Debe retornar 200 OK');
  const tplsData = await tplsRes.json();
  assert(Array.isArray(tplsData.templates) && tplsData.templates.length >= 4, 'Debe haber al menos 4 plantillas');
  console.log('  ✓ Total plantillas registradas:', tplsData.templates.length);

  // 3. MLS Clearance Check: Level 1 must receive 403 Forbidden
  console.log('\n[E2E 3] POST /api/docs/templates con X-User-Clearance: 1 (Rechazo MLS)...');
  const rejectRes = await fetch(`${targetUrl}/api/docs/templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Clearance': '1',
      'X-Operator': 'Ciudadano / Visitante'
    },
    body: JSON.stringify({
      department: 'Planificación',
      logoConfig: { placement: 'CENTER' }
    })
  });
  assert.strictEqual(rejectRes.status, 403, 'Usuario Nivel 1 debe recibir 403 Forbidden');
  const rejectData = await rejectRes.json();
  console.log('  ✓ Acceso denegado correctamente por política MLS:', rejectData.error.substring(0, 75) + '...');

  // 4. Authorized Template Update: Level 2
  console.log('\n[E2E 4] POST /api/docs/templates con X-User-Clearance: 2 (Modificación Autorizada)...');
  const currentYear = new Date().getFullYear();
  const customPrefix = `OF-${currentYear}-PLAN-DIR-`;
  const updateRes = await fetch(`${targetUrl}/api/docs/templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Clearance': '2',
      'X-Operator': 'Lic. Mariana Silva'
    },
    body: JSON.stringify({
      department: 'Planificación',
      logoConfig: {
        placement: 'SPLIT',
        primaryLogo: 'ESCUDO_NACIONAL',
        secondaryLogo: 'POLIBIO_SHIELD',
        logoSize: 'LARGE'
      },
      headerConfig: {
        line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
        line2: 'MINISTERIO DE PLANIFICACIÓN',
        line3: 'DIRECCIÓN DE PROYECTOS ESTRATÉGICOS',
        line4: 'Despacho de la Dirección',
        dividerStyle: 'TRICOLOR'
      },
      correlativeConfig: {
        prefixPattern: customPrefix,
        paddingDigits: 3,
        currentSequence: 75
      }
    })
  });
  assert.strictEqual(updateRes.status, 200, 'Usuario Nivel 2 debe poder actualizar plantilla');
  const updateData = await updateRes.json();
  assert.strictEqual(updateData.template.logoConfig.placement, 'SPLIT');
  assert.strictEqual(updateData.template.correlativeConfig.prefixPattern, customPrefix);
  console.log('  ✓ Plantilla actualizada:', updateData.template.department, 'con prefijo:', updateData.template.correlativeConfig.prefixPattern);

  // 5. Correlative Preview without allocation
  console.log('\n[E2E 5] GET /api/docs/correlatives/next (Previsualización sin reserva)...');
  const previewRes = await fetch(`${targetUrl}/api/docs/correlatives/next?department=Planificaci%C3%B3n&prefix=${encodeURIComponent(customPrefix)}&digits=3&allocate=false`);
  assert.strictEqual(previewRes.status, 200);
  const previewData = await previewRes.json();
  console.log('  ✓ Correlativo previsualizado:', previewData.fullCorrelative);
  assert.strictEqual(previewData.fullCorrelative, `${customPrefix}075`);

  // 6. Create Official Document with dynamic correlative and template snapshot
  console.log('\n[E2E 6] POST /api/docs - Creación de documento con asignación autoincremental...');
  const createRes = await fetch(`${targetUrl}/api/docs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Clearance': '4'
    },
    body: JSON.stringify({
      type: 'OFICIO',
      title: 'Instrucción E2E de Despliegue de Diagramación y Correlativos Soberanos',
      subject: 'Prueba de validación de correlativo autoincremental',
      recipient: 'Dirección General de Auditoría',
      confidentialityLevel: 2,
      body: 'Por medio del presente oficio se certifica la asignación correcta del correlativo autoincremental y el membrete diagramado.',
      department: 'Planificación',
      customPrefix: customPrefix,
      paddingDigits: 3,
      templateSnapshot: updateData.template,
      author: {
        name: 'Lic. Carlos Mendoza',
        role: 'Director de Planificación',
        department: 'Planificación'
      }
    })
  });
  assert.strictEqual(createRes.status, 201, 'Documento debe ser creado con 201');
  const createData = await createRes.json();
  const createdDoc = createData.document;
  console.log('  ✓ Documento creado exitosamente!');
  console.log('  Correlativo asignado:', createdDoc.correlativeNumber);
  console.log('  Notarizado en Blockchain: Bloque #' + createdDoc.blockchainNotarization?.blockIndex);
  assert(createdDoc.correlativeNumber.startsWith(customPrefix), 'El correlativo debe iniciar con el prefijo personalizado');
  assert(createdDoc.templateSnapshot, 'Debe almacenar el snapshot de la plantilla');
  assert.strictEqual(createdDoc.templateSnapshot.logoConfig.placement, 'SPLIT');

  // 7. Verify next correlative has autoincremented
  console.log('\n[E2E 7] Verificando que el correlativo se autoincrementó en la secuencia...');
  const nextPreviewRes = await fetch(`${targetUrl}/api/docs/correlatives/next?department=Planificaci%C3%B3n&prefix=${encodeURIComponent(customPrefix)}&digits=3&allocate=false`);
  const nextPreviewData = await nextPreviewRes.json();
  console.log('  ✓ Próximo correlativo disponible:', nextPreviewData.fullCorrelative);
  assert(nextPreviewData.sequenceNumber > previewData.sequenceNumber, 'El contador debió autoincrementarse tras la creación');

  console.log('\n========================================================================');
  console.log('✅ TODAS LAS PRUEBAS E2E HTTP DE PLANTILLAS Y CORRELATIVOS PASARON (7/7)');
  console.log('========================================================================');
}

runE2ETests().catch(err => {
  console.error('\n❌ ERROR EN PRUEBA E2E:', err);
  process.exit(1);
});

