// Polibio Departmental Template & Dynamic Autoincremental Correlative Manager
// Allows authorized officials (Clearance Level >= 2) to diagram logos, headers, footers and correlatives per department
const fs = require('fs');
const path = require('path');
const pg = require('../shared/postgres-adapter');

const DATA_DIR = path.join(__dirname, '../../data/documents');
const TEMPLATES_FILE = path.join(DATA_DIR, 'department_templates.json');
const SEQUENCES_FILE = path.join(DATA_DIR, 'correlative_sequences.json');

// In-Memory Storage
const templatesByDept = new Map();
const correlativeSequences = new Map(); // Map<prefix, currentCounter>

// Official Logos SVG / Predefined Presets
const OFFICIAL_LOGOS = {
  ESCUDO_NACIONAL: {
    id: 'ESCUDO_NACIONAL',
    name: 'Escudo Nacional Soberano',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full"><path d="M50 5 L88 22 L82 70 Q50 95 50 95 Q50 95 18 70 L12 22 Z" fill="#0f2942" stroke="#eab308" stroke-width="2.5"/><path d="M50 5 L50 95" stroke="#eab308" stroke-width="1.5"/><circle cx="50" cy="50" r="18" fill="none" stroke="#22c55e" stroke-width="2"/><path d="M35 30 L65 70 M65 30 L35 70" stroke="#ef4444" stroke-width="1.5"/><circle cx="50" cy="20" r="5" fill="#eab308"/></svg>`
  },
  POLIBIO_SHIELD: {
    id: 'POLIBIO_SHIELD',
    name: 'Sello Criptográfico Polibio',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full"><polygon points="50,6 90,26 90,74 50,94 10,74 10,26" fill="#06121e" stroke="#10b981" stroke-width="3"/><circle cx="50" cy="50" r="22" fill="#0f2027" stroke="#38bdf8" stroke-width="2"/><path d="M50 34 L50 66 M34 50 L66 50" stroke="#10b981" stroke-width="2.5"/><circle cx="50" cy="50" r="6" fill="#10b981"/></svg>`
  },
  GOBIERNO_DIGITAL: {
    id: 'GOBIERNO_DIGITAL',
    name: 'República Digital Institucional',
    svg: `<svg viewBox="0 0 100 100" class="w-full h-full"><rect x="15" y="15" width="70" height="70" rx="16" fill="#0d1b2a" stroke="#38bdf8" stroke-width="3"/><path d="M28 50 L42 64 L72 34" fill="none" stroke="#22c55e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  }
};

function getSeedTemplates() {
  const currentYear = new Date().getFullYear();

  return [
    {
      id: 'tpl-direccion-superior',
      department: 'Dirección Superior',
      logoConfig: {
        placement: 'SPLIT', // LEFT, CENTER, RIGHT, SPLIT
        primaryLogo: 'ESCUDO_NACIONAL',
        secondaryLogo: 'POLIBIO_SHIELD',
        logoSize: 'MEDIUM', // SMALL (40px), MEDIUM (56px), LARGE (72px)
        customPrimaryUrl: '',
        customSecondaryUrl: ''
      },
      headerConfig: {
        line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
        line2: 'DESPACHO DE LA DIRECCIÓN SUPERIOR',
        line3: 'SECRETARÍA GENERAL DE GOBIERNO',
        line4: 'Despacho de la Directora General',
        dividerStyle: 'TRICOLOR', // TRICOLOR, DOUBLE, SOLID, NONE
        fontFamily: 'PLUS_JAKARTA'
      },
      footerConfig: {
        motto: `${currentYear}: Año de la Soberanía Tecnológica, Independencia y Criptografía de Estado`,
        address: 'Palacio de Gobierno, Av. Urdaneta, Esq. Bolero, Caracas • Distrito Capital',
        contactInfo: 'Tel: +58-212-555-0100 • Correo: despacho@polibio.gob • Gaceta Oficial N° 42.980',
        showPageNumber: true
      },
      correlativeConfig: {
        prefixPattern: `OF-${currentYear}-DIRSUP-`,
        paddingDigits: 3, // Últimos 2 o 3 dígitos autoincrementales
        currentSequence: 104,
        typeOverrides: {
          OFICIO: `OF-${currentYear}-DIRSUP-`,
          MEMORANDO: `MEM-${currentYear}-DIRSUP-`,
          CIRCULAR: `CIR-${currentYear}-DIRSUP-`,
          RESOLUCION: `RES-${currentYear}-DIRSUP-`
        }
      },
      minClearanceToEdit: 2,
      updatedBy: 'Dra. Elena Vasquez',
      updatedAt: '2026-01-15T08:00:00.000Z'
    },
    {
      id: 'tpl-planificacion',
      department: 'Planificación',
      logoConfig: {
        placement: 'LEFT',
        primaryLogo: 'ESCUDO_NACIONAL',
        secondaryLogo: '',
        logoSize: 'MEDIUM',
        customPrimaryUrl: '',
        customSecondaryUrl: ''
      },
      headerConfig: {
        line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
        line2: 'MINISTERIO DEL PODER POPULAR PARA LA PLANIFICACIÓN',
        line3: 'DIRECCIÓN GENERAL DE PRESUPUESTO Y PROYECTOS ESTRATÉGICOS',
        line4: 'Dirección de Coordinación Presupuestaria',
        dividerStyle: 'DOUBLE',
        fontFamily: 'PLUS_JAKARTA'
      },
      footerConfig: {
        motto: `${currentYear}: Planificación Soberana y Desarrollo Integral de la Nación`,
        address: 'Torre Ministerial de Planificación, Av. Este 6, Esq. Camejo, Piso 8, Caracas',
        contactInfo: 'Tel: +58-212-555-0200 • presupuestos@polibio.gob • www.polibio.gob',
        showPageNumber: true
      },
      correlativeConfig: {
        prefixPattern: `OF-${currentYear}-PLAN-`,
        paddingDigits: 3,
        currentSequence: 58,
        typeOverrides: {
          OFICIO: `OF-${currentYear}-PLAN-`,
          MEMORANDO: `MEM-${currentYear}-PLAN-`,
          CIRCULAR: `CIR-${currentYear}-PLAN-`,
          RESOLUCION: `RES-${currentYear}-PLAN-`
        }
      },
      minClearanceToEdit: 2,
      updatedBy: 'Lic. Carlos Mendoza',
      updatedAt: '2026-03-01T09:00:00.000Z'
    },
    {
      id: 'tpl-consultoria-juridica',
      department: 'Consultoría Jurídica',
      logoConfig: {
        placement: 'CENTER',
        primaryLogo: 'ESCUDO_NACIONAL',
        secondaryLogo: '',
        logoSize: 'MEDIUM',
        customPrimaryUrl: '',
        customSecondaryUrl: ''
      },
      headerConfig: {
        line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
        line2: 'CONSULTORÍA JURÍDICA GENERAL DEL ESTADO',
        line3: 'DIRECCIÓN DE DICTÁMENES, DECRETOS Y CONTRATOS PÚBLICOS',
        line4: 'Despacho del Consultor Adjunto',
        dividerStyle: 'SOLID',
        fontFamily: 'SERIF_OFFICIAL'
      },
      footerConfig: {
        motto: `${currentYear}: En estricta primacía constitucional y legalidad administrativa`,
        address: 'Edif. Central de Consultoría, Calle Ppal. de El Silencio, Piso 4, Caracas',
        contactInfo: 'Tel: +58-212-555-0300 • juridico@polibio.gob • Gaceta Oficial',
        showPageNumber: true
      },
      correlativeConfig: {
        prefixPattern: `DICT-${currentYear}-CJ-`,
        paddingDigits: 3,
        currentSequence: 12,
        typeOverrides: {
          OFICIO: `OF-${currentYear}-CJ-`,
          MEMORANDO: `MEM-${currentYear}-CJ-`,
          CIRCULAR: `CIR-${currentYear}-CJ-`,
          RESOLUCION: `RES-${currentYear}-CJ-`
        }
      },
      minClearanceToEdit: 2,
      updatedBy: 'Abg. Roberto Gomez',
      updatedAt: '2026-06-10T10:00:00.000Z'
    },
    {
      id: 'tpl-administracion-general',
      department: 'Administración General',
      logoConfig: {
        placement: 'LEFT',
        primaryLogo: 'POLIBIO_SHIELD',
        secondaryLogo: '',
        logoSize: 'SMALL',
        customPrimaryUrl: '',
        customSecondaryUrl: ''
      },
      headerConfig: {
        line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
        line2: 'DIRECCIÓN GENERAL DE ADMINISTRACIÓN Y SERVICIOS',
        line3: 'DIVISIÓN DE GESTIÓN DOCUMENTAL, ARCHIVO Y CORRESPONDENCIA',
        line4: 'Unidad de Correspondencia Oficial',
        dividerStyle: 'SOLID',
        fontFamily: 'PLUS_JAKARTA'
      },
      footerConfig: {
        motto: `${currentYear}: Eficacia, Transparencia y Servicio Público Institucional`,
        address: 'Edif. Administrativo Central, Av. Urdaneta, Piso 2, Caracas',
        contactInfo: 'Tel: +58-212-555-0400 • correspondencia@polibio.gob',
        showPageNumber: true
      },
      correlativeConfig: {
        prefixPattern: `MEM-${currentYear}-ADM-`,
        paddingDigits: 2, // 2 dígitos: 01, 02...
        currentSequence: 34,
        typeOverrides: {
          OFICIO: `OF-${currentYear}-ADM-`,
          MEMORANDO: `MEM-${currentYear}-ADM-`,
          CIRCULAR: `CIR-${currentYear}-ADM-`,
          RESOLUCION: `RES-${currentYear}-ADM-`
        }
      },
      minClearanceToEdit: 2,
      updatedBy: 'Lic. Mariana Silva',
      updatedAt: '2026-09-01T11:00:00.000Z'
    },
    {
      id: 'tpl-atencion-al-ciudadano',
      department: 'Atención al Ciudadano',
      logoConfig: {
        placement: 'CENTER',
        primaryLogo: 'GOBIERNO_DIGITAL',
        secondaryLogo: '',
        logoSize: 'MEDIUM',
        customPrimaryUrl: '',
        customSecondaryUrl: ''
      },
      headerConfig: {
        line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
        line2: 'OFICINA DE ATENCIÓN AL CIUDADANO Y PARTICIPACIÓN POPULAR',
        line3: 'VENTANILLA ÚNICA DE TRÁMITES Y ATENCIÓN PÚBLICA',
        line4: 'Taquilla Digital de Notificaciones',
        dividerStyle: 'TRICOLOR',
        fontFamily: 'PLUS_JAKARTA'
      },
      footerConfig: {
        motto: `${currentYear}: Participación Soberana y Gobierno Digital al Servicio del Pueblo`,
        address: 'Planta Baja, Edif. Sede Central, Av. Universidad, Caracas',
        contactInfo: 'Línea Gratuita: 0800-POLIBIO (7654246) • atencion@polibio.gob',
        showPageNumber: true
      },
      correlativeConfig: {
        prefixPattern: `OAC-${currentYear}-PUB-`,
        paddingDigits: 3,
        currentSequence: 1,
        typeOverrides: {
          OFICIO: `OF-${currentYear}-OAC-`,
          MEMORANDO: `MEM-${currentYear}-OAC-`,
          CIRCULAR: `CIR-${currentYear}-OAC-`,
          RESOLUCION: `RES-${currentYear}-OAC-`
        }
      },
      minClearanceToEdit: 2,
      updatedBy: 'SYSTEM',
      updatedAt: '2026-01-10T12:00:00.000Z'
    }
  ];
}

// Initialize templates and sequences from disk/DB
function init() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. Load Templates
  let templatesList = [];
  if (fs.existsSync(TEMPLATES_FILE)) {
    try {
      templatesList = JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf8'));
    } catch (e) {
      templatesList = getSeedTemplates();
    }
  } else {
    templatesList = getSeedTemplates();
  }

  templatesList.forEach(tpl => {
    templatesByDept.set(tpl.department.toLowerCase(), tpl);
  });
  saveTemplatesState();

  // 2. Load Sequences
  if (fs.existsSync(SEQUENCES_FILE)) {
    try {
      const seqData = JSON.parse(fs.readFileSync(SEQUENCES_FILE, 'utf8'));
      for (const [pfx, val] of Object.entries(seqData)) {
        correlativeSequences.set(pfx, val);
      }
    } catch (e) {}
  }

  // Ensure initial department prefixes have their counters registered
  templatesList.forEach(tpl => {
    const cfg = tpl.correlativeConfig || {};
    if (cfg.prefixPattern && !correlativeSequences.has(cfg.prefixPattern)) {
      correlativeSequences.set(cfg.prefixPattern, cfg.currentSequence || 1);
    }
    if (cfg.typeOverrides) {
      for (const pfx of Object.values(cfg.typeOverrides)) {
        if (!correlativeSequences.has(pfx)) {
          correlativeSequences.set(pfx, cfg.currentSequence || 1);
        }
      }
    }
  });

  saveSequencesState();
}

function saveTemplatesState() {
  try {
    const list = Array.from(templatesByDept.values());
    fs.writeFileSync(TEMPLATES_FILE, JSON.stringify(list, null, 2));

    // Async sync to PostgreSQL if connected
    if (pg.isConfigured()) {
      syncTemplatesToPostgres(list).catch(() => {});
    }
  } catch (e) {
    console.error('[Template-Manager] Error guardando plantillas:', e.message);
  }
}

async function syncTemplatesToPostgres(list) {
  for (const t of list) {
    try {
      await pg.query(
        `INSERT INTO department_templates (id, department, logo_config, header_config, footer_config, correlative_config, min_clearance_to_edit, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (department) DO UPDATE SET
           logo_config = EXCLUDED.logo_config,
           header_config = EXCLUDED.header_config,
           footer_config = EXCLUDED.footer_config,
           correlative_config = EXCLUDED.correlative_config,
           updated_at = NOW()`,
        [t.id, t.department, JSON.stringify(t.logoConfig), JSON.stringify(t.headerConfig), JSON.stringify(t.footerConfig), JSON.stringify(t.correlativeConfig), t.minClearanceToEdit || 2, t.updatedBy || 'SYSTEM']
      );
    } catch (e) {}
  }
}

function saveSequencesState() {
  try {
    const obj = {};
    for (const [k, v] of correlativeSequences.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(SEQUENCES_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error('[Template-Manager] Error guardando secuencias:', e.message);
  }
}

// Get template for department (with fallback to default)
function getTemplateForDepartment(deptName) {
  if (deptName) {
    const key = deptName.trim().toLowerCase();
    if (templatesByDept.has(key)) {
      return templatesByDept.get(key);
    }
    // Partial search
    for (const [k, tpl] of templatesByDept.entries()) {
      if (key.includes(k) || k.includes(key)) {
        return tpl;
      }
    }
  }

  // Baseline fallback template
  return templatesByDept.get('dirección superior') || Array.from(templatesByDept.values())[0];
}

// Generate next dynamic autoincremental correlative
// Prefix (first characters) is customizable by user/department.
// Tail (last 2 or 3 digits) is automatically incremented.
function generateNextCorrelative({ docType = 'OFICIO', department, customPrefix, paddingDigits = 3, allocate = false }) {
  const tpl = getTemplateForDepartment(department);
  const cfg = tpl.correlativeConfig || {};

  // Determine prefix: custom prefix if provided, else department type override, else prefix pattern
  let prefix = (customPrefix || '').trim();
  if (!prefix) {
    if (cfg.typeOverrides && cfg.typeOverrides[docType]) {
      prefix = cfg.typeOverrides[docType];
    } else if (cfg.prefixPattern) {
      prefix = cfg.prefixPattern;
    } else {
      const year = new Date().getFullYear();
      prefix = `${docType.substring(0, 3)}-${year}-POL-`;
    }
  }

  // Ensure prefix ends cleanly with hyphen or slash
  if (!prefix.endsWith('-') && !prefix.endsWith('/') && !prefix.endsWith('.')) {
    prefix += '-';
  }

  // Determine digits: 2, 3, or 4
  const digits = parseInt(paddingDigits, 10) || cfg.paddingDigits || 3;

  // Retrieve current sequence counter for this prefix
  let currentVal = correlativeSequences.get(prefix);
  if (currentVal === undefined) {
    currentVal = cfg.currentSequence || 1;
    correlativeSequences.set(prefix, currentVal);
  }

  if (allocate) {
    currentVal += 1;
    correlativeSequences.set(prefix, currentVal);
    // Also update template counter if it matches prefix
    if (cfg.prefixPattern === prefix) {
      cfg.currentSequence = currentVal;
    }
    saveSequencesState();
    saveTemplatesState();
  }

  const numStr = String(currentVal).padStart(digits, '0');
  const fullCorrelative = `${prefix}${numStr}`;

  return {
    fullCorrelative,
    prefix,
    sequenceNumber: currentVal,
    digits,
    department: tpl.department,
    allocated: allocate
  };
}

// Save or Update Department Template (Enforces Clearance >= 2)
function updateDepartmentTemplate(templateData, userClearance = 1, operator = 'OFICIAL') {
  const clearance = parseInt(userClearance, 10) || 1;
  if (clearance < 2) {
    const err = new Error('Acceso Denegado por Política MLS: Se requiere nivel de habilitación Nivel 2 (Uso Interno) o superior para modificar diagramación de formatos o correlativos departamentales.');
    err.status = 403;
    throw err;
  }

  const data = templateData.templateData || templateData;
  const dept = (templateData.department || data.department || '').trim();
  if (!dept) {
    throw new Error('Debe especificar el departamento o dirección institucional a configurar.');
  }

  const key = dept.toLowerCase();
  const existing = templatesByDept.get(key) || {
    id: `tpl-${Date.now().toString(16)}`,
    department: dept,
    minClearanceToEdit: 2
  };

  const updated = {
    ...existing,
    department: dept,
    logoConfig: {
      placement: data.logoConfig?.placement || existing.logoConfig?.placement || 'LEFT',
      primaryLogo: data.logoConfig?.primaryLogo || existing.logoConfig?.primaryLogo || 'ESCUDO_NACIONAL',
      secondaryLogo: data.logoConfig?.secondaryLogo ?? existing.logoConfig?.secondaryLogo ?? '',
      logoSize: data.logoConfig?.logoSize || existing.logoConfig?.logoSize || 'MEDIUM',
      customPrimaryUrl: data.logoConfig?.customPrimaryUrl !== undefined ? data.logoConfig.customPrimaryUrl : (existing.logoConfig?.customPrimaryUrl || ''),
      customSecondaryUrl: data.logoConfig?.customSecondaryUrl !== undefined ? data.logoConfig.customSecondaryUrl : (existing.logoConfig?.customSecondaryUrl || '')
    },
    headerConfig: {
      line1: data.headerConfig?.line1 || existing.headerConfig?.line1 || 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
      line2: data.headerConfig?.line2 || existing.headerConfig?.line2 || '',
      line3: data.headerConfig?.line3 || existing.headerConfig?.line3 || dept.toUpperCase(),
      line4: data.headerConfig?.line4 || existing.headerConfig?.line4 || '',
      dividerStyle: data.headerConfig?.dividerStyle || existing.headerConfig?.dividerStyle || 'TRICOLOR',
      fontFamily: data.headerConfig?.fontFamily || existing.headerConfig?.fontFamily || 'PLUS_JAKARTA'
    },
    footerConfig: {
      motto: data.footerConfig?.motto || existing.footerConfig?.motto || '',
      address: data.footerConfig?.address || existing.footerConfig?.address || '',
      contactInfo: data.footerConfig?.contactInfo || existing.footerConfig?.contactInfo || '',
      showPageNumber: data.footerConfig?.showPageNumber !== false
    },
    correlativeConfig: {
      prefixPattern: (data.correlativeConfig?.prefixPattern || existing.correlativeConfig?.prefixPattern || `OF-${new Date().getFullYear()}-${dept.substring(0, 4).toUpperCase()}-`).trim(),
      paddingDigits: parseInt(data.correlativeConfig?.paddingDigits, 10) || existing.correlativeConfig?.paddingDigits || 3,
      currentSequence: parseInt(data.correlativeConfig?.currentSequence, 10) || existing.correlativeConfig?.currentSequence || 1,
      typeOverrides: data.correlativeConfig?.typeOverrides || existing.correlativeConfig?.typeOverrides || {}
    },
    updatedBy: operator,
    updatedAt: new Date().toISOString()
  };

  // Register prefix in sequences map if currentSequence changed
  if (updated.correlativeConfig.prefixPattern) {
    correlativeSequences.set(updated.correlativeConfig.prefixPattern, updated.correlativeConfig.currentSequence);
    saveSequencesState();
  }

  templatesByDept.set(key, updated);
  saveTemplatesState();

  return updated;
}

// List all templates
function listDepartmentTemplates() {
  return Array.from(templatesByDept.values());
}

// Predefined official logos catalog
function getLogosCatalog() {
  return OFFICIAL_LOGOS;
}

module.exports = {
  init,
  getTemplateForDepartment,
  updateDepartmentTemplate,
  listDepartmentTemplates,
  generateNextCorrelative,
  getLogosCatalog
};

