import React, { useRef, useState } from 'react';

export default function ChatComposer({ onSend, onUpload }) {
  const [text, setText] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const fileRef = useRef(null);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus('Uploading...');
    const result = await onUpload(file, text.trim());
    if (result.ok) {
      setUploadStatus('Upload complete.');
      setText('');
    } else {
      setUploadStatus(result.error || 'Upload failed.');
    }
    if (fileRef.current) fileRef.current.value = '';
    setTimeout(() => setUploadStatus(''), 3000);
  };

  return (
    <div className="chat-composer">
      <div className="composer-row">
        <input
          type="text"
          placeholder="Message #channel"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="primary-button" onClick={handleSend}>Send</button>
      </div>
      <div className="composer-row">
        <input
          ref={fileRef}
          type="file"
          onChange={handleFileChange}
        />
        {uploadStatus && <div className="upload-status">{uploadStatus}</div>}
      </div>
    </div>
  );
}