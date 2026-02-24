const bcrypt = require('bcrypt');
const { initDb, get, run, all } = require('./db');

const SEED_APPS = [
  { key: 'chat', name: 'Chat', icon: '??', is_enabled: 1, requires_admin: 0 },
  { key: 'dnd', name: 'DND Tools', icon: '??', is_enabled: 1, requires_admin: 0 },
  { key: 'private', name: 'Private Files', icon: '??', is_enabled: 1, requires_admin: 1 },
  { key: 'emulators', name: 'Emulators', icon: '???', is_enabled: 1, requires_admin: 0 },
  { key: 'wiki-ai', name: 'Game Wiki AI', icon: '??', is_enabled: 1, requires_admin: 0 }
];

const SEED_CHANNELS = [
  { app_key: 'chat', channel_key: 'general', display_name: 'general', sort_order: 1, requires_admin: 0 },
  { app_key: 'chat', channel_key: 'files', display_name: 'files', sort_order: 2, requires_admin: 0 },
  { app_key: 'private', channel_key: '3d-models', display_name: '3d-models', sort_order: 1, requires_admin: 1 },
  { app_key: 'private', channel_key: 'stls', display_name: 'stls', sort_order: 2, requires_admin: 1 },
  { app_key: 'private', channel_key: 'printer-profiles', display_name: 'printer-profiles', sort_order: 3, requires_admin: 1 },
  { app_key: 'private', channel_key: 'backups', display_name: 'backups', sort_order: 4, requires_admin: 1 }
];

async function seedApps() {
  for (const app of SEED_APPS) {
    const existing = await get('SELECT id FROM apps WHERE key = ?', [app.key]);
    if (!existing) {
      await run(
        `INSERT INTO apps (key, name, icon, is_enabled, requires_admin)
         VALUES (?, ?, ?, ?, ?)`
        , [app.key, app.name, app.icon, app.is_enabled, app.requires_admin]
      );
    }
  }
}

async function seedChannels() {
  for (const channel of SEED_CHANNELS) {
    const existing = await get(
      'SELECT id FROM channels WHERE app_key = ? AND channel_key = ?',
      [channel.app_key, channel.channel_key]
    );
    if (!existing) {
      await run(
        `INSERT INTO channels (app_key, channel_key, display_name, sort_order, requires_admin)
         VALUES (?, ?, ?, ?, ?)`
        , [
          channel.app_key,
          channel.channel_key,
          channel.display_name,
          channel.sort_order,
          channel.requires_admin
        ]
      );
    }
  }
}

async function pruneChatChannels() {
  const allowed = new Set(
    SEED_CHANNELS.filter((c) => c.app_key === 'chat').map((c) => c.channel_key)
  );
  const existing = await all(
    'SELECT id, channel_key FROM channels WHERE app_key = ?',
    ['chat']
  );

  for (const channel of existing) {
    if (!allowed.has(channel.channel_key)) {
      await run('DELETE FROM chat_files WHERE message_id IN (SELECT id FROM messages WHERE channel_id = ?)', [channel.id]);
      await run('DELETE FROM messages WHERE channel_id = ?', [channel.id]);
      await run('DELETE FROM channels WHERE id = ?', [channel.id]);
    }
  }
}

async function seedUsers(options = {}) {
  const adminUsername = options.adminUsername || process.env.SEED_ADMIN_USERNAME || 'admin';
  const adminPassword = options.adminPassword || process.env.SEED_ADMIN_PASSWORD || 'admin123';
  const friendUsername = options.friendUsername || process.env.SEED_FRIEND_USERNAME || 'friend';
  const friendPassword = options.friendPassword || process.env.SEED_FRIEND_PASSWORD || 'friend123';

  const existingAdmin = await get('SELECT id FROM users WHERE username = ?', [adminUsername]);
  if (!existingAdmin) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await run(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [adminUsername, hash, 'admin']
    );
  }

  const existingFriend = await get('SELECT id FROM users WHERE username = ?', [friendUsername]);
  if (!existingFriend) {
    const hash = await bcrypt.hash(friendPassword, 10);
    await run(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [friendUsername, hash, 'friend']
    );
  }
}

async function seedAll() {
  await initDb();
  await seedApps();
  await seedChannels();
  await pruneChatChannels();
  await seedUsers();
}

module.exports = {
  seedAll
};
