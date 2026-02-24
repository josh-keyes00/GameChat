const { get } = require('../db');

const voiceRooms = new Map();

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

function getRoom(channelKey) {
  if (!voiceRooms.has(channelKey)) {
    voiceRooms.set(channelKey, new Map());
  }
  return voiceRooms.get(channelKey);
}

function removeFromRoom(channelKey, socketId) {
  if (!channelKey) return;
  const room = voiceRooms.get(channelKey);
  if (!room) return;
  room.delete(socketId);
  if (room.size === 0) {
    voiceRooms.delete(channelKey);
  }
}

function registerVoiceSockets(io) {
  io.on('connection', (socket) => {
    const session = socket.request.session;
    if (!session || !session.user) {
      return;
    }

    socket.on('voice:join', async (payload = {}) => {
      const channelKey = payload.channelKey;
      if (!channelKey) return;

      const previousChannel = socket.data.voiceChannel;
      if (previousChannel && previousChannel !== channelKey) {
        const previousRoomKey = `voice:${previousChannel}`;
        removeFromRoom(previousChannel, socket.id);
        socket.leave(previousRoomKey);
        socket.to(previousRoomKey).emit('voice:peer_left', { id: socket.id });
      }

      const channel = await getChatChannel(channelKey);
      if (!canAccessChannel(session.user, channel)) {
        socket.emit('voice:error', { error: 'Forbidden' });
        return;
      }

      const roomKey = `voice:${channelKey}`;
      socket.join(roomKey);
      socket.data.voiceChannel = channelKey;

      const room = getRoom(channelKey);
      room.set(socket.id, { username: session.user.username });

      const peers = Array.from(room.entries())
        .filter(([id]) => id !== socket.id)
        .map(([id, data]) => ({ id, username: data.username }));

      socket.emit('voice:peer_list', { channelKey, peers });
      socket.to(roomKey).emit('voice:peer_joined', { id: socket.id, username: session.user.username });
    });

    socket.on('voice:leave', () => {
      const channelKey = socket.data.voiceChannel;
      if (!channelKey) return;
      const roomKey = `voice:${channelKey}`;
      removeFromRoom(channelKey, socket.id);
      socket.leave(roomKey);
      socket.to(roomKey).emit('voice:peer_left', { id: socket.id });
      socket.data.voiceChannel = null;
    });

    socket.on('voice:signal', (payload = {}) => {
      const targetId = payload.targetId;
      const data = payload.data;
      if (!targetId || !data) return;
      io.to(targetId).emit('voice:signal', {
        fromId: socket.id,
        data,
        username: session.user.username
      });
    });

    socket.on('disconnect', () => {
      const channelKey = socket.data.voiceChannel;
      if (!channelKey) return;
      const roomKey = `voice:${channelKey}`;
      removeFromRoom(channelKey, socket.id);
      socket.to(roomKey).emit('voice:peer_left', { id: socket.id });
    });
  });
}

module.exports = { registerVoiceSockets };
