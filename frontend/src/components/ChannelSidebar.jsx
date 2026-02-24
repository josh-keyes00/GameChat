import React from 'react';
import { NavLink } from 'react-router-dom';

function buildChannelRoute(appKey, channelKey) {
  if (appKey === 'chat') return `/app/chat/${channelKey}`;
  if (appKey === 'private') return `/app/private/${channelKey}`;
  return null;
}

export default function ChannelSidebar({ appKey, channels, loading }) {
  if (!appKey) {
    return <div className="channel-sidebar empty">Select an app</div>;
  }

  return (
    <div className="channel-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-title">{appKey.toUpperCase()}</div>
      </div>
      <div className="channel-list">
        {loading && <div className="sidebar-loading">Loading</div>}
        {!loading && channels.length === 0 && (
          <div className="sidebar-empty">No channels</div>
        )}
        {!loading && channels.map((channel) => {
          const route = buildChannelRoute(appKey, channel.channel_key);
          if (!route) return null;
          return (
            <NavLink
              key={channel.channel_key}
              to={route}
              className={({ isActive }) => `channel-item ${isActive ? 'active' : ''}`}
            >
              <span className="channel-hash">#</span>
              {channel.display_name}
            </NavLink>
          );
        })}
      </div>
      {appKey === 'dnd' && (
        <div className="sidebar-note">DND Tools loaded in the center panel.</div>
      )}
      {appKey === 'emulators' && (
        <div className="sidebar-note">Emulators coming soon.</div>
      )}
      {appKey === 'wiki-ai' && (
        <div className="sidebar-note">Game Wiki AI coming soon.</div>
      )}
    </div>
  );
}