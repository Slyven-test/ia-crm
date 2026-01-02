import React from 'react';
import { NavLink } from 'react-router-dom';

interface Props {
  onLogout: () => void;
}

export default function NavBar({ onLogout }: Props) {
  const linkStyle: React.CSSProperties = {
    marginRight: '1rem',
    textDecoration: 'none',
    color: '#007bff',
  };
  const activeStyle: React.CSSProperties = {
    fontWeight: 'bold',
    color: '#0056b3',
  };
  return (
    <nav style={{ padding: '1rem', borderBottom: '1px solid #ddd' }}>
      <NavLink to="/" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)} end>
        Tableau de bord
      </NavLink>
      <NavLink to="/clients" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Clients
      </NavLink>
      <NavLink to="/products" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Produits
      </NavLink>
      <NavLink to="/recommendations" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Recommandations
      </NavLink>
      <NavLink to="/campaigns" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Campagnes
      </NavLink>
      <NavLink to="/analytics" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Analytics
      </NavLink>
      <NavLink to="/audit" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Audit
      </NavLink>
      <NavLink to="/etl" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Ingestion
      </NavLink>
      <NavLink to="/runs" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Runs
      </NavLink>
      <NavLink to="/contacts" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Contacts
      </NavLink>
      <NavLink to="/config" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Paramètres
      </NavLink>

      <NavLink to="/clusters" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Segmentation
      </NavLink>
      <NavLink to="/review" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        Revue
      </NavLink>
      <NavLink to="/rfm" style={({ isActive }) => (isActive ? { ...linkStyle, ...activeStyle } : linkStyle)}>
        RFM
      </NavLink>
      <button onClick={onLogout} style={{ float: 'right' }}>
        Déconnexion
      </button>
    </nav>
  );
}