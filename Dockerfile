FROM node:24-alpine

WORKDIR /app

# Copiar manifiesto de dependencias e instalar
COPY package.json ./
RUN npm install --omit=dev

# Copiar código de servicios y configuraciones
COPY services ./services
COPY config ./config

# Crear directorios de datos
RUN mkdir -p data/pki data/ledger data/documents

EXPOSE 8000 8002 8003 8004 8005 8006

CMD ["node", "orchestrator.js"]

