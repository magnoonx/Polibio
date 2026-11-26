// Unit Test for Departmental Templates and Autoincremental Correlatives
const assert = require('assert');
const templateManager = require('./services/doc-service/template-manager');

console.log('========================================================================');
console.log('🧪 PRUEBAS UNITARIAS: DIAGRAMACIÓN, MEMBRETES Y CORRELATIVOS AUTOINCREMENTALES');
console.log('========================================================================\n');

// 1. Initialize
templateManager.init();

// Test 1: Logos Catalog
console.log('[Test 1] Verificando catálogo oficial de logos y sellos institucionales...');
const logos = templateManager.getLogosCatalog();
assert(logos.ESCUDO_NACIONAL, 'Falta ESCUDO_NACIONAL');
assert(logos.POLIBIO_SHIELD, 'Falta POLIBIO_SHIELD');
assert(logos.GOBIERNO_DIGITAL, 'Falta GOBIERNO_DIGITAL');
console.log('  ✓ Catálogo de logos validado (3 logos soberanos registrados).\n');

// Test 2: Seed Templates
console.log('[Test 2] Verificando plantillas departamentales sembradas...');
const templates = templateManager.listDepartmentTemplates();
assert(templates.length >= 5, 'Debe haber al menos 5 departamentos configurados');
const depts = templates.map(t => t.department);
console.log('  Departamentos disponibles:', depts.join(', '));
assert(depts.includes('Dirección Superior'));
assert(depts.includes('Planificación'));
assert(depts.includes('Consultoría Jurídica'));
assert(depts.includes('Administración General'));
console.log('  ✓ Plantillas departamentales verificadas.\n');

// Test 3: Clearance Level Security (MLS >= 2)
console.log('[Test 3] Verificando restricción MLS: Solo usuarios Nivel >= 2 pueden modificar formato...');
let blocked = false;
try {
  templateManager.updateDepartmentTemplate({
    department: 'Planificación',
    logoConfig: { placement: 'CENTER' }
  }, 1, 'Ciudadano Infiltrado');
} catch (err) {
  if (err.status === 403) {
    blocked = true;
  }
}
assert(blocked, 'FALLO: Usuario Nivel 1 debió ser rechazado con 403!');
console.log('  ✓ Nivel 1 (Ciudadano) bloqueado con HTTP 403 (Bell-LaPadula enforce).\n');

// Test 4: Authorized Modification (Clearance >= 2)
console.log('[Test 4] Modificando diagramación y prefijo de correlativo por usuario autorizado (Nivel 2)...');
const currentYear = new Date().getFullYear();
const updated = templateManager.updateDepartmentTemplate({
  department: 'Planificación',
  logoConfig: {
    placement: 'SPLIT',
    primaryLogo: 'ESCUDO_NACIONAL',
    secondaryLogo: 'GOBIERNO_DIGITAL',
    logoSize: 'LARGE'
  },
  headerConfig: {
    line1: 'REPÚBLICA BOLIVARIANA DE VENEZUELA',
    line2: 'MINISTERIO DE PLANIFICACIÓN ESTRATÉGICA',
    line3: 'DIRECCIÓN DE INFRAESTRUCTURA Y DATOS',
    dividerStyle: 'TRICOLOR'
  },
  correlativeConfig: {
    prefixPattern: `OF-${currentYear}-PLAN-INFRA-`,
    paddingDigits: 3,
    currentSequence: 49
  }
}, 2, 'Lic. Mariana Silva (Nivel 2)');

assert.strictEqual(updated.logoConfig.placement, 'SPLIT');
assert.strictEqual(updated.logoConfig.logoSize, 'LARGE');
assert.strictEqual(updated.headerConfig.dividerStyle, 'TRICOLOR');
assert.strictEqual(updated.correlativeConfig.prefixPattern, `OF-${currentYear}-PLAN-INFRA-`);
console.log('  ✓ Diagramación y correlativo actualizado exitosamente por usuario Nivel 2.\n');

// Test 5: Correlative Autoincrement Tail
console.log('[Test 5] Verificando autoincremento de los últimos dígitos (2 o 3 dígitos)...');
// Next correlative without allocation (preview)
const preview1 = templateManager.generateNextCorrelative({
  docType: 'OFICIO',
  department: 'Planificación',
  customPrefix: `OF-${currentYear}-PLAN-INFRA-`,
  paddingDigits: 3,
  allocate: false
});
console.log('  Previsualización (sin reservar):', preview1.fullCorrelative);
assert.strictEqual(preview1.fullCorrelative, `OF-${currentYear}-PLAN-INFRA-049`);

// Allocate 1st
const alloc1 = templateManager.generateNextCorrelative({
  docType: 'OFICIO',
  department: 'Planificación',
  customPrefix: `OF-${currentYear}-PLAN-INFRA-`,
  paddingDigits: 3,
  allocate: true
});
console.log('  Asignación 1:', alloc1.fullCorrelative);
assert.strictEqual(alloc1.fullCorrelative, `OF-${currentYear}-PLAN-INFRA-050`);

// Allocate 2nd
const alloc2 = templateManager.generateNextCorrelative({
  docType: 'OFICIO',
  department: 'Planificación',
  customPrefix: `OF-${currentYear}-PLAN-INFRA-`,
  paddingDigits: 3,
  allocate: true
});
console.log('  Asignación 2:', alloc2.fullCorrelative);
assert.strictEqual(alloc2.fullCorrelative, `OF-${currentYear}-PLAN-INFRA-051`);

// Test 2-digit padding
const alloc2Digit = templateManager.generateNextCorrelative({
  docType: 'MEMORANDO',
  department: 'Administración General',
  customPrefix: `MEM-${currentYear}-ADM-`,
  paddingDigits: 2,
  allocate: true
});
console.log('  Asignación con 2 dígitos:', alloc2Digit.fullCorrelative);
assert(alloc2Digit.fullCorrelative.match(/MEM-\d{4}-ADM-\d{2}$/), 'Debe terminar en 2 dígitos autoincrementales');

console.log('\n========================================================================');
console.log('✅ TODAS LAS PRUEBAS UNITARIAS DE TEMPLATES Y CORRELATIVOS PASARON (5/5)');
console.log('========================================================================');

