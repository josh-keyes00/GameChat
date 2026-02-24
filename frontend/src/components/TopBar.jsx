import React from 'react';

export default function TopBar({ app, user, onLogout }) {
  return (
    <div className="top-bar">
      <div>
        <div className="top-bar-title">{app ? app.name : 'Loading...'}</div>
        <div className="top-bar-subtitle">Personal Gaming Hub</div>
      </div>
      <div className="top-bar-user">
        <div className="user-pill">
          <span className="user-name">{user?.username}</span>
          <span className={`user-role ${user?.role}`}>{user?.role}</span>
        </div>
        <button className="ghost-button" onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
}