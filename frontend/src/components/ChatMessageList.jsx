import React, { useEffect, useRef } from 'react';

function formatTimestamp(ts) {
  const date = new Date(ts);
  return date.toLocaleString();
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function getFileLabel(name = '') {
  const parts = name.split('.');
  if (parts.length < 2) return 'FILE';
  return parts[parts.length - 1].toUpperCase();
}

export default function ChatMessageList({ messages }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-messages">
      {messages.map((msg) => (
        <div className="chat-message" key={msg.id}>
          <div className="message-meta">
            <span className="message-user">{msg.username}</span>
            <span className="message-time">{formatTimestamp(msg.created_at)}</span>
          </div>
          {msg.message_text && <div className="message-text">{msg.message_text}</div>}
          {msg.file_id && (
            <div className="message-file">
              <a href={`/api/chat/files/${msg.file_id}/download`} className="file-link">
                {msg.original_filename}
              </a>
              <span className="file-meta">
                {getFileLabel(msg.original_filename)} · {formatSize(msg.size_bytes)}
              </span>
            </div>
          )}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
