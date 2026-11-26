# 🛡️ Polibio: Plataforma Soberana de Documentación Oficial, PKI & Blockchain

> **Soberanía Absoluta del Dato | Criptografía Institucional | Ledger Inmutable | IA Local On-Premise**

**Polibio** es una solución gubernamental y corporativa de alta disponibilidad diseñada para la redacción, tramitación, firma digital y archivo inmutable de documentos oficiales (**oficios, memorandos, circulares, acuerdos y resoluciones**). 

Opera bajo un modelo de arquitectura de microservicios con APIs desacopladas, diseñado para ejecutarse 100% en infraestructura local (*air-gapped ready*), integrando una Autoridad Certificadora (PKI) propia, una Blockchain privada permisionada para auditoría continua y un Asistente de IA generativa ejecutado en hardware local.

---

## 🏛️ 1. Pilares de la Arquitectura

```
                        ┌──────────────────────────────────────┐
                        │    Polibio Web Studio & Dashboard    │
                        │        (http://localhost:8000)       │
                        └──────────────────┬───────────────────┘
                                           │
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        POLIBIO API GATEWAY & REVERSE PROXY                             │
│                  (Enrutamiento, SSL, Rate-Limiting, Trazas X-Trace-ID)                 │
└───────┬───────────────────┬───────────────────┬───────────────────┬────────────┬───────┘
        │                   │                   │                   │            │
        ▼                   ▼                   ▼                   ▼            ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ ┌──────────────┐
│  Doc Service │    │Crypto Service│    │Ledger Service│    │  AI Service  │ │Telemetry Svc │
│ (Puerto 8002)│    │ (Puerto 8003)│    │ (Puerto 8004)│    │ (Puerto 8005)│ │ (Puerto 8006)│
├──────────────┤    ├──────────────┤    ├──────────────┤    ├──────────────┤ ├──────────────┤
│• Oficios     │    │• Root CA PKI │    │• Blockchain  │    │• LLM Local   │ │• Prometheus  │
│• Memorandos  │    │• X.509 Certs │    │• Árbol Merkle│    │  (Ollama)    │ │• Server-Sent │
│• Circulares  │    │• Hash SHA-256│    │• PoA Consenso│    │• Redactor IA │ │  Events (SSE)│
│• Flujo Firma │    │• AES-256-GCM │    │• Recibos Tx  │    │• Zero Fuga   │ │• CPU/RAM/VRAM│
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘ └──────────────┘
```

---

## 🔐 2. Modelo de Seguridad y Confidencialidad Granular (MLS)

Polibio adopta el estándar de Seguridad Multinivel (**Bell-LaPadula**):

| Nivel | Clasificación | Política Criptográfica | Auditoría en Blockchain |
| :---: | :--- | :--- | :--- |
| **1** | **Público** | Sin cifrado, acceso abierto e indexable. | Registro estándar |
| **2** | **Uso Interno** | Restringido a la red institucional gubernamental. | Registro estándar |
| **3** | **Reservado** | Cifrado con llave de unidad departamental. | Registro elevado |
| **4** | **Confidencial** | Cifrado de sobre asimétrico con certificado del funcionario. | Registro estricto de acceso |
| **5** | **Secreto de Estado** | Cifrado multicapa **AES-256-GCM** + re-autenticación con llave Root. | Registro inmutable de cada lectura |

---

## 📜 3. Infraestructura de Clave Pública (PKI) y Firma Digital

- **Root CA Propia**: `Polibio Sovereign Root CA` con par de claves RSA-2048/4096 o Ed25519 generadas localmente.
- **Certificados Digitales de Funcionarios**: Emitidos con serial único, huella digital SHA-256 (*thumbprint*), vigencia y nivel de habilitación (*Clearance*).
- **Sellado Criptográfico**: Al redactar un documento, se calcula el hash canónico $H = \text{SHA-256}(Doc)$, el cual se firma matemáticamente con la clave privada del remitente.

---

## ⛓️ 4. Blockchain de Auditoría y Trazabilidad Inmutable

Cada evento del ciclo de vida del documento genera una transacción criptográfica en el Libro Mayor:
- **Bloque Génesis** con validación PoA local.
- **Árboles de Merkle**: Permite emitir **Recibos Criptográficos de Notarización** independientes con prueba Merkle (*Proof of Existence* y *Non-Repudiation*).
- **Detección de Manipulación**: El endpoint `/api/ledger/verify` recorre y valida matemáticamente la cadena de hashes de todos los bloques en milisegundos.

---

## 🤖 5. Inteligencia Artificial Soberana (Local LLM)

- **Cero Fuga Externa**: No se envían prompts, metadatos ni tokens a nubes de terceros (OpenAI, Google, Azure, AWS).
- **Soporte Ollama / vLLM**: Conexión automática con modelos locales (`llama3`, `mistral`, `deepseek-r1`, `qwen2.5`).
- **Motor Soberano Embebido**: Cuenta con el motor nativo `SovereignDocAIEngine` para redacción formal inmediata, análisis de técnica documental y síntesis sin requerir configuración inicial pesada.

---

## 📊 6. Telemetría y Panel Centralizado

- **Métricas Prometheus**: Formato estándar en `/metrics` para integración directa con Prometheus y Grafana.
- **Streaming en Tiempo Real**: Notificaciones sub-segundo vía **Server-Sent Events (SSE)** en `/api/telemetry/stream` que actualizan los gráficos de recursos del sistema (CPU, RAM, VRAM GPU), rendimiento (RPS, latencias) y estado de la red.

---

## 🚀 7. Guía de Ejecución Rápida

### Opción A: Ejecución Directa (Node.js Local)
```bash
# 1. Iniciar todo el ecosistema de microservicios:
npm start

# O mediante:
node orchestrator.js
```
El sistema iniciará los 6 microservicios y abrirá el portal web en **http://localhost:8000**.

### Opción B: Despliegue con Docker Compose (con PostgreSQL, Ollama & Prometheus)
```bash
docker compose up -d
```
Servicios desplegados automáticamente:
- **Portal Web & API Gateway**: `http://localhost:8000`
- **PostgreSQL RLS Cluster**: `localhost:15432` (o configurado vía `POSTGRES_PORT`; `polibio_db`, auto-inicializada con `config/schema.sql`)
- **Prometheus TSDB**: `http://localhost:9090`
- **Motor LLM Ollama Local**: `http://localhost:11434`

### Opción C: Conexión a Clúster PostgreSQL Externo / On-Premise
```bash
# 1. Configurar la URL de conexión institucional:
export DATABASE_URL="postgres://polibio_admin:polibio_secure_password_2026@localhost:5432/polibio_db"

# 2. Inicializar tablas, políticas RLS e índices:
npm run db:init

# 3. Iniciar el clúster:
npm start
```
*Nota: Si `DATABASE_URL` no está definida, Polibio opera automáticamente en modo de almacenamiento local autónomo (JSON) sin requerir ninguna dependencia externa.*

---

## 🌐 8. Catálogo de APIs REST

| Servicio | Método | Ruta | Descripción |
| :--- | :---: | :--- | :--- |
| **Gateway** | `GET` | `/api/health` | Estado de salud de toda la malla |
| **Doc** | `GET` | `/api/docs` | Listado con filtro por clearance |
| **Doc** | `POST` | `/api/docs` | Crea, calcula hash y notariza documento |
| **Doc** | `POST` | `/api/docs/:id/sign` | Aplica firma digital PKI y registra en blockchain |
| **Doc** | `GET` | `/api/docs/verify/:query` | Cotejo público y validación electrónica (CSV) |
| **Crypto** | `GET` | `/api/crypto/ca/info` | Metadatos y huella de la Root CA |
| **Crypto** | `GET` | `/api/crypto/certificates`| Listado de certificados emitidos |
| **Crypto** | `POST` | `/api/crypto/certificates/issue` | Emite nuevo certificado de funcionario |
| **Crypto** | `POST` | `/api/crypto/hash` | Computa SHA-256 y SHA-512 canónicos |
| **Crypto** | `POST` | `/api/crypto/verify-signature` | Valida integridad y autenticidad |
| **Ledger** | `GET` | `/api/ledger/blocks` | Bloques del explorador blockchain |
| **Ledger** | `GET` | `/api/ledger/verify` | Auditoría de integridad total de la cadena |
| **Ledger** | `GET` | `/api/ledger/receipt/:txId` | Recibo criptográfico de custodia |
| **AI** | `GET` | `/api/ai/models` | Modelos locales disponibles en Ollama |
| **AI** | `POST` | `/api/ai/generate` | Generación y redacción de oficios con LLM local |
| **Telemetry**| `GET` | `/api/telemetry/live` | Métricas agregadas en tiempo real |
| **Telemetry**| `GET` | `/api/telemetry/stream` | Stream SSE en vivo para dashboards |
| **Telemetry**| `GET` | `/metrics` | Exportador estándar Prometheus |

---

## 🧪 9. Batería de Pruebas y Certificación de Seguridad

```bash
# 1. Pruebas E2E completas del clúster desplegado (Docker / Microservicios / Ollama / Postgres):
npm run test:cluster

# 2. Pruebas unitarias de criptografía de sobre asimétrico y confidencialidad:
npm run test:confidentiality

# 3. Pruebas de integración Bell-LaPadula MLS (cero texto plano en disco y 403 Forbidden):
npm run test:mls
```

---

## 🛡️ Licencia y Propósito
Desarrollado para entornos institucionales, diplomáticos y de defensa que requieren el más alto nivel de confidencialidad, no-repudio y soberanía digital.

