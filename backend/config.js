require('dotenv').config();

const path = require('path');

function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const config = {
  port: Number(process.env.PORT || 4000),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  clientOrigins: parseOrigins(process.env.CLIENT_ORIGIN || 'http://localhost:5173'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 1073741824),
  storageRoot: path.join(__dirname, 'storage'),
  tlsKeyPath: process.env.TLS_KEY_PATH || '',
  tlsCertPath: process.env.TLS_CERT_PATH || ''
};

module.exports = config;