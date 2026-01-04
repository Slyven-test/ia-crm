import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

export default function ExportPage() {
  const token = localStorage.getItem('token');
  const [runId, setRunId] = useState<string | null>(null);

  const authHeader = { Authorization: `Bearer ${token}` };

  const fetchLatestRun = async () => {
    try {
      const resp = await axios.get(`${API_BASE_URL}/reco/runs?limit=1`, { headers: authHeader });
      if (resp.data && resp.data.length > 0) {
        setRunId(resp.data[0].run_id);
      } else {
        setRunId(null);
      }
    } catch (err) {
      console.error(err);
      setRunId(null);
    }
  };

  useEffect(() => {
    fetchLatestRun();
  }, []);

  const downloadExport = async (kind: 'reco_output' | 'audit_output' | 'next_action_output' | 'run_summary') => {
    if (!runId) return;
    const endpoint = kind === 'run_summary' ? `run_summary.json` : `${kind}.csv`;
    const url = `${API_BASE_URL}/export/runs/${runId}/${endpoint}`;
    const resp = await axios.get(url, { headers: authHeader, responseType: 'blob' });
    const blob = new Blob([resp.data]);
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `${kind}_${runId}.${kind === 'run_summary' ? 'json' : 'csv'}`;
    link.click();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Exports</h1>
      {!runId && <p>Aucun run trouvé. Lancez un run de recommandations avant d’exporter.</p>}
      {runId && (
        <>
          <p className="mb-3 text-gray-700">Dernier run: <strong>{runId}</strong></p>
          <div className="flex flex-wrap gap-3">
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport('reco_output')}>
              Export reco_output.csv
            </button>
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport('audit_output')}>
              Export audit_output.csv
            </button>
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport('next_action_output')}>
              Export next_action_output.csv
            </button>
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport('run_summary')}>
              Export run_summary.json
            </button>
          </div>
        </>
      )}
    </div>
  );
}
