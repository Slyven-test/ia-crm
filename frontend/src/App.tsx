import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import NavBar from './components/NavBar';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import RecommendationsPage from './pages/RecommendationsPage';
import CampaignsPage from './pages/CampaignsPage';

export default function App() {
  // Stockage du token JWT dans le state et dans localStorage
  const [token, setToken] = useState<string | null>(
    localStorage.getItem('token')
  );

  const handleLogin = (newToken: string) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div>
      <NavBar onLogout={handleLogout} />
      <div style={{ padding: '1rem' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}