import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiFetch } from '../services/api';

const MAX_UPLOAD_BYTES = 1073741824;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export default function PrivateFilesPage() {
  const { folderKey } = useParams();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);

  const loadFiles = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch(`/api/private/folders/${folderKey}/files`);
      setFiles(data.files || []);
    } catch (err) {
      setError(err.message || 'Failed to load files.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (folderKey) {
      loadFiles();
    }
  }, [folderKey]);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus('File exceeds 1GB limit.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    setStatus('Uploading...');
    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch(`/api/private/folders/${folderKey}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: form
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Upload failed.');
      }
      setStatus('Upload complete.');
      await loadFiles();
    } catch (err) {
      setStatus(err.message || 'Upload failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const handleDelete = async (fileId) => {
    const confirmed = window.confirm('Delete this file?');
    if (!confirmed) return;
    try {
      await apiFetch(`/api/private/files/${fileId}`, { method: 'DELETE' });
      await loadFiles();
    } catch (err) {
      alert(err.message || 'Delete failed.');
    }
  };

  return (
    <div className="private-files-page">
      <div className="panel-header">
        <div className="panel-title">Private Files: {folderKey}</div>
        <label className="file-upload">
          <input type="file" ref={fileRef} onChange={handleUpload} />
          <span className="ghost-button">Upload File</span>
        </label>
      </div>
      {status && <div className="panel-status">{status}</div>}
      {loading && <div className="panel-loading">Loading files...</div>}
      {error && <div className="panel-error">{error}</div>}
      {!loading && files.length === 0 && (
        <div className="panel-empty">No files yet.</div>
      )}
      {!loading && files.length > 0 && (
        <div className="file-list">
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <div>
                <div className="file-name">{file.original_filename}</div>
                <div className="file-meta">{formatSize(file.size_bytes)}</div>
              </div>
              <div className="file-actions">
                <a
                  className="ghost-button"
                  href={`/api/private/files/${file.id}/download`}
                >
                  Download
                </a>
                <button className="danger-button" onClick={() => handleDelete(file.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}