import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface RecoRun {
  id: number;
  executed_at: string;
  dataset_version?: string;
  config_hash?: string;
  code_version?: string;
  status?: string;
}

interface RecoItem {
  id: number;
  client_id: number;
  product_id: number;
  scenario?: string;
  rank?: number;
  score?: number;
}

export default function RecoRunsPage() {
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const [runs, setRuns] = useState<RecoRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [items, setItems] = useState<RecoItem[]>([]);
  const [clientIdFilter, setClientIdFilter] = useState('');
  const [loadingItems, setLoadingItems] = useState(false);

  const fetchRuns = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/reco-runs/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRuns(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const viewItems = async (runId: number) => {
    try {
      setSelectedRunId(runId);
      setLoadingItems(true);
      let url = `${apiUrl}/reco-runs/${runId}/items`;
      if (clientIdFilter.trim().length > 0) {
        url += `?client_id=${encodeURIComponent(clientIdFilter.trim())}`;
      }
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(resp.data);
    } catch (err) {
      console.error(err);
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Historique des runs de recommandations</h1>
      <div className="mb-4">
        <label className="text-sm mr-2">Filtrer par client ID :</label>
        <input
          type="text"
          value={clientIdFilter}
          onChange={(e) => setClientIdFilter(e.target.value)}
          className="border px-2 py-1 mr-2"
        />
      </div>
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">ID</th>
            <th className="px-2 py-1 text-left">Exécuté le</th>
            <th className="px-2 py-1 text-left">Version dataset</th>
            <th className="px-2 py-1 text-left">Version code</th>
            <th className="px-2 py-1 text-left">Status</th>
            <th className="px-2 py-1 text-left"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((r) => (
            <tr key={r.id} className={selectedRunId === r.id ? 'bg-gray-100' : ''}>
              <td className="px-2 py-1 whitespace-nowrap">{r.id}</td>
              <td className="px-2 py-1 whitespace-nowrap">{new Date(r.executed_at).toLocaleString()}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.dataset_version ?? '-'}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.code_version ?? '-'}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.status ?? '-'}</td>
              <td className="px-2 py-1 whitespace-nowrap">
                <button
                  onClick={() => viewItems(r.id)}
                  className="text-blue-600 underline"
                >
                  Voir items
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedRunId && (
        <div className="mt-6">
          <h2 className="text-xl font-bold mb-2">
            Items du run #{selectedRunId}
          </h2>
          {loadingItems ? (
            <p>Chargement des items…</p>
          ) : items.length === 0 ? (
            <p>Aucun item trouvé.</p>
          ) : (
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left">Client ID</th>
                  <th className="px-2 py-1 text-left">Produit ID</th>
                  <th className="px-2 py-1 text-left">Scenario</th>
                  <th className="px-2 py-1 text-left">Rang</th>
                  <th className="px-2 py-1 text-left">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="px-2 py-1 whitespace-nowrap">{it.client_id}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{it.product_id}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{it.scenario ?? '-'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{it.rank ?? '-'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{it.score?.toFixed(3) ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}