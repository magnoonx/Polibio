-- ============================================================================
-- POLIBIO: PLATAFORMA SOBERANA DE DOCUMENTACIÓN OFICIAL, PKI & BLOCKCHAIN
-- Esquema de Base de Datos PostgreSQL con Seguridad Multinivel (MLS) & RLS
-- ============================================================================

-- Habilitar extensiones criptográficas y de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLA: CERTIFICADOS DIGITALES & PKI INSTITUCIONAL
-- ============================================================================
CREATE TABLE IF NOT EXISTS pki_certificates (
    serial_number VARCHAR(64) PRIMARY KEY,
    common_name VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    organization VARCHAR(255) DEFAULT 'Gobierno Institucional',
    email VARCHAR(255),
    clearance_level SMALLINT NOT NULL CHECK (clearance_level BETWEEN 1 AND 5),
    public_key TEXT NOT NULL,
    private_key TEXT, -- Almacenada sólo en entorno demo/soberano local
    thumbprint CHAR(64) UNIQUE NOT NULL, -- Huella SHA-256
    ca_signature TEXT NOT NULL,
    issuer VARCHAR(255) NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_to TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pki_thumbprint ON pki_certificates(thumbprint);
CREATE INDEX IF NOT EXISTS idx_pki_clearance ON pki_certificates(clearance_level);
CREATE INDEX IF NOT EXISTS idx_pki_status ON pki_certificates(status);

-- ============================================================================
-- 1.1 TABLA: USUARIOS INSTITUCIONALES & CREDENCIALES DE ACCESO (IAM / MLS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    salt VARCHAR(64) NOT NULL,
    clearance_level SMALLINT NOT NULL DEFAULT 1 CHECK (clearance_level BETWEEN 1 AND 5),
    role VARCHAR(128) NOT NULL DEFAULT 'Funcionario',
    role_code VARCHAR(64) NOT NULL DEFAULT 'OPERATOR' CHECK (role_code IN ('SYS_ADMIN', 'SECURITY_OFFICER', 'DIRECTOR', 'OPERATOR', 'AUDITOR', 'CITIZEN')),
    pki_thumbprint VARCHAR(64) REFERENCES pki_certificates(thumbprint) ON DELETE SET NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REVOKED', 'IN_VETTING')),
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    last_login_ip VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_clearance ON users(clearance_level);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_role_code ON users(role_code);
CREATE INDEX IF NOT EXISTS idx_users_thumbprint ON users(pki_thumbprint);

-- ============================================================================
-- 1.2 TABLA: PERFILES COMPLETOS DE SEGURIDAD INSTITUCIONAL Y PERSONAL
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    
    -- 1.2.1 Identidad Civil y Registro Personal
    first_name VARCHAR(128) NOT NULL,
    second_name VARCHAR(128),
    last_name VARCHAR(128) NOT NULL,
    second_last_name VARCHAR(128),
    national_id_type VARCHAR(16) NOT NULL DEFAULT 'DNI' CHECK (national_id_type IN ('V', 'E', 'DNI', 'CI', 'PASAPORTE', 'OTRO')),
    national_id_number VARCHAR(64),
    tax_id VARCHAR(64),
    birth_date DATE,
    place_of_birth VARCHAR(255),
    nationality VARCHAR(128) DEFAULT 'Venezolana',
    gender VARCHAR(32) DEFAULT 'NO_ESPECIFICADO' CHECK (gender IN ('MASCULINO', 'FEMENINO', 'OTRO', 'NO_ESPECIFICADO')),
    blood_type VARCHAR(8) CHECK (blood_type IN ('O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', NULL)),
    marital_status VARCHAR(32) DEFAULT 'SOLTERO' CHECK (marital_status IN ('SOLTERO', 'CASADO', 'DIVORCIADO', 'VIUDO', 'CONCUBINATO', 'OTRO')),
    
    -- 1.2.2 Contacto y Domicilio
    official_email VARCHAR(255),
    personal_email VARCHAR(255),
    phone_primary VARCHAR(64),
    phone_secondary VARCHAR(64),
    residential_address TEXT,
    city VARCHAR(128),
    state_province VARCHAR(128),
    postal_code VARCHAR(32),
    country VARCHAR(128) DEFAULT 'Venezuela',
    
    -- 1.2.3 Jerarquía Institucional y Habilitación de Seguridad
    employee_id VARCHAR(64) UNIQUE,
    department VARCHAR(255) NOT NULL DEFAULT 'Administración General',
    division_unit VARCHAR(255),
    rank_grade VARCHAR(128),
    position_title VARCHAR(255),
    supervisor_name VARCHAR(255),
    hiring_date DATE,
    security_clearance_code VARCHAR(128),
    security_vetting_status VARCHAR(64) NOT NULL DEFAULT 'VETTED' CHECK (security_vetting_status IN ('VETTED', 'PENDING_INVESTIGATION', 'INTERIM', 'REVOKED')),
    biometric_hash VARCHAR(128),
    notes TEXT,
    
    -- 1.2.4 Contacto de Emergencia
    emergency_contact_name VARCHAR(255),
    emergency_contact_relation VARCHAR(128),
    emergency_contact_phone VARCHAR(64),
    emergency_contact_address TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_national_id ON user_profiles(national_id_number);
CREATE INDEX IF NOT EXISTS idx_user_profiles_employee_id ON user_profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_department ON user_profiles(department);
CREATE INDEX IF NOT EXISTS idx_user_profiles_vetting ON user_profiles(security_vetting_status);

-- ============================================================================
-- 2. TABLA: EXPEDIENTES Y DOCUMENTOS OFICIALES (MLS)
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    correlative_number VARCHAR(64) UNIQUE NOT NULL,
    type VARCHAR(32) NOT NULL CHECK (type IN ('OFICIO', 'MEMORANDO', 'CIRCULAR', 'RESOLUCION')),
    title VARCHAR(500) NOT NULL,
    subject VARCHAR(500),
    recipient VARCHAR(500) NOT NULL,
    author JSONB NOT NULL, -- { name, role, department }
    confidentiality_level SMALLINT NOT NULL CHECK (confidentiality_level BETWEEN 1 AND 5),
    status VARCHAR(32) NOT NULL DEFAULT 'BORRADOR' CHECK (status IN ('BORRADOR', 'EN_REVISION', 'APROBADO', 'FIRMADO', 'DESPACHADO', 'ARCHIVADO')),
    document_hash CHAR(64) NOT NULL, -- Hash SHA-256 canónico del contenido original
    document_hash512 CHAR(128),
    body TEXT NOT NULL, -- Texto en reposo (enmascarado para nivel >= 3)
    envelope JSONB, -- Sobre criptográfico AES-256-GCM + llaves KEK
    template_snapshot JSONB, -- Diagramación institucional activa al emitir (logos, encabezados, pie)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migración segura si la tabla ya existía previamente
ALTER TABLE documents ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

-- Índices de alto rendimiento
CREATE INDEX IF NOT EXISTS idx_documents_correlative ON documents(correlative_number);
CREATE INDEX IF NOT EXISTS idx_documents_level ON documents(confidentiality_level);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_hash ON documents(document_hash);
CREATE INDEX IF NOT EXISTS idx_documents_envelope_gin ON documents USING GIN (envelope);
CREATE INDEX IF NOT EXISTS idx_documents_author_gin ON documents USING GIN (author);
CREATE INDEX IF NOT EXISTS idx_documents_template_gin ON documents USING GIN (template_snapshot);

-- ============================================================================
-- 2.1 TABLA: FORMATOS, MEMBRETES Y CORRELATIVOS POR DEPARTAMENTO (MLS >= 2)
-- ============================================================================
CREATE TABLE IF NOT EXISTS department_templates (
    id VARCHAR(64) PRIMARY KEY,
    department VARCHAR(255) UNIQUE NOT NULL,
    logo_config JSONB NOT NULL DEFAULT '{}',
    header_config JSONB NOT NULL DEFAULT '{}',
    footer_config JSONB NOT NULL DEFAULT '{}',
    correlative_config JSONB NOT NULL DEFAULT '{}',
    min_clearance_to_edit SMALLINT NOT NULL DEFAULT 2,
    created_by VARCHAR(255) DEFAULT 'SYSTEM',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dept_templates_dept ON department_templates(department);

-- Índice de búsqueda de texto completo en español (Full-Text Search)
CREATE INDEX IF NOT EXISTS idx_documents_fts ON documents USING GIN (to_tsvector('spanish', title || ' ' || COALESCE(subject, '')));

-- ============================================================================
-- 3. TABLA: FIRMAS DIGITALES PKI APLICADAS A DOCUMENTOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id VARCHAR(64) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    signer JSONB NOT NULL, -- { commonName, role, department, clearanceLevel, thumbprint }
    thumbprint CHAR(64) NOT NULL REFERENCES pki_certificates(thumbprint),
    signature_base64 TEXT NOT NULL,
    algorithm VARCHAR(64) NOT NULL DEFAULT 'SHA256withRSA',
    root_ca_trusted BOOLEAN NOT NULL DEFAULT TRUE,
    verified BOOLEAN NOT NULL DEFAULT TRUE,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_signatures_doc_id ON document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_doc_signatures_thumbprint ON document_signatures(thumbprint);

-- ============================================================================
-- 4. TABLA: BLOQUES DEL LIBRO MAYOR INMUTABLE (BLOCKCHAIN)
-- ============================================================================
CREATE TABLE IF NOT EXISTS blockchain_blocks (
    index BIGINT PRIMARY KEY,
    hash CHAR(64) UNIQUE NOT NULL,
    previous_hash CHAR(64) NOT NULL,
    merkle_root CHAR(64) NOT NULL,
    nonce BIGINT NOT NULL,
    validator VARCHAR(128) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blockchain_blocks(hash);
CREATE INDEX IF NOT EXISTS idx_blocks_prev_hash ON blockchain_blocks(previous_hash);

-- ============================================================================
-- 5. TABLA: TRANSACCIONES Y REGISTRO DE AUDITORÍA FORENSE
-- ============================================================================
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    tx_id VARCHAR(64) PRIMARY KEY,
    block_index BIGINT NOT NULL REFERENCES blockchain_blocks(index) ON DELETE RESTRICT,
    type VARCHAR(64) NOT NULL, -- DOCUMENT_AUDIT, DOCUMENT_CREATE, DOCUMENT_SIGN, SECURITY_ACCESS_DENIED, etc.
    document_id VARCHAR(64),
    document_number VARCHAR(64),
    document_hash VARCHAR(128),
    action VARCHAR(128) NOT NULL,
    confidentiality_level SMALLINT DEFAULT 1,
    signer_thumbprint VARCHAR(64),
    operator VARCHAR(255) NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    tx_hash CHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tx_block_index ON blockchain_transactions(block_index);
CREATE INDEX IF NOT EXISTS idx_tx_document_id ON blockchain_transactions(document_id);
CREATE INDEX IF NOT EXISTS idx_tx_type ON blockchain_transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_hash ON blockchain_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_tx_details_gin ON blockchain_transactions USING GIN (details);

-- ============================================================================
-- 6. POLÍTICA DE SEGURIDAD A NIVEL DE FILA (ROW LEVEL SECURITY - RLS)
-- ============================================================================
-- Activar RLS en la tabla de documentos
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Política de Lectura MLS:
-- La sesión debe configurar: SET LOCAL polibio.user_clearance = '4';
-- Si no está configurada, asume Nivel 1 (Público).
DROP POLICY IF EXISTS documents_mls_read_policy ON documents;
CREATE POLICY documents_mls_read_policy ON documents
    FOR SELECT
    USING (
        confidentiality_level <= COALESCE(
            NULLIF(current_setting('polibio.user_clearance', TRUE), '')::SMALLINT, 
            1
        )
    );

-- ============================================================================
-- 7. DISPARADOR (TRIGGER) PARA AUDITORÍA AUTOMÁTICA
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_document_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_documents_updated_at ON documents;
CREATE TRIGGER trg_documents_updated_at
BEFORE UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION trigger_document_update_timestamp();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION trigger_document_update_timestamp();

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW
EXECUTE FUNCTION trigger_document_update_timestamp();

DROP TRIGGER IF EXISTS trg_dept_templates_updated_at ON department_templates;
CREATE TRIGGER trg_dept_templates_updated_at
BEFORE UPDATE ON department_templates
FOR EACH ROW
EXECUTE FUNCTION trigger_document_update_timestamp();

-- ============================================================================
-- 8. DATOS SEMILLA (GENESIS, FUNCIONARIOS OFICIALES & USUARIOS IAM)
-- ============================================================================

-- Usuarios Iniciales del Sistema con Contraseña Soberana Hasheada (PBKDF2-SHA512)
-- Contraseña por defecto: Polibio2026!
INSERT INTO users (id, username, password_hash, salt, clearance_level, role, role_code, status)
VALUES
    ('11111111-1111-1111-1111-111111111111', 'dra.elena', 'cb6a9aaa849aa77549d26b568f4a40c4d95e5b98f3a976c5fe0b8ad3cf65c17fa926f370b6b07286e4015bf7f2aa052ff20adaad37523301afc73210420c62fc', 'polibio_default_seed_salt_2026', 5, 'Directora General de Despacho', 'DIRECTOR', 'ACTIVE'),
    ('22222222-2222-2222-2222-222222222222', 'carlos.mendoza', 'cb6a9aaa849aa77549d26b568f4a40c4d95e5b98f3a976c5fe0b8ad3cf65c17fa926f370b6b07286e4015bf7f2aa052ff20adaad37523301afc73210420c62fc', 'polibio_default_seed_salt_2026', 4, 'Director de Planificación y Presupuesto', 'DIRECTOR', 'ACTIVE'),
    ('33333333-3333-3333-3333-333333333333', 'roberto.gomez', 'cb6a9aaa849aa77549d26b568f4a40c4d95e5b98f3a976c5fe0b8ad3cf65c17fa926f370b6b07286e4015bf7f2aa052ff20adaad37523301afc73210420c62fc', 'polibio_default_seed_salt_2026', 3, 'Consultor Jurídico Adjunto', 'OPERATOR', 'ACTIVE'),
    ('44444444-4444-4444-4444-444444444444', 'mariana.silva', 'cb6a9aaa849aa77549d26b568f4a40c4d95e5b98f3a976c5fe0b8ad3cf65c17fa926f370b6b07286e4015bf7f2aa052ff20adaad37523301afc73210420c62fc', 'polibio_default_seed_salt_2026', 2, 'Asistente Administrativo', 'OPERATOR', 'ACTIVE'),
    ('55555555-5555-5555-5555-555555555555', 'ciudadano.publico', 'cb6a9aaa849aa77549d26b568f4a40c4d95e5b98f3a976c5fe0b8ad3cf65c17fa926f370b6b07286e4015bf7f2aa052ff20adaad37523301afc73210420c62fc', 'polibio_default_seed_salt_2026', 1, 'Acceso Público General', 'CITIZEN', 'ACTIVE')
ON CONFLICT (username) DO NOTHING;

-- Perfiles Institucionales Detallados de los Usuarios Semilla
INSERT INTO user_profiles (
    user_id, first_name, second_name, last_name, second_last_name,
    national_id_type, national_id_number, tax_id, birth_date, place_of_birth, nationality,
    gender, blood_type, marital_status,
    official_email, personal_email, phone_primary, phone_secondary,
    residential_address, city, state_province, postal_code, country,
    employee_id, department, division_unit, rank_grade, position_title, supervisor_name, hiring_date,
    security_clearance_code, security_vetting_status, notes,
    emergency_contact_name, emergency_contact_relation, emergency_contact_phone, emergency_contact_address
) VALUES
(
    '11111111-1111-1111-1111-111111111111', 'Elena', 'Patricia', 'Vasquez', 'Morales',
    'V', '14.892.301', 'J-14892301-0', '1980-04-12', 'Caracas', 'Venezolana',
    'FEMENINO', 'O+', 'CASADO',
    'elena.vasquez@polibio.gob', 'elena.vasquez.p@gmail.com', '+58-412-555-0101', '+58-212-999-1122',
    'Av. Ppal de El Bosque, Res. Los Samanes, Apto 8-B', 'Caracas', 'Distrito Capital', '1050', 'Venezuela',
    'POL-EMP-001', 'Dirección Superior', 'Despacho Ministerial', 'Grado V - Alto Funcionario', 'Directora General de Despacho', 'Ministro del Poder Popular', '2019-01-15',
    'SEC-CLR-LEVEL5-ALPHA', 'VETTED', 'Habilitación de Secreto de Estado aprobada por Inspectoría General y Criptografía Soberana.',
    'Alejandro Gomez Vasquez', 'Cónyuge', '+58-414-998-3321', 'Misma dirección residencial'
),
(
    '22222222-2222-2222-2222-222222222222', 'Carlos', 'Alberto', 'Mendoza', 'Rivas',
    'V', '16.340.812', 'J-16340812-3', '1983-09-24', 'Maracay', 'Venezolana',
    'MASCULINO', 'A+', 'CASADO',
    'carlos.mendoza@polibio.gob', 'carlos.mendoza.r@gmail.com', '+58-414-555-0202', '+58-212-999-3344',
    'Urb. Las Mercedes, Calle París, Edif. Torreón, PH-1', 'Caracas', 'Miranda', '1060', 'Venezuela',
    'POL-EMP-002', 'Planificación', 'Dirección de Presupuesto y Proyectos', 'Grado IV - Especialista Principal', 'Director de Planificación y Presupuesto', 'Dra. Elena Vasquez', '2020-03-01',
    'SEC-CLR-LEVEL4-BETA', 'VETTED', 'Autorizado para gestión de presupuestos estratégicos y partidas confidenciales.',
    'Mariana Rivas de Mendoza', 'Madre', '+58-412-777-6655', 'Av. Bolivar, Res. Central, Maracay'
),
(
    '33333333-3333-3333-3333-333333333333', 'Roberto', 'Ignacio', 'Gomez', 'Salazar',
    'V', '19.123.456', 'J-19123456-1', '1987-11-05', 'Valencia', 'Venezolana',
    'MASCULINO', 'O-', 'SOLTERO',
    'roberto.gomez@polibio.gob', 'roberto.gomez.jur@gmail.com', '+58-416-555-0303', NULL,
    'Colinas de Bello Monte, Av. Leonardo da Vinci, Qta. Esperanza', 'Caracas', 'Miranda', '1050', 'Venezuela',
    'POL-EMP-003', 'Consultoría Jurídica', 'Dictámenes y Contratos de Estado', 'Grado III - Consultor Especializado', 'Consultor Jurídico Adjunto', 'Dra. Elena Vasquez', '2021-06-10',
    'SEC-CLR-LEVEL3-GAMMA', 'VETTED', 'Habilitación reservada para dictámenes legales vinculantes y revisiones normativas.',
    'Ignacio Gomez', 'Padre', '+58-424-333-4411', 'Calle Los Sauces, Valencia, Carabobo'
),
(
    '44444444-4444-4444-4444-444444444444', 'Mariana', 'Beatriz', 'Silva', 'Perez',
    'V', '22.987.654', 'J-22987654-7', '1993-02-18', 'Los Teques', 'Venezolana',
    'FEMENINO', 'B+', 'SOLTERO',
    'mariana.silva@polibio.gob', 'mariana.silva.adm@gmail.com', '+58-424-555-0404', NULL,
    'Av. Victoria, Conjunto Residencial Los Próceres, Torre 2, Apto 4-A', 'Caracas', 'Distrito Capital', '1010', 'Venezuela',
    'POL-EMP-004', 'Administración General', 'Gestión Documental y Correspondencia', 'Grado II - Analista Superior', 'Asistente Administrativo', 'Lic. Carlos Mendoza', '2022-09-01',
    'SEC-CLR-LEVEL2-INTERNO', 'VETTED', 'Acceso operativo interno para trámites ordinarios y gestión de expedientes.',
    'Beatriz Perez de Silva', 'Madre', '+58-416-222-1188', 'Av. Independencia, Los Teques'
),
(
    '55555555-5555-5555-5555-555555555555', 'Juan', 'Bautista', 'Ciudadano', 'Demostración',
    'V', '25.000.001', 'V-25000001-0', '1998-07-01', 'Barquisimeto', 'Venezolana',
    'MASCULINO', 'O+', 'SOLTERO',
    'ciudadano@polibio.gob', 'ciudadano.demo@gmail.com', '+58-412-555-0505', NULL,
    'Sector Centro, Calle 23 con Carrera 18', 'Barquisimeto', 'Lara', '3001', 'Venezuela',
    'POL-EMP-005', 'Atención al Ciudadano', 'Ventanilla Única de Trámites Públicos', 'Grado I - Atención Pública', 'Acceso Público General', 'Coordinador de Taquilla', '2023-01-10',
    'SEC-CLR-LEVEL1-PUB', 'VETTED', 'Habilitación de consulta pública, verificación de cotejo y trámites abiertos.',
    'Maria Elena Ciudadano', 'Hermana', '+58-424-111-2233', 'Misma dirección residencial'
)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- 8. DATOS SEMILLA (GENESIS & FUNCIONARIOS OFICIALES)
-- ============================================================================

-- Bloque Génesis
INSERT INTO blockchain_blocks (index, hash, previous_hash, merkle_root, nonce, validator, timestamp)
VALUES (
    0,
    '0000000000000000000000000000000000000000000000000000000000000000',
    '0000000000000000000000000000000000000000000000000000000000000000',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    0,
    'Polibio-Node-Sovereign-01',
    '2026-01-01T00:00:00.000Z'
) ON CONFLICT (index) DO NOTHING;

-- Transacción Génesis
INSERT INTO blockchain_transactions (tx_id, block_index, type, document_id, document_number, action, operator, details, tx_hash, timestamp)
VALUES (
    'TX-GENESIS-00000000',
    0,
    'GENESIS_INITIALIZATION',
    'SYSTEM-ROOT',
    'GENESIS',
    'INITIALIZE_SOVEREIGN_LEDGER',
    'ROOT_SECURITY_OFFICER',
    '{"system": "Polibio Enterprise Sovereign Blockchain", "consensus": "PoA"}',
    '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    '2026-01-01T00:00:00.000Z'
) ON CONFLICT (tx_id) DO NOTHING;

COMMENT ON TABLE documents IS 'Repositorio oficial de documentos y oficios de Estado con clasificación MLS';
COMMENT ON TABLE blockchain_blocks IS 'Libro mayor inmutable permisionado con consenso criptográfico PoA';
COMMENT ON TABLE pki_certificates IS 'Certificados digitales de funcionarios emitidos por la Polibio Sovereign Root CA';
COMMENT ON TABLE users IS 'Directorio de identidades institucionales y credenciales criptográficas con control de acceso MLS';
COMMENT ON TABLE user_profiles IS 'Ficha integral de datos personales, registro civil, habilitación de seguridad y contactos de emergencia';

