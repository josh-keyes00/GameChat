import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../services/api';
import { socket } from '../services/socket';
import ChatMessageList from '../components/ChatMessageList';
import ChatComposer from '../components/ChatComposer';
import VoicePanel from '../components/VoicePanel';

const MAX_UPLOAD_BYTES = 1073741824;

export default function ChatPage() {
  const { channelKey } = useParams();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const channelRef = useRef(channelKey);

  useEffect(() => {
    channelRef.current = channelKey;
  }, [channelKey]);

  useEffect(() => {
    let ignore = false;
    async function loadMessages() {
      setLoading(true);
      setError('');
      try {
        const data = await apiFetch(`/api/chat/channels/${channelKey}/messages`);
        if (!ignore) {
          setMessages(data.messages || []);
        }
      } catch (err) {
        if (!ignore) setError(err.message || 'Failed to load messages.');
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (channelKey) {
      loadMessages();
    }

    return () => {
      ignore = true;
    };
  }, [channelKey]);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    socket.emit('chat:join_channel', { channelKey });

    const handleNewMessage = (message) => {
      setMessages((prev) => [...prev, message]);
    };

    const handleError = (payload) => {
      console.error(payload);
    };

    socket.on('chat:new_message', handleNewMessage);
    socket.on('chat:error', handleError);

    return () => {
      socket.emit('chat:leave_channel', { channelKey });
      socket.off('chat:new_message', handleNewMessage);
      socket.off('chat:error', handleError);
    };
  }, [channelKey]);

  const handleSend = (text) => {
    socket.emit('chat:send_message', { channelKey, messageText: text });
  };

  const handleFileUpload = async (file, messageText) => {
    if (!file) return { ok: false, error: 'No file selected.' };
    if (file.size > MAX_UPLOAD_BYTES) {
      return { ok: false, error: 'File exceeds 1GB limit.' };
    }

    const form = new FormData();
    form.append('file', file);
    if (messageText) form.append('messageText', messageText);

    try {
      const res = await fetch(`/api/chat/channels/${channelKey}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed.');
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  return (
    <div className="chat-page">
      <VoicePanel channelKey={channelKey} />
      {loading && <div className="panel-loading">Loading channel...</div>}
      {error && <div className="panel-error">{error}</div>}
      {!loading && (
        <>
          <ChatMessageList messages={messages} />
          <ChatComposer onSend={handleSend} onUpload={handleFileUpload} />
        </>
      )}
    </div>
  );
}
