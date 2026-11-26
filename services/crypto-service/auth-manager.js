// Polibio Sovereign Identity & Access Management (IAM / PKI)
// Handles User Provisioning, Authentication, RBAC, Bell-LaPadula MLS Clearances, and Blockchain Auditing
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pg = require('../shared/postgres-adapter');

const USERS_FILE = path.join(__dirname, '../../data/users/users.json');

// In-Memory Storage
const usersById = new Map();
const usersByUsername = new Map();

let rootCA = null;
let issueCertificateFn = null;
let masterKey = null;
let ledgerServiceUrl = 'http://localhost:8004';

// Helper: Cryptographic PBKDF2 Hashing
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

function verifyPassword(password, hash, salt) {
  try {
    const computedHash = hashPassword(password, salt);
    return crypto.timingSafeEqual(Buffer.from(computedHash, 'hex'), Buffer.from(hash, 'hex'));
  } catch (e) {
    return false;
  }
}

// Sovereign Session Token Management (Signed with Master Key)
function createSessionToken(user) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'POLIBIO-SESSION' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    uid: user.id,
    username: user.username,
    name: `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim() || user.username,
    role: user.role,
    roleCode: user.roleCode || 'OPERATOR',
    department: user.profile?.department || 'Administración General',
    clearanceLevel: user.clearanceLevel,
    pkiThumbprint: user.pkiThumbprint,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 3600) // 24 hours
  })).toString('base64url');

  const signature = crypto
    .createHmac('sha256', masterKey || 'POLIBIO_SOVEREIGN_MASTER_SECRET_2026')
    .update(`${header}.${payload}`)
    .digest('base64url');

  return `${header}.${payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', masterKey || 'POLIBIO_SOVEREIGN_MASTER_SECRET_2026')
    .update(`${header}.${payload}`)
    .digest('base64url');

  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return data;
  } catch (e) {
    return null;
  }
}

// Notarize audit events directly into Ledger Service
async function auditLedgerEvent(type, action, operator, details) {
  try {
    await fetch(`${ledgerServiceUrl}/api/ledger/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        action,
        operator: operator || 'SYSTEM_IAM',
        details,
        confidentialityLevel: 3
      })
    });
  } catch (e) {
    // Non-blocking in case ledger service is starting up
  }
}

// 5 Institutional Seed Users
function getSeedUsers() {
  const seedSalt = 'polibio_default_seed_salt_2026';
  const seedHash = 'cb6a9aaa849aa77549d26b568f4a40c4d95e5b98f3a976c5fe0b8ad3cf65c17fa926f370b6b07286e4015bf7f2aa052ff20adaad37523301afc73210420c62fc'; // 'Polibio2026!'

  return [
    {
      id: '11111111-1111-1111-1111-111111111111',
      username: 'dra.elena',
      passwordHash: seedHash,
      salt: seedSalt,
      clearanceLevel: 5,
      role: 'Directora General de Despacho',
      roleCode: 'DIRECTOR',
      pkiThumbprint: null,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      createdAt: '2026-01-15T08:00:00.000Z',
      profile: {
        firstName: 'Elena',
        secondName: 'Patricia',
        lastName: 'Vasquez',
        secondLastName: 'Morales',
        nationalIdType: 'V',
        nationalIdNumber: '14.892.301',
        taxId: 'J-14892301-0',
        birthDate: '1980-04-12',
        placeOfBirth: 'Caracas, Distrito Capital',
        nationality: 'Venezolana',
        gender: 'FEMENINO',
        bloodType: 'O+',
        maritalStatus: 'CASADO',
        officialEmail: 'elena.vasquez@polibio.gob',
        personalEmail: 'elena.vasquez.p@gmail.com',
        phonePrimary: '+58-412-555-0101',
        phoneSecondary: '+58-212-999-1122',
        residentialAddress: 'Av. Ppal de El Bosque, Res. Los Samanes, Apto 8-B',
        city: 'Caracas',
        stateProvince: 'Distrito Capital',
        postalCode: '1050',
        country: 'Venezuela',
        employeeId: 'POL-EMP-001',
        department: 'Dirección Superior',
        divisionUnit: 'Despacho Ministerial',
        rankGrade: 'Grado V - Alto Funcionario',
        positionTitle: 'Directora General de Despacho',
        supervisorName: 'Ministro del Poder Popular',
        hiringDate: '2019-01-15',
        securityClearanceCode: 'SEC-CLR-LEVEL5-ALPHA',
        securityVettingStatus: 'VETTED',
        biometricHash: 'a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
        notes: 'Habilitación de Secreto de Estado aprobada por Inspectoría General y Criptografía Soberana.',
        emergencyContactName: 'Alejandro Gomez Vasquez',
        emergencyContactRelation: 'Cónyuge',
        emergencyContactPhone: '+58-414-998-3321',
        emergencyContactAddress: 'Misma dirección residencial'
      }
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      username: 'carlos.mendoza',
      passwordHash: seedHash,
      salt: seedSalt,
      clearanceLevel: 4,
      role: 'Director de Planificación y Presupuesto',
      roleCode: 'DIRECTOR',
      pkiThumbprint: null,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      createdAt: '2026-03-01T09:00:00.000Z',
      profile: {
        firstName: 'Carlos',
        secondName: 'Alberto',
        lastName: 'Mendoza',
        secondLastName: 'Rivas',
        nationalIdType: 'V',
        nationalIdNumber: '16.340.812',
        taxId: 'J-16340812-3',
        birthDate: '1983-09-24',
        placeOfBirth: 'Maracay, Edo. Aragua',
        nationality: 'Venezolana',
        gender: 'MASCULINO',
        bloodType: 'A+',
        maritalStatus: 'CASADO',
        officialEmail: 'carlos.mendoza@polibio.gob',
        personalEmail: 'carlos.mendoza.r@gmail.com',
        phonePrimary: '+58-414-555-0202',
        phoneSecondary: '+58-212-999-3344',
        residentialAddress: 'Urb. Las Mercedes, Calle París, Edif. Torreón, PH-1',
        city: 'Caracas',
        stateProvince: 'Miranda',
        postalCode: '1060',
        country: 'Venezuela',
        employeeId: 'POL-EMP-002',
        department: 'Planificación',
        divisionUnit: 'Dirección de Presupuesto y Proyectos',
        rankGrade: 'Grado IV - Especialista Principal',
        positionTitle: 'Director de Planificación y Presupuesto',
        supervisorName: 'Dra. Elena Vasquez',
        hiringDate: '2020-03-01',
        securityClearanceCode: 'SEC-CLR-LEVEL4-BETA',
        securityVettingStatus: 'VETTED',
        biometricHash: 'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2',
        notes: 'Autorizado para gestión de presupuestos estratégicos y partidas confidenciales.',
        emergencyContactName: 'Mariana Rivas de Mendoza',
        emergencyContactRelation: 'Madre',
        emergencyContactPhone: '+58-412-777-6655',
        emergencyContactAddress: 'Av. Bolivar, Res. Central, Maracay'
      }
    },
    {
      id: '33333333-3333-3333-3333-333333333333',
      username: 'roberto.gomez',
      passwordHash: seedHash,
      salt: seedSalt,
      clearanceLevel: 3,
      role: 'Consultor Jurídico Adjunto',
      roleCode: 'OPERATOR',
      pkiThumbprint: null,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      createdAt: '2026-06-10T10:00:00.000Z',
      profile: {
        firstName: 'Roberto',
        secondName: 'Ignacio',
        lastName: 'Gomez',
        secondLastName: 'Salazar',
        nationalIdType: 'V',
        nationalIdNumber: '19.123.456',
        taxId: 'J-19123456-1',
        birthDate: '1987-11-05',
        placeOfBirth: 'Valencia, Edo. Carabobo',
        nationality: 'Venezolana',
        gender: 'MASCULINO',
        bloodType: 'O-',
        maritalStatus: 'SOLTERO',
        officialEmail: 'roberto.gomez@polibio.gob',
        personalEmail: 'roberto.gomez.jur@gmail.com',
        phonePrimary: '+58-416-555-0303',
        phoneSecondary: null,
        residentialAddress: 'Colinas de Bello Monte, Av. Leonardo da Vinci, Qta. Esperanza',
        city: 'Caracas',
        stateProvince: 'Miranda',
        postalCode: '1050',
        country: 'Venezuela',
        employeeId: 'POL-EMP-003',
        department: 'Consultoría Jurídica',
        divisionUnit: 'Dictámenes y Contratos de Estado',
        rankGrade: 'Grado III - Consultor Especializado',
        positionTitle: 'Consultor Jurídico Adjunto',
        supervisorName: 'Dra. Elena Vasquez',
        hiringDate: '2021-06-10',
        securityClearanceCode: 'SEC-CLR-LEVEL3-GAMMA',
        securityVettingStatus: 'VETTED',
        biometricHash: 'c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
        notes: 'Habilitación reservada para dictámenes legales vinculantes y revisiones normativas.',
        emergencyContactName: 'Ignacio Gomez',
        emergencyContactRelation: 'Padre',
        emergencyContactPhone: '+58-424-333-4411',
        emergencyContactAddress: 'Calle Los Sauces, Valencia, Carabobo'
      }
    },
    {
      id: '44444444-4444-4444-4444-444444444444',
      username: 'mariana.silva',
      passwordHash: seedHash,
      salt: seedSalt,
      clearanceLevel: 2,
      role: 'Asistente Administrativo',
      roleCode: 'OPERATOR',
      pkiThumbprint: null,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      createdAt: '2026-09-01T11:00:00.000Z',
      profile: {
        firstName: 'Mariana',
        secondName: 'Beatriz',
        lastName: 'Silva',
        secondLastName: 'Perez',
        nationalIdType: 'V',
        nationalIdNumber: '22.987.654',
        taxId: 'J-22987654-7',
        birthDate: '1993-02-18',
        placeOfBirth: 'Los Teques, Edo. Miranda',
        nationality: 'Venezolana',
        gender: 'FEMENINO',
        bloodType: 'B+',
        maritalStatus: 'SOLTERO',
        officialEmail: 'mariana.silva@polibio.gob',
        personalEmail: 'mariana.silva.adm@gmail.com',
        phonePrimary: '+58-424-555-0404',
        phoneSecondary: null,
        residentialAddress: 'Av. Victoria, Conjunto Residencial Los Próceres, Torre 2, Apto 4-A',
        city: 'Caracas',
        stateProvince: 'Distrito Capital',
        postalCode: '1010',
        country: 'Venezuela',
        employeeId: 'POL-EMP-004',
        department: 'Administración General',
        divisionUnit: 'Gestión Documental y Correspondencia',
        rankGrade: 'Grado II - Analista Superior',
        positionTitle: 'Asistente Administrativo',
        supervisorName: 'Lic. Carlos Mendoza',
        hiringDate: '2022-09-01',
        securityClearanceCode: 'SEC-CLR-LEVEL2-INTERNO',
        securityVettingStatus: 'VETTED',
        biometricHash: 'd5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
        notes: 'Acceso operativo interno para trámites ordinarios y gestión de expedientes.',
        emergencyContactName: 'Beatriz Perez de Silva',
        emergencyContactRelation: 'Madre',
        emergencyContactPhone: '+58-416-222-1188',
        emergencyContactAddress: 'Av. Independencia, Los Teques'
      }
    },
    {
      id: '55555555-5555-5555-5555-555555555555',
      username: 'ciudadano.publico',
      passwordHash: seedHash,
      salt: seedSalt,
      clearanceLevel: 1,
      role: 'Acceso Público General',
      roleCode: 'CITIZEN',
      pkiThumbprint: null,
      status: 'ACTIVE',
      failedLoginAttempts: 0,
      createdAt: '2026-01-10T12:00:00.000Z',
      profile: {
        firstName: 'Juan',
        secondName: 'Bautista',
        lastName: 'Ciudadano',
        secondLastName: 'Demostración',
        nationalIdType: 'V',
        nationalIdNumber: '25.000.001',
        taxId: 'V-25000001-0',
        birthDate: '1998-07-01',
        placeOfBirth: 'Barquisimeto, Edo. Lara',
        nationality: 'Venezolana',
        gender: 'MASCULINO',
        bloodType: 'O+',
        maritalStatus: 'SOLTERO',
        officialEmail: 'ciudadano@polibio.gob',
        personalEmail: 'ciudadano.demo@gmail.com',
        phonePrimary: '+58-412-555-0505',
        phoneSecondary: null,
        residentialAddress: 'Sector Centro, Calle 23 con Carrera 18',
        city: 'Barquisimeto',
        stateProvince: 'Lara',
        postalCode: '3001',
        country: 'Venezuela',
        employeeId: 'POL-PUB-001',
        department: 'Atención al Ciudadano',
        divisionUnit: 'Ventanilla Única de Trámites Públicos',
        rankGrade: 'Grado I - Atención Pública',
        positionTitle: 'Acceso Público General',
        supervisorName: 'Coordinador de Taquilla',
        hiringDate: '2023-01-10',
        securityClearanceCode: 'SEC-CLR-LEVEL1-PUB',
        securityVettingStatus: 'VETTED',
        biometricHash: 'e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8',
        notes: 'Habilitación de consulta pública, verificación de cotejo y trámites abiertos.',
        emergencyContactName: 'Maria Elena Ciudadano',
        emergencyContactRelation: 'Hermana',
        emergencyContactPhone: '+58-424-111-2233',
        emergencyContactAddress: 'Misma dirección residencial'
      }
    }
  ];
}

// Ensure PKI certificates are linked to users
function pairUserWithPkiCertificate(user, pkiCertificatesMap) {
  if (user.pkiThumbprint && pkiCertificatesMap.has(user.pkiThumbprint)) {
    return;
  }

  // Find existing cert matching user common name or email
  const fullName = `${user.profile?.firstName || ''} ${user.profile?.lastName || ''}`.trim();
  for (const cert of pkiCertificatesMap.values()) {
    if (
      cert.subject?.commonName?.toLowerCase() === fullName.toLowerCase() ||
      cert.subject?.email?.toLowerCase() === user.profile?.officialEmail?.toLowerCase()
    ) {
      user.pkiThumbprint = cert.thumbprint;
      return;
    }
  }

  // If no certificate found and issueCertificateFn is available, issue one!
  if (typeof issueCertificateFn === 'function') {
    try {
      const newCert = issueCertificateFn({
        cn: fullName || user.username,
        role: user.role,
        department: user.profile?.department || 'Administración Institucional',
        clearanceLevel: user.clearanceLevel,
        email: user.profile?.officialEmail || `${user.username}@polibio.gob`
      });
      user.pkiThumbprint = newCert.thumbprint;
    } catch (e) {
      console.warn('[IAM] No se pudo generar certificado para usuario:', user.username, e.message);
    }
  }
}

// Save users to file and sync to PostgreSQL
function saveUsersState() {
  try {
    const list = Array.from(usersById.values());
    const dataDir = path.dirname(USERS_FILE);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2));

    // Async sync to PostgreSQL if connected
    if (pg.isConfigured()) {
      syncAllToPostgres(list).catch(err => {
        console.warn('[IAM] Fallo sincronización asíncrona a PostgreSQL:', err.message);
      });
    }
  } catch (err) {
    console.error('[IAM] Error guardando estado de usuarios:', err);
  }
}

async function syncAllToPostgres(usersList) {
  for (const u of usersList) {
    try {
      await pg.query(
        `INSERT INTO users (id, username, password_hash, salt, clearance_level, role, role_code, pki_thumbprint, status, failed_login_attempts)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (username) DO UPDATE SET
           clearance_level = EXCLUDED.clearance_level,
           role = EXCLUDED.role,
           role_code = EXCLUDED.role_code,
           pki_thumbprint = EXCLUDED.pki_thumbprint,
           status = EXCLUDED.status,
           failed_login_attempts = EXCLUDED.failed_login_attempts`,
        [u.id, u.username, u.passwordHash, u.salt, u.clearanceLevel, u.role, u.roleCode || 'OPERATOR', u.pkiThumbprint, u.status || 'ACTIVE', u.failedLoginAttempts || 0]
      );

      if (u.profile) {
        const p = u.profile;
        await pg.query(
          `INSERT INTO user_profiles (
            user_id, first_name, second_name, last_name, second_last_name,
            national_id_type, national_id_number, tax_id, birth_date, place_of_birth, nationality,
            gender, blood_type, marital_status,
            official_email, personal_email, phone_primary, phone_secondary,
            residential_address, city, state_province, postal_code, country,
            employee_id, department, division_unit, rank_grade, position_title, supervisor_name, hiring_date,
            security_clearance_code, security_vetting_status, biometric_hash, notes,
            emergency_contact_name, emergency_contact_relation, emergency_contact_phone, emergency_contact_address
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38
          )
          ON CONFLICT (user_id) DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            national_id_number = EXCLUDED.national_id_number,
            official_email = EXCLUDED.official_email,
            phone_primary = EXCLUDED.phone_primary,
            department = EXCLUDED.department,
            security_vetting_status = EXCLUDED.security_vetting_status`,
          [
            u.id, p.firstName, p.secondName || null, p.lastName, p.secondLastName || null,
            p.nationalIdType || 'DNI', p.nationalIdNumber || null, p.taxId || null, p.birthDate || null, p.placeOfBirth || null, p.nationality || 'Venezolana',
            p.gender || 'NO_ESPECIFICADO', p.bloodType || null, p.maritalStatus || 'SOLTERO',
            p.officialEmail || null, p.personalEmail || null, p.phonePrimary || null, p.phoneSecondary || null,
            p.residentialAddress || null, p.city || null, p.stateProvince || null, p.postalCode || null, p.country || 'Venezuela',
            p.employeeId || null, p.department || 'Administración General', p.divisionUnit || null, p.rankGrade || null, p.positionTitle || null, p.supervisorName || null, p.hiringDate || null,
            p.securityClearanceCode || null, p.securityVettingStatus || 'VETTED', p.biometricHash || null, p.notes || null,
            p.emergencyContactName || null, p.emergencyContactRelation || null, p.emergencyContactPhone || null, p.emergencyContactAddress || null
          ]
        );
      }
    } catch (err) {
      // Ignore individual sync errors
    }
  }
}

// Initialize IAM Subsystem
function init({ rootCertificateAuthority, issueCertFunction, masterEncryptionKey, ledgerUrl, pkiCertificatesMap }) {
  rootCA = rootCertificateAuthority;
  issueCertificateFn = issueCertFunction;
  masterKey = masterEncryptionKey;
  if (ledgerUrl) ledgerServiceUrl = ledgerUrl;

  let loadedUsers = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      loadedUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      console.log(`[IAM] ${loadedUsers.length} usuarios institucionales cargados desde almacenamiento local.`);
    } catch (e) {
      console.error('[IAM] Error leyendo archivo de usuarios, sembrando iniciales...', e);
      loadedUsers = getSeedUsers();
    }
  } else {
    console.log('[IAM] Creando base de datos inicial de usuarios soberanos con 5 perfiles institucionales...');
    loadedUsers = getSeedUsers();
  }

  // Index in memory
  loadedUsers.forEach(u => {
    if (pkiCertificatesMap) {
      pairUserWithPkiCertificate(u, pkiCertificatesMap);
    }
    usersById.set(u.id, u);
    usersByUsername.set(u.username.toLowerCase(), u);
  });

  saveUsersState();
}

// User Registration
async function registerUser(userData, operator = 'ADMIN_SUPERVISOR', pkiCertificatesMap = null) {
  const username = (userData.username || '').trim().toLowerCase();
  if (!username || username.length < 3) {
    throw new Error('El nombre de usuario institucional debe tener al menos 3 caracteres alfanuméricos.');
  }

  if (usersByUsername.has(username)) {
    throw new Error(`El nombre de usuario institucional "${username}" ya se encuentra registrado.`);
  }

  const password = userData.password || 'Polibio2026!';
  if (password.length < 6) {
    throw new Error('La contraseña debe tener una longitud mínima de 6 caracteres.');
  }

  const clearanceLevel = parseInt(userData.clearanceLevel, 10) || 1;
  if (clearanceLevel < 1 || clearanceLevel > 5) {
    throw new Error('Nivel de habilitación de seguridad inválido. Rango permitido: 1 a 5.');
  }

  const salt = generateSalt();
  const passwordHash = hashPassword(password, salt);
  const userId = crypto.randomUUID();

  // Full Institutional & Personal Profile Data
  const profile = {
    // 1. Identidad Civil
    firstName: (userData.firstName || '').trim() || username,
    secondName: (userData.secondName || '').trim() || null,
    lastName: (userData.lastName || '').trim() || 'Institucional',
    secondLastName: (userData.secondLastName || '').trim() || null,
    nationalIdType: userData.nationalIdType || 'V',
    nationalIdNumber: (userData.nationalIdNumber || '').trim() || null,
    taxId: (userData.taxId || '').trim() || null,
    birthDate: userData.birthDate || null,
    placeOfBirth: (userData.placeOfBirth || '').trim() || null,
    nationality: (userData.nationality || '').trim() || 'Venezolana',
    gender: userData.gender || 'NO_ESPECIFICADO',
    bloodType: userData.bloodType || null,
    maritalStatus: userData.maritalStatus || 'SOLTERO',

    // 2. Contacto y Residencia
    officialEmail: (userData.officialEmail || `${username}@polibio.gob`).trim(),
    personalEmail: (userData.personalEmail || '').trim() || null,
    phonePrimary: (userData.phonePrimary || '').trim() || null,
    phoneSecondary: (userData.phoneSecondary || '').trim() || null,
    residentialAddress: (userData.residentialAddress || '').trim() || null,
    city: (userData.city || '').trim() || null,
    stateProvince: (userData.stateProvince || '').trim() || null,
    postalCode: (userData.postalCode || '').trim() || null,
    country: (userData.country || 'Venezuela').trim(),

    // 3. Jerarquía y Habilitación de Seguridad
    employeeId: (userData.employeeId || `POL-EMP-${Date.now().toString().slice(-4)}`).trim(),
    department: (userData.department || 'Administración General').trim(),
    divisionUnit: (userData.divisionUnit || '').trim() || null,
    rankGrade: (userData.rankGrade || `Grado ${clearanceLevel}`).trim(),
    positionTitle: (userData.positionTitle || userData.role || 'Funcionario Oficial').trim(),
    supervisorName: (userData.supervisorName || '').trim() || null,
    hiringDate: userData.hiringDate || new Date().toISOString().split('T')[0],
    securityClearanceCode: (userData.securityClearanceCode || `SEC-CLR-L${clearanceLevel}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`).trim(),
    securityVettingStatus: userData.securityVettingStatus || 'VETTED',
    biometricHash: userData.biometricHash || crypto.createHash('sha256').update(userId + username).digest('hex'),
    notes: (userData.notes || '').trim() || null,

    // 4. Contactos de Emergencia
    emergencyContactName: (userData.emergencyContactName || '').trim() || null,
    emergencyContactRelation: (userData.emergencyContactRelation || '').trim() || null,
    emergencyContactPhone: (userData.emergencyContactPhone || '').trim() || null,
    emergencyContactAddress: (userData.emergencyContactAddress || '').trim() || null
  };

  const newUser = {
    id: userId,
    username,
    passwordHash,
    salt,
    clearanceLevel,
    role: (userData.role || profile.positionTitle || 'Funcionario Oficial').trim(),
    roleCode: userData.roleCode || (clearanceLevel >= 4 ? 'DIRECTOR' : 'OPERATOR'),
    pkiThumbprint: null,
    status: 'ACTIVE',
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIp: null,
    createdAt: new Date().toISOString(),
    profile
  };

  // Issue PKI Certificate automatically if requested or by default
  if (userData.issuePkiCertificate !== false && typeof issueCertificateFn === 'function') {
    try {
      const cert = issueCertificateFn({
        cn: `${profile.firstName} ${profile.lastName}`.trim(),
        role: newUser.role,
        department: profile.department,
        clearanceLevel: newUser.clearanceLevel,
        email: profile.officialEmail
      });
      newUser.pkiThumbprint = cert.thumbprint;
      if (pkiCertificatesMap) {
        pkiCertificatesMap.set(cert.thumbprint, cert);
      }
    } catch (e) {
      console.warn('[IAM] Error emitiendo certificado X.509 al crear usuario:', e.message);
    }
  }

  // Save in memory
  usersById.set(newUser.id, newUser);
  usersByUsername.set(newUser.username, newUser);

  // Persist
  saveUsersState();

  // Notarize creation in Blockchain Ledger
  await auditLedgerEvent('USER_REGISTERED', 'CREATE_INSTITUTIONAL_IDENTITY', operator, {
    userId: newUser.id,
    username: newUser.username,
    clearanceLevel: newUser.clearanceLevel,
    employeeId: profile.employeeId,
    department: profile.department,
    pkiThumbprint: newUser.pkiThumbprint
  });

  return sanitizeUser(newUser);
}

// User Authentication
async function authenticate(usernameOrEmail, password, ip = '127.0.0.1') {
  if (!usernameOrEmail || !password) {
    throw new Error('Credenciales incompletas: Indique usuario o correo y contraseña.');
  }

  const query = usernameOrEmail.trim().toLowerCase();
  let user = usersByUsername.get(query);

  // Search by official email if not found by username
  if (!user) {
    for (const u of usersById.values()) {
      if (u.profile?.officialEmail?.toLowerCase() === query) {
        user = u;
        break;
      }
    }
  }

  if (!user) {
    await auditLedgerEvent('SECURITY_LOGIN_FAILED', 'USER_NOT_FOUND', 'SYSTEM_IAM', {
      attemptedIdentity: query,
      ip
    });
    const err = new Error('Credenciales institucionales inválidas o usuario no registrado.');
    err.status = 401;
    throw err;
  }

  // Account status check
  if (user.status !== 'ACTIVE') {
    const err = new Error(`Acceso Bloqueado: La cuenta del usuario se encuentra en estado ${user.status}.`);
    err.status = 403;
    throw err;
  }

  // Lockout check
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const minutesLeft = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
    const err = new Error(`Cuenta bloqueada por múltiples intentos fallidos. Intente nuevamente en ${minutesLeft} minutos.`);
    err.status = 429;
    throw err;
  }

  // Password verification
  const isValid = verifyPassword(password, user.passwordHash, user.salt);
  if (!isValid) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min lockout
    }
    saveUsersState();

    await auditLedgerEvent('SECURITY_LOGIN_FAILED', 'PASSWORD_MISMATCH', user.username, {
      userId: user.id,
      failedAttempts: user.failedLoginAttempts,
      ip
    });

    const err = new Error('Credenciales institucionales inválidas o contraseña incorrecta.');
    err.status = 401;
    throw err;
  }

  // Successful login
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.lastLoginAt = new Date().toISOString();
  user.lastLoginIp = ip;
  saveUsersState();

  const token = createSessionToken(user);

  await auditLedgerEvent('USER_LOGIN_SUCCESS', 'SESSION_ESTABLISHED', user.username, {
    userId: user.id,
    clearanceLevel: user.clearanceLevel,
    pkiThumbprint: user.pkiThumbprint,
    ip
  });

  return {
    token,
    user: sanitizeUser(user)
  };
}

// Helper: Sanitize user object for API responses
function sanitizeUser(user) {
  const clone = { ...user };
  delete clone.passwordHash;
  delete clone.salt;
  return clone;
}

// User Query and Management
function listUsers(filters = {}) {
  let list = Array.from(usersById.values()).map(sanitizeUser);

  if (filters.clearanceLevel) {
    const level = parseInt(filters.clearanceLevel, 10);
    list = list.filter(u => u.clearanceLevel === level);
  }

  if (filters.department) {
    const dept = filters.department.toLowerCase();
    list = list.filter(u => u.profile?.department?.toLowerCase().includes(dept));
  }

  if (filters.status) {
    list = list.filter(u => u.status === filters.status);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      u.profile?.firstName?.toLowerCase().includes(q) ||
      u.profile?.lastName?.toLowerCase().includes(q) ||
      u.profile?.nationalIdNumber?.toLowerCase().includes(q) ||
      u.profile?.employeeId?.toLowerCase().includes(q)
    );
  }

  return list;
}

function getUserById(id) {
  const user = usersById.get(id);
  if (!user) return null;
  return sanitizeUser(user);
}

async function updateUser(id, updateData, operator = 'ADMIN_SUPERVISOR') {
  const user = usersById.get(id);
  if (!user) {
    throw new Error('Usuario no encontrado.');
  }

  if (updateData.clearanceLevel !== undefined) {
    user.clearanceLevel = parseInt(updateData.clearanceLevel, 10);
  }
  if (updateData.role !== undefined) user.role = updateData.role;
  if (updateData.roleCode !== undefined) user.roleCode = updateData.roleCode;
  if (updateData.status !== undefined) user.status = updateData.status;

  if (updateData.profile) {
    user.profile = {
      ...user.profile,
      ...updateData.profile
    };
  }

  saveUsersState();

  await auditLedgerEvent('USER_UPDATED', 'UPDATE_INSTITUTIONAL_IDENTITY', operator, {
    userId: user.id,
    username: user.username,
    changes: Object.keys(updateData)
  });

  return sanitizeUser(user);
}

module.exports = {
  init,
  registerUser,
  authenticate,
  verifySessionToken,
  listUsers,
  getUserById,
  updateUser,
  hashPassword,
  verifyPassword
};

