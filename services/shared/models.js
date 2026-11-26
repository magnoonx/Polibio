// Polibio Shared Models & Enums
const CONFIDENTIALITY_LEVELS = {
  1: {
    id: 1,
    code: 'PUBLICO',
    name: 'Nivel 1: Público',
    description: 'Acceso irrestricto a personal autorizado y ciudadanía.',
    badgeClass: 'badge-public',
    requiresEncryption: false,
    auditLevel: 'STANDARD'
  },
  2: {
    id: 2,
    code: 'INTERNO',
    name: 'Nivel 2: Uso Interno',
    description: 'Circulación exclusiva dentro de la entidad gubernamental.',
    badgeClass: 'badge-internal',
    requiresEncryption: false,
    auditLevel: 'STANDARD'
  },
  3: {
    id: 3,
    code: 'RESERVADO',
    name: 'Nivel 3: Reservado',
    description: 'Restringido a direcciones y unidades de competencia específica.',
    badgeClass: 'badge-reserved',
    requiresEncryption: true,
    auditLevel: 'ELEVATED'
  },
  4: {
    id: 4,
    code: 'CONFIDENCIAL',
    name: 'Nivel 4: Confidencial',
    description: 'Información sensible. Requiere certificado digital personal para descifrado.',
    badgeClass: 'badge-confidential',
    requiresEncryption: true,
    auditLevel: 'STRICT'
  },
  5: {
    id: 5,
    code: 'SECRETO',
    name: 'Nivel 5: Secreto de Estado',
    description: 'Máxima clasificación. Cifrado de sobre AES-256-GCM y auditoría obligatoria en blockchain.',
    badgeClass: 'badge-secret',
    requiresEncryption: true,
    auditLevel: 'MAXIMUM_IMMUTABLE'
  }
};

const DOCUMENT_TYPES = {
  OFICIO: { code: 'OF', name: 'Oficio Institucional', prefix: 'OF' },
  MEMORANDO: { code: 'MEM', name: 'Memorando Interno', prefix: 'MEM' },
  CIRCULAR: { code: 'CIR', name: 'Circular General', prefix: 'CIR' },
  RESOLUCION: { code: 'RES', name: 'Resolución Oficial', prefix: 'RES' }
};

const DOCUMENT_STATUS = {
  BORRADOR: 'BORRADOR',
  EN_REVISION: 'EN_REVISION',
  APROBADO: 'APROBADO',
  FIRMADO: 'FIRMADO',
  DESPACHADO: 'DESPACHADO',
  ARCHIVADO: 'ARCHIVADO'
};

module.exports = {
  CONFIDENTIALITY_LEVELS,
  DOCUMENT_TYPES,
  DOCUMENT_STATUS
};

