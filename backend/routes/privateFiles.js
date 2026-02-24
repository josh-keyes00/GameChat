const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { get, all, run } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ensureDir, generateStoredFilename } = require('../services/storage');
const config = require('../config');

const router = express.Router();

async function getPrivateFolder(folderKey) {
  return get(
    `SELECT id, channel_key, requires_admin
     FROM channels
     WHERE app_key = 'private' AND channel_key = ?`,
    [folderKey]
  );
}

function buildStorage() {
  return multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const folderKey = req.params.folderKey;
        const folder = await getPrivateFolder(folderKey);
        if (!folder) {
          return cb(new Error('Invalid folder.'));
        }
        const dest = path.join(config.storageRoot, 'private_files', folderKey);
        ensureDir(dest);
        cb(null, dest);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      const stored = generateStoredFilename(file.originalname);
      cb(null, stored);
    }
  });
}

const upload = multer({
  storage: buildStorage(),
  limits: { fileSize: config.maxUploadBytes }
});

router.get('/folders/:folderKey/files', requireAuth, requireAdmin, async (req, res) => {
  const { folderKey } = req.params;
  try {
    const folder = await getPrivateFolder(folderKey);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found.' });
    }

    const files = await all(
      `SELECT id, original_filename, mime_type, size_bytes, created_at, uploaded_by_user_id
       FROM private_files
       WHERE folder_key = ?
       ORDER BY created_at DESC, id DESC`,
      [folderKey]
    );

    return res.json({ files });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load files.' });
  }
});

router.post('/folders/:folderKey/upload', requireAuth, requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large.' });
      }
      console.error(err);
      return res.status(400).json({ error: 'Upload failed.' });
    }

    const { folderKey } = req.params;

    try {
      const folder = await getPrivateFolder(folderKey);
      if (!folder) {
        return res.status(404).json({ error: 'Folder not found.' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'File required.' });
      }

      const storagePath = path.relative(process.cwd(), req.file.path);

      const insert = await run(
        `INSERT INTO private_files
         (folder_key, original_filename, stored_filename, mime_type, size_bytes, storage_path, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          folderKey,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          storagePath,
          req.session.user.id
        ]
      );

      return res.json({ ok: true, fileId: insert.lastID });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to save file.' });
    }
  });
});

router.get('/files/:fileId/download', requireAuth, requireAdmin, async (req, res) => {
  const { fileId } = req.params;
  try {
    const file = await get(
      `SELECT id, original_filename, storage_path
       FROM private_files
       WHERE id = ?`,
      [fileId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const absolutePath = path.join(process.cwd(), file.storage_path);
    return res.download(absolutePath, file.original_filename);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Download failed.' });
  }
});

router.delete('/files/:fileId', requireAuth, requireAdmin, async (req, res) => {
  const { fileId } = req.params;
  try {
    const file = await get(
      `SELECT id, storage_path
       FROM private_files
       WHERE id = ?`,
      [fileId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    const absolutePath = path.join(process.cwd(), file.storage_path);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    await run('DELETE FROM private_files WHERE id = ?', [fileId]);

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Delete failed.' });
  }
});

module.exports = router;