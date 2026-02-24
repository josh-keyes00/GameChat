const { get, run } = require('../db');

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

function registerChatSockets(io) {
  io.on('connection', (socket) => {
    const session = socket.request.session;
    if (!session || !session.user) {
      socket.emit('chat:error', { error: 'Unauthorized' });
      socket.disconnect(true);
      return;
    }

    socket.on('chat:join_channel', async (payload = {}) => {
      const channelKey = payload.channelKey;
      if (!channelKey) return;
      const channel = await getChatChannel(channelKey);
      if (!canAccessChannel(session.user, channel)) {
        socket.emit('chat:error', { error: 'Forbidden' });
        return;
      }
      const room = `chat:${channelKey}`;
      socket.join(room);
      socket.data.currentChannel = channelKey;
    });

    socket.on('chat:leave_channel', (payload = {}) => {
      const channelKey = payload.channelKey || socket.data.currentChannel;
      if (!channelKey) return;
      const room = `chat:${channelKey}`;
      socket.leave(room);
    });

    socket.on('chat:send_message', async (payload = {}) => {
      const channelKey = payload.channelKey;
      const messageText = payload.messageText;

      if (!channelKey || !messageText || !messageText.trim()) {
        socket.emit('chat:error', { error: 'Message required.' });
        return;
      }

      const channel = await getChatChannel(channelKey);
      if (!canAccessChannel(session.user, channel)) {
        socket.emit('chat:error', { error: 'Forbidden' });
        return;
      }

      const insert = await run(
        `INSERT INTO messages (channel_id, user_id, message_text)
         VALUES (?, ?, ?)`,
        [channel.id, session.user.id, messageText.trim()]
      );

      const message = await get(
        `SELECT m.id, m.message_text, m.created_at, u.username, u.role
         FROM messages m
         JOIN users u ON u.id = m.user_id
         WHERE m.id = ?`,
        [insert.lastID]
      );

      io.to(`chat:${channelKey}`).emit('chat:new_message', message);
    });
  });
}

module.exports = { registerChatSockets };