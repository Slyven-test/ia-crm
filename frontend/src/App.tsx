import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import NavBar from './components/NavBar';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import RecommendationsPage from './pages/RecommendationsPage';
import CampaignsPage from './pages/CampaignsPage';
import CustomersPage from './pages/CustomersPage';
import ProductsPage from './pages/ProductsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AuditPage from './pages/AuditPage';
import ETLPage from './pages/ETLPage';
import RecoRunsPage from './pages/RecoRunsPage';
import ContactsPage from './pages/ContactsPage';
import ConfigPage from './pages/ConfigPage';
import ClustersPage from './pages/ClustersPage';
import ReviewPage from './pages/ReviewPage';
import RfmPage from './pages/RfmPage';

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
          <Route path="/clients" element={<CustomersPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/recommendations" element={<RecommendationsPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/audit" element={<AuditPage />} />
      <Route path="/etl" element={<ETLPage />} />
      <Route path="/runs" element={<RecoRunsPage />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/config" element={<ConfigPage />} />
          <Route path="/clusters" element={<ClustersPage />} />
          <Route path="/review" element={<ReviewPage />} />
        <Route path="/rfm" element={<RfmPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}