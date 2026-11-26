// Polibio API Gateway & Central Reverse Proxy (Port 8000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Service Map Configuration
const SERVICES = {
  doc: { prefix: '/api/docs', targetPort: 8002, host: process.env.DOC_SERVICE_HOST || 'localhost' },
  crypto: { prefix: '/api/crypto', targetPort: 8003, host: process.env.CRYPTO_SERVICE_HOST || 'localhost' },
  auth: { prefix: '/api/auth', targetPort: 8003, host: process.env.CRYPTO_SERVICE_HOST || 'localhost' },
  users: { prefix: '/api/users', targetPort: 8003, host: process.env.CRYPTO_SERVICE_HOST || 'localhost' },
  ledger: { prefix: '/api/ledger', targetPort: 8004, host: process.env.LEDGER_SERVICE_HOST || 'localhost' },
  ai: { prefix: '/api/ai', targetPort: 8005, host: process.env.AI_SERVICE_HOST || 'localhost' },
  telemetry: { prefix: '/api/telemetry', targetPort: 8006, host: process.env.TELEMETRY_SERVICE_HOST || 'localhost' }
};

// Check health of downstream services
async function checkClusterHealth() {
  const results = {};
  const serviceChecks = [
    { name: 'polibio-gateway', port: PORT, host: 'localhost', path: '/health-self' },
    { name: 'polibio-doc-service', port: 8002, host: SERVICES.doc.host, path: '/health' },
    { name: 'polibio-crypto-service', port: 8003, host: SERVICES.crypto.host, path: '/health' },
    { name: 'polibio-ledger-service', port: 8004, host: SERVICES.ledger.host, path: '/health' },
    { name: 'polibio-ai-service', port: 8005, host: SERVICES.ai.host, path: '/health' },
    { name: 'polibio-telemetry-service', port: 8006, host: SERVICES.telemetry.host, path: '/health' }
  ];

  for (const s of serviceChecks) {
    if (s.path === '/health-self') {
      results[s.name] = { status: 'UP', latencyMs: 1 };
      continue;
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`http://${s.host}:${s.port}${s.path}`, { signal: controller.signal });
      clearTimeout(timeout);
      results[s.name] = {
        status: res.ok ? 'UP' : 'DEGRADED',
        latencyMs: Date.now() - start
      };
    } catch (e) {
      results[s.name] = { status: 'DOWN', latencyMs: 0, error: e.message };
    }
  }

  const allUp = Object.values(results).every(r => r.status === 'UP');
  return {
    status: allUp ? 'ALL_SYSTEMS_OPERATIONAL' : 'DEGRADED',
    gatewayPort: PORT,
    timestamp: new Date().toISOString(),
    services: results
  };
}

// Forward request to downstream microservice
function proxyRequest(req, res, targetPort, targetHost = 'localhost') {
  const options = {
    hostname: targetHost,
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${targetHost}:${targetPort}`,
      'x-forwarded-for': req.socket.remoteAddress,
      'x-forwarded-proto': 'http'
    }
  };

  const proxy = http.request(options, targetRes => {
    // Pass headers
    res.writeHead(targetRes.statusCode, targetRes.headers);
    targetRes.pipe(res);
  });

  proxy.on('error', err => {
    console.error(`[Gateway] Error enrutando hacia puerto ${targetPort}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: `Servicio no disponible en puerto ${targetPort}`,
        message: err.message
      }));
    }
  });

  req.pipe(proxy);
}

// Main HTTP Server
const server = http.createServer(async (req, res) => {
  // Global CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Clearance, X-Session-Token, X-Operator');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Prometheus scrape endpoint directly proxied to telemetry service
  if (pathname === '/metrics') {
    return proxyRequest(req, res, 8006, SERVICES.telemetry.host);
  }

  // Health endpoint
  if (pathname === '/api/health') {
    const health = await checkClusterHealth();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  // Route to corresponding microservices
  for (const [key, svc] of Object.entries(SERVICES)) {
    if (pathname.startsWith(svc.prefix)) {
      return proxyRequest(req, res, svc.targetPort, svc.host);
    }
  }

  // Static File Serving (Web UI)
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath);
    let contentType = 'text/html';
    if (ext === '.js') contentType = 'text/javascript';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.json') contentType = 'application/json';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🛡️  POLIBIO API GATEWAY OPERATIVO EN PUERTO ${PORT}`);
  console.log(`🌐  Portal Web: http://localhost:${PORT}`);
  console.log(`📊  Métricas Prometheus: http://localhost:${PORT}/metrics`);
  console.log(`=======================================================`);
});

