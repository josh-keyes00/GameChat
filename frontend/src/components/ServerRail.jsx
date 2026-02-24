import React from 'react';

export default function ServerRail({ apps, activeKey, onSelect, loading }) {
  return (
    <div className="server-rail">
      <div className="rail-title">PGH</div>
      <div className="rail-list">
        {loading && <div className="rail-loading">Loading</div>}
        {!loading && apps.map((app) => (
          <button
            key={app.key}
            className={`rail-item ${activeKey === app.key ? 'active' : ''}`}
            onClick={() => onSelect(app.key)}
            title={app.name}
          >
            <span className="rail-icon">{app.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}