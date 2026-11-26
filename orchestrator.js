// Polibio Sovereign Microservices Cluster Orchestrator
const { spawn } = require('child_process');
const path = require('path');

console.log(`
========================================================================
   ____   ____  _     ___ ____  ___ ___  
  |  _ \\ / __ \\| |   |_ _| __ )|_ _/ _ \\ 
  | |_) | |  | | |    | ||  _ \\ | | | | |
  |  __/| |__| | |___ | || |_) || | |_| |
  |_|    \\____/|_____|___|____/|___\\___/ 
                                          
  PLATAFORMA SOBERANA DE DOCUMENTACIÓN OFICIAL, PKI & BLOCKCHAIN
========================================================================
`);

const services = [
  { name: 'polibio-crypto-service', script: path.join(__dirname, 'services/crypto-service/index.js'), color: '\x1b[33m' },
  { name: 'polibio-ledger-service', script: path.join(__dirname, 'services/ledger-service/index.js'), color: '\x1b[36m' },
  { name: 'polibio-ai-service',     script: path.join(__dirname, 'services/ai-service/index.js'),     color: '\x1b[35m' },
  { name: 'polibio-telemetry-service', script: path.join(__dirname, 'services/telemetry-service/index.js'), color: '\x1b[32m' },
  { name: 'polibio-doc-service',    script: path.join(__dirname, 'services/doc-service/index.js'),    color: '\x1b[34m' },
  { name: 'polibio-gateway',        script: path.join(__dirname, 'services/gateway/index.js'),        color: '\x1b[32m\x1b[1m' }
];

const runningProcesses = [];

function startService(svc) {
  const proc = spawn(process.execPath, [svc.script], {
    stdio: ['inherit', 'pipe', 'pipe']
  });

  proc.stdout.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(l => {
      if (l.trim()) console.log(`${svc.color}[${svc.name}]\x1b[0m ${l}`);
    });
  });

  proc.stderr.on('data', data => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(l => {
      if (l.trim()) console.error(`${svc.color}[${svc.name} ERR]\x1b[0m ${l}`);
    });
  });

  proc.on('close', code => {
    console.log(`${svc.color}[${svc.name}]\x1b[0m Proceso terminado con código ${code}`);
  });

  runningProcesses.push({ name: svc.name, proc });
}

// Start core foundation services first, then doc service, then gateway
async function bootCluster() {
  console.log('[Orquestador] Iniciando servicios criptográficos y de auditoría...');
  startService(services[0]); // crypto
  startService(services[1]); // ledger
  startService(services[2]); // ai
  startService(services[3]); // telemetry

  await new Promise(r => setTimeout(r, 600));

  console.log('[Orquestador] Iniciando motor documental...');
  startService(services[4]); // doc

  await new Promise(r => setTimeout(r, 500));

  console.log('[Orquestador] Iniciando API Gateway perimetral...');
  startService(services[5]); // gateway

  console.log('\n✅ Todos los microservicios de Polibio han sido lanzados.');
  console.log('👉 Abra su navegador en: http://localhost:8000\n');
}

bootCluster();

// Graceful cleanup
function cleanup() {
  console.log('\n[Orquestador] Deteniendo clúster de microservicios...');
  runningProcesses.forEach(({ name, proc }) => {
    try {
      proc.kill('SIGTERM');
    } catch (e) {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

