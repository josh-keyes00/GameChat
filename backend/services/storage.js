const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function sanitizeFilename(name) {
  const base = path.basename(name);
  return base.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function generateStoredFilename(originalName) {
  const safeOriginal = sanitizeFilename(originalName);
  const ext = path.extname(safeOriginal);
  const id = crypto.randomUUID();
  return `${id}${ext}`;
}

module.exports = {
  ensureDir,
  sanitizeFilename,
  generateStoredFilename
};