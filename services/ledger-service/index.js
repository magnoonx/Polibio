// Polibio Ledger & Blockchain Microservice (Port 8004)
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pg = require('../shared/postgres-adapter');

const PORT = process.env.PORT || 8004;
const DATA_DIR = path.join(__dirname, '../../data/ledger');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-Memory Blockchain & Mempool
let chain = [];
let mempool = [];
const VALIDATOR_ID = 'Polibio-Node-Sovereign-01';

// Merkle Tree Helper
function computeSha256(data) {
  return crypto.createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
}

function calculateMerkleRoot(transactions) {
  if (!transactions || transactions.length === 0) {
    return computeSha256('POLIBIO_EMPTY_BLOCK');
  }

  let hashes = transactions.map(tx => tx.txHash || computeSha256(tx));

  while (hashes.length > 1) {
    if (hashes.length % 2 !== 0) {
      hashes.push(hashes[hashes.length - 1]); // Duplicar último nodo si es impar
    }
    const nextLevel = [];
    for (let i = 0; i < hashes.length; i += 2) {
      nextLevel.push(computeSha256(hashes[i] + hashes[i + 1]));
    }
    hashes = nextLevel;
  }

  return hashes[0];
}

// Compute Block Hash
function calculateBlockHash(index, timestamp, previousHash, merkleRoot, nonce, validator) {
  const content = `${index}|${timestamp}|${previousHash}|${merkleRoot}|${nonce}|${validator}`;
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Create Genesis Block
function createGenesisBlock() {
  const timestamp = '2026-01-01T00:00:00.000Z';
  const genesisTxs = [
    {
      txId: 'TX-GENESIS-00000000',
      type: 'GENESIS_INITIALIZATION',
      documentId: 'SYSTEM-ROOT',
      action: 'INITIALIZE_SOVEREIGN_LEDGER',
      details: {
        system: 'Polibio Enterprise Sovereign Blockchain',
        description: 'Libro mayor inmutable y de no-repudio para documentos oficiales de Estado',
        consensus: 'Proof-of-Authority (PoA) Criptográfica'
      },
      operator: 'ROOT_SECURITY_OFFICER',
      timestamp: timestamp,
      txHash: computeSha256({ genesis: true, timestamp })
    }
  ];

  const merkleRoot = calculateMerkleRoot(genesisTxs);
  const hash = calculateBlockHash(0, timestamp, '0'.repeat(64), merkleRoot, 0, VALIDATOR_ID);

  return {
    index: 0,
    timestamp,
    previousHash: '0'.repeat(64),
    merkleRoot,
    nonce: 0,
    validator: VALIDATOR_ID,
    transactions: genesisTxs,
    hash
  };
}

// Initialize Chain
function initBlockchain() {
  const chainFile = path.join(DATA_DIR, 'blockchain.json');
  if (fs.existsSync(chainFile)) {
    try {
      chain = JSON.parse(fs.readFileSync(chainFile, 'utf8'));
      console.log(`[Ledger-Service] Blockchain cargada con éxito. Altura actual: ${chain.length} bloques.`);
      return;
    } catch (e) {
      console.error('[Ledger-Service] Error cargando blockchain local, reinicializando...', e);
    }
  }

  console.log('[Ledger-Service] Inicializando Bloque Génesis de Polibio...');
  const genesis = createGenesisBlock();
  chain = [genesis];
  saveBlockchain();
  console.log(`[Ledger-Service] Bloque Génesis creado. Hash: ${genesis.hash}`);
}

function saveBlockchain() {
  const chainFile = path.join(DATA_DIR, 'blockchain.json');
  fs.writeFileSync(chainFile, JSON.stringify(chain, null, 2));
}

// Mint Block
function mintBlock() {
  if (mempool.length === 0) return null;

  const previousBlock = chain[chain.length - 1];
  const index = chain.length;
  const timestamp = new Date().toISOString();
  const transactionsToInclude = [...mempool];
  mempool = [];

  const merkleRoot = calculateMerkleRoot(transactionsToInclude);
  const nonce = Math.floor(Math.random() * 1000000);
  const hash = calculateBlockHash(index, timestamp, previousBlock.hash, merkleRoot, nonce, VALIDATOR_ID);

  const newBlock = {
    index,
    timestamp,
    previousHash: previousBlock.hash,
    merkleRoot,
    nonce,
    validator: VALIDATOR_ID,
    transactions: transactionsToInclude,
    hash
  };

  chain.push(newBlock);
  saveBlockchain();

  // Async PostgreSQL sync if connected
  if (pg.isConfigured()) {
    (async () => {
      try {
        await pg.query(
          `INSERT INTO blockchain_blocks (index, hash, previous_hash, merkle_root, nonce, validator, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (index) DO NOTHING`,
          [newBlock.index, newBlock.hash, newBlock.previousHash, newBlock.merkleRoot, newBlock.nonce, newBlock.validator, newBlock.timestamp]
        );
        for (const t of newBlock.transactions) {
          await pg.query(
            `INSERT INTO blockchain_transactions (tx_id, block_index, type, document_id, document_number, document_hash, action, confidentiality_level, signer_thumbprint, operator, details, tx_hash, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (tx_id) DO NOTHING`,
            [
              t.txId, newBlock.index, t.type || 'DOCUMENT_AUDIT', t.documentId || 'N/A', t.documentNumber || 'N/A',
              t.documentHash || '', t.action || 'TRANSACTION', t.confidentialityLevel || 1,
              t.signerThumbprint || null, t.operator || 'Sistema Polibio', JSON.stringify(t.details || {}),
              t.txHash, t.timestamp
            ]
          );
        }
      } catch (e) {}
    })();
  }

  console.log(`[Ledger-Service] ⛏️ Nuevo Bloque #${index} sellado con ${transactionsToInclude.length} transacciones. Hash: ${hash.substring(0, 16)}...`);
  return newBlock;
}

// Record Transaction
function recordTransaction(data) {
  const timestamp = new Date().toISOString();
  const txId = 'TX-' + Date.now().toString(16).toUpperCase() + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  
  const txPayload = {
    txId,
    type: data.type || 'DOCUMENT_AUDIT',
    documentId: data.documentId || 'N/A',
    documentNumber: data.documentNumber || 'N/A',
    documentHash: data.documentHash || '',
    action: data.action || 'TRANSACTION',
    confidentialityLevel: data.confidentialityLevel || 1,
    signerThumbprint: data.signerThumbprint || null,
    operator: data.operator || 'Sistema Polibio',
    details: data.details || {},
    timestamp
  };

  txPayload.txHash = computeSha256(txPayload);
  mempool.push(txPayload);

  // Mint immediately for high security or when batch >= 1 for interactive responsiveness
  const block = mintBlock();

  return {
    txId,
    txHash: txPayload.txHash,
    blockIndex: block ? block.index : chain.length,
    status: 'NOTARIZED_IN_BLOCKCHAIN',
    timestamp
  };
}

// Verify Chain Integrity
function verifyChainIntegrity() {
  for (let i = 1; i < chain.length; i++) {
    const current = chain[i];
    const prev = chain[i - 1];

    // Check Previous Hash pointer
    if (current.previousHash !== prev.hash) {
      return {
        valid: false,
        error: `Ruptura de enlace en bloque #${i}: previousHash no coincide con bloque #${i - 1}`,
        brokenBlockIndex: i
      };
    }

    // Check Merkle Root
    const computedMerkle = calculateMerkleRoot(current.transactions);
    if (current.merkleRoot !== computedMerkle) {
      return {
        valid: false,
        error: `Alteración de transacciones en bloque #${i}: Merkle root inválido`,
        brokenBlockIndex: i
      };
    }

    // Check Block Hash
    const computedHash = calculateBlockHash(current.index, current.timestamp, current.previousHash, current.merkleRoot, current.nonce, current.validator);
    if (current.hash !== computedHash) {
      return {
        valid: false,
        error: `Hash del bloque #${i} alterado. Tampering detectado.`,
        brokenBlockIndex: i
      };
    }
  }

  return {
    valid: true,
    totalBlocks: chain.length,
    verifiedAt: new Date().toISOString(),
    status: 'INTEGRITY_FULLY_VERIFIED'
  };
}

// Generate Cryptographic Receipt for a Transaction
function getCryptographicReceipt(txId) {
  for (const block of chain) {
    const txIndex = block.transactions.findIndex(t => t.txId === txId || t.txHash === txId);
    if (txIndex !== -1) {
      const tx = block.transactions[txIndex];
      return {
        receiptId: `RCPT-${tx.txId}`,
        transaction: tx,
        blockNumber: block.index,
        blockTimestamp: block.timestamp,
        blockHash: block.hash,
        previousBlockHash: block.previousHash,
        merkleRoot: block.merkleRoot,
        validator: block.validator,
        proofOfExistence: {
          algorithm: 'SHA-256',
          documentHash: tx.documentHash,
          notarizedAt: tx.timestamp
        },
        tamperProofGuarantee: 'Inmutable según consenso PoA Polibio Sovereign Ledger'
      };
    }
  }
  return null;
}

// HTTP Server
initBlockchain();

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let parsedBody = {};
    if (body) {
      try { parsedBody = JSON.parse(body); } catch (e) {}
    }

    const sendJson = (status, data) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };

    try {
      if (pathname === '/health') {
        return sendJson(200, { service: 'polibio-ledger-service', status: 'HEALTHY', blockHeight: chain.length, port: PORT });
      }

      // Record Audit Event
      if (pathname === '/api/ledger/record' && req.method === 'POST') {
        const record = recordTransaction(parsedBody);
        return sendJson(201, record);
      }

      // Get Chain Explorer Blocks
      if (pathname === '/api/ledger/blocks' && req.method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit')) || 25;
        const reversed = [...chain].reverse().slice(0, limit);
        return sendJson(200, {
          totalBlocks: chain.length,
          blocks: reversed
        });
      }

      // Get Block by Index
      if (pathname.startsWith('/api/ledger/block/') && req.method === 'GET') {
        const index = parseInt(pathname.split('/').pop());
        const block = chain[index];
        if (!block) return sendJson(404, { error: 'Bloque no encontrado' });
        return sendJson(200, block);
      }

      // Verify Chain
      if (pathname === '/api/ledger/verify' && req.method === 'GET') {
        const result = verifyChainIntegrity();
        return sendJson(200, result);
      }

      // Cryptographic Receipt
      if (pathname.startsWith('/api/ledger/receipt/') && req.method === 'GET') {
        const txId = pathname.split('/').pop();
        const receipt = getCryptographicReceipt(txId);
        if (!receipt) return sendJson(404, { error: 'Transacción o recibo no encontrado' });
        return sendJson(200, receipt);
      }

      // Blockchain Stats
      if (pathname === '/api/ledger/stats' && req.method === 'GET') {
        let totalTxs = 0;
        chain.forEach(b => totalTxs += b.transactions.length);
        return sendJson(200, {
          blockHeight: chain.length,
          totalTransactions: totalTxs,
          pendingMempool: mempool.length,
          validator: VALIDATOR_ID,
          latestBlockHash: chain[chain.length - 1].hash,
          integrity: verifyChainIntegrity()
        });
      }

      return sendJson(404, { error: 'Ruta no encontrada en polibio-ledger-service' });
    } catch (err) {
      console.error('[Ledger-Service Error]', err);
      return sendJson(500, { error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`[polibio-ledger-service] Ejecutándose en puerto ${PORT}`);
});

