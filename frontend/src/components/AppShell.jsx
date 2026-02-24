import React, { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiFetch } from '../services/api';
import { useAuth } from './AuthProvider';
import ServerRail from './ServerRail';
import ChannelSidebar from './ChannelSidebar';
import TopBar from './TopBar';

function getAppKeyFromPath(pathname) {
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] !== 'app') return null;
  return parts[1] || null;
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  const appKey = getAppKeyFromPath(location.pathname);

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        const data = await apiFetch('/api/apps');
        if (!ignore) {
          setApps(data.apps || []);
          setChannels(data.channels || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    if (user) {
      load();
    }

    return () => {
      ignore = true;
    };
  }, [user]);

  const channelsByApp = useMemo(() => {
    const map = {};
    for (const channel of channels) {
      if (!map[channel.app_key]) map[channel.app_key] = [];
      map[channel.app_key].push(channel);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sort_order - b.sort_order);
    }
    return map;
  }, [channels]);

  const activeApp = apps.find((app) => app.key === appKey);

  const goToApp = (key) => {
    if (key === 'chat') {
      const first = channelsByApp.chat && channelsByApp.chat[0];
      navigate(`/app/chat/${first ? first.channel_key : 'general'}`);
      return;
    }
    if (key === 'private') {
      const first = channelsByApp.private && channelsByApp.private[0];
      navigate(`/app/private/${first ? first.channel_key : '3d-models'}`);
      return;
    }
    if (key === 'dnd') {
      navigate('/app/dnd');
      return;
    }
    if (key === 'emulators') {
      navigate('/app/emulators');
      return;
    }
    if (key === 'wiki-ai') {
      navigate('/app/wiki-ai');
      return;
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <ServerRail
        apps={apps}
        activeKey={appKey}
        onSelect={goToApp}
        loading={loading}
      />
      <ChannelSidebar
        appKey={appKey}
        channels={channelsByApp[appKey] || []}
        loading={loading}
      />
      <div className="app-main">
        <TopBar
          app={activeApp}
          user={user}
          onLogout={handleLogout}
        />
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}