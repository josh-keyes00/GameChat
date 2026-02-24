const express = require('express');
const path = require('path');
const multer = require('multer');
const { all, get, run } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { ensureDir, generateStoredFilename } = require('../services/storage');
const config = require('../config');

const router = express.Router();

async function getChatChannel(channelKey) {
  return get(
    `SELECT id, channel_key, requires_admin
     FROM channels
     WHERE app_key = 'chat' AND channel_key = ?`,
    [channelKey]
  );
}

function canAccessChannel(user, channel) {
  if (!channel) return false;
  if (channel.requires_admin && user.role !== 'admin') return false;
  return true;
}

function buildStorage() {
  return multer.diskStorage({
    destination: async (req, file, cb) => {
      try {
        const channelKey = req.params.channelKey;
        const channel = await getChatChannel(channelKey);
        if (!channel || !canAccessChannel(req.session.user, channel)) {
          return cb(new Error('Invalid channel.'));
        }
        const dest = path.join(config.storageRoot, 'chat_uploads', channelKey);
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

router.get('/channels/:channelKey/messages', requireAuth, async (req, res) => {
  const { channelKey } = req.params;
  try {
    const channel = await getChatChannel(channelKey);
    if (!canAccessChannel(req.session.user, channel)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const messages = await all(
      `SELECT m.id, m.message_text, m.created_at,
              u.username, u.role,
              f.id as file_id, f.original_filename, f.mime_type, f.size_bytes
       FROM messages m
       JOIN users u ON u.id = m.user_id
       LEFT JOIN chat_files f ON f.message_id = m.id
       WHERE m.channel_id = ?
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT 500`,
      [channel.id]
    );

    return res.json({ messages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load messages.' });
  }
});

router.post('/channels/:channelKey/messages', requireAuth, async (req, res) => {
  const { channelKey } = req.params;
  const { messageText } = req.body || {};

  if (!messageText || !messageText.trim()) {
    return res.status(400).json({ error: 'Message required.' });
  }

  try {
    const channel = await getChatChannel(channelKey);
    if (!canAccessChannel(req.session.user, channel)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const insert = await run(
      `INSERT INTO messages (channel_id, user_id, message_text)
       VALUES (?, ?, ?)`,
      [channel.id, req.session.user.id, messageText.trim()]
    );

    const message = await get(
      `SELECT m.id, m.message_text, m.created_at, u.username, u.role
       FROM messages m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = ?`,
      [insert.lastID]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`chat:${channelKey}`).emit('chat:new_message', message);
    }

    return res.json({ message });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to send message.' });
  }
});

router.post('/channels/:channelKey/upload', requireAuth, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'File too large.' });
      }
      console.error(err);
      return res.status(400).json({ error: 'Upload failed.' });
    }

    const { channelKey } = req.params;
    const messageText = (req.body && req.body.messageText) ? String(req.body.messageText) : null;

    try {
      const channel = await getChatChannel(channelKey);
      if (!canAccessChannel(req.session.user, channel)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (!req.file) {
        return res.status(400).json({ error: 'File required.' });
      }

      const insert = await run(
        `INSERT INTO messages (channel_id, user_id, message_text)
         VALUES (?, ?, ?)`,
        [channel.id, req.session.user.id, messageText && messageText.trim() ? messageText.trim() : null]
      );

      const storagePath = path.relative(process.cwd(), req.file.path);

      const fileInsert = await run(
        `INSERT INTO chat_files
         (message_id, original_filename, stored_filename, mime_type, size_bytes, storage_path, uploaded_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          insert.lastID,
          req.file.originalname,
          req.file.filename,
          req.file.mimetype,
          req.file.size,
          storagePath,
          req.session.user.id
        ]
      );

      const message = await get(
        `SELECT m.id, m.message_text, m.created_at,
                u.username, u.role,
                f.id as file_id, f.original_filename, f.mime_type, f.size_bytes
         FROM messages m
         JOIN users u ON u.id = m.user_id
         LEFT JOIN chat_files f ON f.message_id = m.id
         WHERE m.id = ?`,
        [insert.lastID]
      );

      const io = req.app.get('io');
      if (io) {
        io.to(`chat:${channelKey}`).emit('chat:new_message', message);
      }

      return res.json({ message, fileId: fileInsert.lastID });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Failed to save file.' });
    }
  });
});

router.get('/files/:fileId/download', requireAuth, async (req, res) => {
  const { fileId } = req.params;
  try {
    const file = await get(
      `SELECT f.id, f.original_filename, f.storage_path, c.channel_key, c.requires_admin
       FROM chat_files f
       JOIN messages m ON m.id = f.message_id
       JOIN channels c ON c.id = m.channel_id
       WHERE f.id = ?`,
      [fileId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found.' });
    }

    if (file.requires_admin && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const absolutePath = path.join(process.cwd(), file.storage_path);
    return res.download(absolutePath, file.original_filename);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Download failed.' });
  }
});

module.exports = router;