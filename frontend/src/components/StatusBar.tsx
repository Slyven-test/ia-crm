import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface Health {
  status: string;
  db?: boolean;
}

export default function StatusBar() {
  const apiUrl = API_BASE_URL;
  const token = localStorage.getItem('token');
  const [health, setHealth] = useState<Health | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const [healthResp, runsResp] = await Promise.all([
          axios.get(`${apiUrl}/health`),
          token ? axios.get(`${apiUrl}/reco/runs?limit=1`, { headers }) : Promise.resolve({ data: [] }),
        ]);
        setHealth(healthResp.data);
        if (runsResp.data && runsResp.data.length > 0) {
          setLastRun(runsResp.data[0].run_id || runsResp.data[0].id);
        }
      } catch (err) {
        setHealth({ status: 'down', db: false });
      }
    };
    fetchStatus();
  }, []);

  return (
    <div style={{ padding: '0.5rem 1rem', backgroundColor: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: '0.9rem' }}>
      <span>
        Backend: <strong>{health ? health.status : '...'}</strong>{' '}
        {health && health.db !== undefined && `(DB ${health.db ? 'ok' : 'down'})`}
      </span>
      {lastRun && <span style={{ marginLeft: '1rem' }}>Dernier run: {lastRun}</span>}
    </div>
  );
}
