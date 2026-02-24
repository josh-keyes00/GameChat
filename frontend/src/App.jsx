import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import ProtectedRoute from './components/ProtectedRoute';
import AdminRoute from './components/AdminRoute';
import AppShell from './components/AppShell';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import DndToolsPage from './pages/DndToolsPage';
import PrivateFilesPage from './pages/PrivateFilesPage';
import PlaceholderPage from './pages/PlaceholderPage';

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/app/chat/general" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="chat/:channelKey" element={<ChatPage />} />
          <Route path="dnd" element={<DndToolsPage />} />
          <Route
            path="private/:folderKey"
            element={
              <AdminRoute>
                <PrivateFilesPage />
              </AdminRoute>
            }
          />
          <Route
            path="emulators"
            element={<PlaceholderPage title="Emulators" message="Coming soon." />}
          />
          <Route
            path="wiki-ai"
            element={<PlaceholderPage title="Game Wiki AI" message="Coming soon." />}
          />
          <Route path="*" element={<Navigate to="/app/chat/general" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}