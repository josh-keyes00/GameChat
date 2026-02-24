const express = require('express');
const { all } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const role = req.session.user.role;
  try {
    const apps = await all(
      `SELECT key, name, icon, is_enabled, requires_admin
       FROM apps
       WHERE is_enabled = 1
       ORDER BY id ASC`
    );

    const channels = await all(
      `SELECT app_key, channel_key, display_name, sort_order, requires_admin
       FROM channels
       ORDER BY sort_order ASC, id ASC`
    );

    const filteredApps = apps.filter((app) => (role === 'admin' ? true : app.requires_admin === 0));
    const filteredChannels = channels.filter((ch) => (role === 'admin' ? true : ch.requires_admin === 0));

    return res.json({ apps: filteredApps, channels: filteredChannels });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to load apps.' });
  }
});

module.exports = router;