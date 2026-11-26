const http = require('http');

// Base64 transparent 1x1 PNG
const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: buffer.toString('utf8'),
          rawBuffer: buffer
        });
      });
    });

    req.on('error', err => reject(err));

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 INICIANDO VERIFICACIÓN DE SUBIDA Y MANIPULACIÓN');
  console.log('====================================================');

  const GATEWAY_PORT = 8000;
  const DOC_SERVICE_PORT = 8002;

  // Let's determine if we can hit Gateway (8000) or Doc Service directly (8002)
  let targetPort = GATEWAY_PORT;
  try {
    const ping = await makeRequest({
      hostname: 'localhost',
      port: GATEWAY_PORT,
      path: '/api/docs/templates',
      method: 'GET'
    });
    if (ping.statusCode === 200) {
      console.log('✅ Conexión establecida a través de API Gateway (Puerto 8000)');
      targetPort = GATEWAY_PORT;
    }
  } catch (e) {
    console.log('⚠️ Gateway no responde directamente, conectando a doc-service (Puerto 8002)');
    targetPort = DOC_SERVICE_PORT;
  }

  // TEST 1: Upload Image
  console.log('\n--- TEST 1: Subida de Imagen (POST /api/docs/upload) ---');
  const uploadPayload = JSON.stringify({
    filename: 'organigrama_seguridad.png',
    mimeType: 'image/png',
    base64Data: TINY_PNG_BASE64,
    description: 'Diagrama de Topología y Cifrado'
  });

  const uploadRes = await makeRequest({
    hostname: 'localhost',
    port: targetPort,
    path: '/api/docs/upload',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(uploadPayload),
      'X-User-Clearance': '4'
    }
  }, uploadPayload);

  console.log(`Status HTTP: ${uploadRes.statusCode}`);
  const uploadData = JSON.parse(uploadRes.body);
  console.log('Respuesta:', uploadData);

  if (uploadRes.statusCode !== 201 || !uploadData.url || !uploadData.filename) {
    throw new Error('Fallo en la prueba de subida de imagen');
  }
  console.log(`✅ Imagen subida exitosamente con URL: ${uploadData.url}`);

  // TEST 2: Serve Uploaded Image
  console.log('\n--- TEST 2: Descarga y Servido de Imagen (GET /api/docs/uploads/:filename) ---');
  const serveRes = await makeRequest({
    hostname: 'localhost',
    port: targetPort,
    path: uploadData.url,
    method: 'GET'
  });

  console.log(`Status HTTP: ${serveRes.statusCode}`);
  console.log(`Content-Type: ${serveRes.headers['content-type']}`);
  console.log(`Bytes recibidos: ${serveRes.rawBuffer.length}`);

  if (serveRes.statusCode !== 200 || serveRes.headers['content-type'] !== 'image/png') {
    throw new Error('Fallo al servir la imagen estática subida');
  }
  console.log('✅ Imagen servida correctamente con cabeceras MIME y longitud válidas');

  // TEST 3: Path Traversal Protection
  console.log('\n--- TEST 3: Seguridad Anti-Directory Traversal ---');
  const traversalRes = await makeRequest({
    hostname: 'localhost',
    port: targetPort,
    path: '/api/docs/uploads/../../package.json',
    method: 'GET'
  });
  console.log(`Status HTTP traversal check: ${traversalRes.statusCode}`);
  if (traversalRes.statusCode === 200 && traversalRes.body.includes('"name":')) {
    throw new Error('Fallo de seguridad: Posible Directory Traversal detectado');
  }
  console.log('✅ Protección contra Directory Traversal confirmada (Bloqueo o 404 seguro)');

  // TEST 4: Create Document with Embedded Image
  console.log('\n--- TEST 4: Creación de Oficio con Figura Incrustada ---');
  const embeddedTag = `![Topología del Enlace Soberano|width=450px|align=center|border=framed](${uploadData.url})`;
  const docPayload = JSON.stringify({
    title: 'Informe Técnico con Diagrama Criptográfico',
    recipient: 'Dirección General de Ciberdefensa',
    subject: 'Despliegue de Enlace con Topología Segura',
    body: `Estimadas autoridades,\n\nPor medio del presente remitimos el informe técnico con la arquitectura aprobada.\n\n${embeddedTag}\n\nQuedamos a su disposición para la auditoría técnica.\n\nAtentamente,\nEquipo de Operaciones Criptográficas.`,
    confidentialityLevel: 2,
    author: {
      name: 'Dra. Elena Vasquez',
      role: 'Directora de Criptografía',
      department: 'Dirección de Tecnología y Ciberdefensa'
    }
  });

  const docRes = await makeRequest({
    hostname: 'localhost',
    port: targetPort,
    path: '/api/docs',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(docPayload),
      'X-User-Clearance': '4'
    }
  }, docPayload);

  console.log(`Status HTTP creación doc: ${docRes.statusCode}`);
  const docData = JSON.parse(docRes.body);
  const createdDoc = docData.document || docData;
  console.log(`Documento creado con Correlativo: ${createdDoc.correlativeNumber}, Hash SHA-256: ${createdDoc.documentHash?.substring(0, 16)}...`);

  if (!createdDoc.correlativeNumber || !createdDoc.body.includes(uploadData.url)) {
    throw new Error('Fallo al persistir documento con figura incrustada');
  }
  console.log('✅ Documento persistido y notarizado correctamente con figura incrustada');

  // TEST 5: Template Custom Logo Configuration
  console.log('\n--- TEST 5: Actualización de Plantilla Departamental con Logo Personalizado ---');
  const tplPayload = JSON.stringify({
    department: 'Dirección de Tecnología y Ciberdefensa',
    templateData: {
      logoConfig: {
        primaryPreset: 'shield',
        secondaryPreset: 'none',
        customPrimaryUrl: uploadData.url,
        customSecondaryUrl: null,
        placement: 'split',
        logoSize: '64px'
      },
      headerConfig: {
        institutionalName: 'REPÚBLICA BOLIVARIANA - POLIBIO NATIVO',
        topSubtext: 'ORGANISMO DE SEGURIDAD DE LA INFORMACIÓN',
        dependencyText: 'DIRECCIÓN DE TECNOLOGÍA Y CIBERDEFENSA',
        fontFamily: 'serif',
        align: 'center'
      },
      correlativeConfig: {
        prefix: 'DTC',
        separator: '-',
        digits: 3,
        autoIncrement: true
      },
      footerConfig: {
        motto: '"Integridad Criptográfica, Soberanía Tecnológica"',
        address: 'Av. Libertador, Edif. Sede Principal, Piso 4',
        contactInfo: 'dtc@polibio.gob.ve • Tlf: +58 212 555-0100'
      }
    }
  });

  const tplRes = await makeRequest({
    hostname: 'localhost',
    port: targetPort,
    path: '/api/docs/templates',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(tplPayload),
      'X-User-Clearance': '4'
    }
  }, tplPayload);

  console.log(`Status HTTP actualización plantilla: ${tplRes.statusCode}`);
  const tplData = JSON.parse(tplRes.body);
  console.log('Resultado plantilla:', tplData.template?.logoConfig);

  if (tplRes.statusCode !== 200 || tplData.template?.logoConfig?.customPrimaryUrl !== uploadData.url) {
    throw new Error('Fallo al actualizar plantilla departamental con logo personalizado');
  }
  console.log('✅ Plantilla actualizada exitosamente con URL de logo personalizado');

  console.log('\n====================================================');
  console.log('🎉 TODOS LOS TESTS DE SUBIDA Y MANIPULACIÓN PASARON');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('❌ Error en test_image_upload.js:', err);
  process.exit(1);
});
