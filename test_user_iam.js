// Test Suite: Polibio Sovereign Identity & Access Management (IAM / PKI)
const { spawn } = require('child_process');
const path = require('path');

console.log('========================================================================');
console.log('🛡️  PRUEBAS UNITARIAS Y DE INTEGRACIÓN: IAM, ACCESO & USUARIOS POLIBIO');
console.log('========================================================================\n');

let cryptoProc = null;

async function run() {
  // 1. Start crypto-service on port 8003
  cryptoProc = spawn(process.execPath, [path.join(__dirname, 'services/crypto-service/index.js')], {
    stdio: 'pipe'
  });

  // Wait for health
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch('http://localhost:8003/health');
      if (res.ok) {
        healthy = true;
        break;
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 200));
  }

  if (!healthy) {
    console.error('❌ Error: crypto-service no inició en puerto 8003');
    cleanup();
    process.exit(1);
  }
  console.log('✓ polibio-crypto-service operativo en puerto 8003.\n');

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

  // Test 1: Seed Users
  await test('Verificar que los 5 usuarios institucionales semilla estén inicializados', async () => {
    const res = await fetch('http://localhost:8003/api/users');
    const data = await res.json();
    return data.count >= 5 && data.users.some(u => u.username === 'dra.elena');
  });

  // Test 2: Login with default password
  let sessionToken = null;
  await test('Autenticación soberana de funcionario (dra.elena con Polibio2026!)', async () => {
    const res = await fetch('http://localhost:8003/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'dra.elena',
        password: 'Polibio2026!'
      })
    });
    const data = await res.json();
    if (!data.success || !data.token) return false;
    sessionToken = data.token;
    return data.user.clearanceLevel === 5 && data.user.profile.bloodType === 'O+';
  });

  // Test 3: Verify Token
  await test('Validación criptográfica de sesión soberana (Token HMAC-SHA256)', async () => {
    const res = await fetch('http://localhost:8003/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: sessionToken })
    });
    const data = await res.json();
    return data.valid === true && data.session.username === 'dra.elena';
  });

  // Test 4: Profile inspection (/api/auth/me)
  await test('Consultar perfil propio (/api/auth/me) con Bearer token', async () => {
    const res = await fetch('http://localhost:8003/api/auth/me', {
      headers: { 'Authorization': `Bearer ${sessionToken}` }
    });
    const data = await res.json();
    return data.user?.username === 'dra.elena' && data.user?.profile?.employeeId === 'POL-EMP-001';
  });

  // Test 5: Register new user with extensive institutional and personal metadata
  let newUserId = null;
  await test('Creación de nuevo funcionario con ficha integral de datos de seguridad', async () => {
    const uniqueUser = `oficial.${Date.now()}`;
    const payload = {
      username: uniqueUser,
      password: 'ClaveSegura2026!',
      clearanceLevel: 4,
      role: 'Inspector de Contrainteligencia',
      roleCode: 'SECURITY_OFFICER',
      // Datos Personales
      firstName: 'Marcos',
      secondName: 'Antonio',
      lastName: 'Paredes',
      secondLastName: 'Salvatierra',
      nationalIdType: 'V',
      nationalIdNumber: '17.654.321',
      taxId: 'J-17654321-9',
      birthDate: '1985-05-18',
      placeOfBirth: 'San Cristóbal, Táchira',
      nationality: 'Venezolana',
      gender: 'MASCULINO',
      bloodType: 'AB+',
      maritalStatus: 'CASADO',
      // Contacto
      officialEmail: `${uniqueUser}@polibio.gob`,
      personalEmail: 'marcos.paredes@gmail.com',
      phonePrimary: '+58-414-888-9900',
      phoneSecondary: '+58-276-333-1122',
      residentialAddress: 'Urb. Las Acacias, Quinta Los Pinos #42',
      city: 'San Cristóbal',
      stateProvince: 'Táchira',
      postalCode: '5001',
      country: 'Venezuela',
      // Institucional
      employeeId: `POL-CI-${Date.now().toString().slice(-4)}`,
      department: 'Inteligencia y Ciberseguridad',
      divisionUnit: 'División de Contramedidas',
      rankGrade: 'Inspector Mayor',
      positionTitle: 'Inspector de Contrainteligencia',
      supervisorName: 'Dra. Elena Vasquez',
      hiringDate: '2024-02-01',
      securityClearanceCode: 'SEC-CLR-LEVEL4-CI-99',
      securityVettingStatus: 'VETTED',
      notes: 'Investigación de confiabilidad completada sin objeciones.',
      // Emergencia
      emergencyContactName: 'Laura Sanchez de Paredes',
      emergencyContactRelation: 'Cónyuge',
      emergencyContactPhone: '+58-412-111-2244',
      emergencyContactAddress: 'Misma dirección residencial',
      issuePkiCertificate: true
    };

    const res = await fetch('http://localhost:8003/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success || !data.user) return false;
    newUserId = data.user.id;
    return data.user.pkiThumbprint != null &&
           data.user.profile.bloodType === 'AB+' &&
           data.user.profile.employeeId.startsWith('POL-CI-');
  });

  // Test 6: Verify new user can login immediately
  await test('Verificar login inmediato del nuevo funcionario creado', async () => {
    const user = (await (await fetch(`http://localhost:8003/api/users/${newUserId}`)).json()).user;
    const res = await fetch('http://localhost:8003/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        password: 'ClaveSegura2026!'
      })
    });
    const data = await res.json();
    return data.success === true && data.user.clearanceLevel === 4;
  });

  // Test 7: Reject invalid login and lock protection
  await test('Manejo seguro de contraseñas erróneas (rechazo 401)', async () => {
    const res = await fetch('http://localhost:8003/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'dra.elena',
        password: 'ContrasenaIncorrecta!'
      })
    });
    return res.status === 401;
  });

  console.log(`\n========================================================================`);
  console.log(`Resultado: ${passed}/${total} pruebas superadas (${Math.round(passed/total*100)}%)`);
  console.log(`========================================================================\n`);

  cleanup();
  process.exit(passed === total ? 0 : 1);
}

function cleanup() {
  if (cryptoProc) {
    try { cryptoProc.kill('SIGTERM'); } catch (e) {}
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

run();

