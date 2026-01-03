import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface ETLState {
  last_run_at: string | null;
  results: any;
}

export default function ETLPage() {
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const [loading, setLoading] = useState(false);
  const [tenantsInput, setTenantsInput] = useState('');
  const [isolateSchema, setIsolateSchema] = useState(false);
  const [etlState, setEtlState] = useState<ETLState | null>(null);

  const fetchState = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/etl/state`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEtlState(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  const runETL = async () => {
    try {
      setLoading(true);
      // parse tenants input: comma-separated; if empty, default to ["default"]
      const tenantsList = tenantsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const body = {
        tenants: tenantsList.length > 0 ? tenantsList : ['default'],
        isolate_schema: isolateSchema,
      };
      await axios.post(`${apiUrl}/etl/ingest`, body, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // refresh state after a short delay to give time for background task
      setTimeout(() => {
        fetchState();
      }, 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Ingestion (ETL)</h1>
      <div className="mb-4">
        <label className="block text-sm mb-1">Locataires (séparés par des virgules) :</label>
        <input
          type="text"
          value={tenantsInput}
          onChange={(e) => setTenantsInput(e.target.value)}
          className="border px-2 py-1 w-full max-w-md"
          placeholder="ex: ruhlmann,valentinr"
        />
        <div className="mt-2 flex items-center">
          <input
            id="isolateCheckbox"
            type="checkbox"
            checked={isolateSchema}
            onChange={(e) => setIsolateSchema(e.target.checked)}
            className="mr-2"
          />
          <label htmlFor="isolateCheckbox">Isoler les schémas/tables par tenant</label>
        </div>
        <button
          onClick={runETL}
          disabled={loading}
          className="mt-2 bg-blue-600 text-white px-4 py-2 rounded"
        >
          {loading ? 'Lancement…' : 'Lancer le pipeline ETL'}
        </button>
      </div>
      <div>
        <h2 className="text-xl font-bold mb-2">État du dernier run</h2>
        {etlState ? (
          <div className="border p-3 bg-gray-50 rounded">
            <p>
              <strong>Dernier run :</strong> {etlState.last_run_at || 'Jamais exécuté'}
            </p>
            {etlState.results && etlState.results.length > 0 && (
              <pre className="mt-2 whitespace-pre-wrap text-xs bg-white p-2 border rounded overflow-auto max-h-64">
                {JSON.stringify(etlState.results, null, 2)}
              </pre>
            )}
          </div>
        ) : (
          <p>Aucun état disponible.</p>
        )}
      </div>
    </div>
  );
}
