import React, { useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface Recommendation {
  id: number;
  client_code: string;
  product_key: string;
  score: number;
  scenario?: string;
  created_at: string;
}

export default function RecommendationsPage() {
  const [clientCode, setClientCode] = useState('');
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const token = localStorage.getItem('token');

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const generateRecs = async () => {
    setMessage(null);
    try {
      setLoading(true);
      const response = await axios.post<Recommendation[]>(
        `${API_BASE_URL}/recommendations/generate`,
        {},
        { headers: authHeaders }
      );
      setRecs(response.data);
      setMessage(`Généré ${response.data.length} recommandations`);
    } catch (err) {
      setMessage('Erreur lors de la génération des recommandations');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRecs = async () => {
    try {
      setLoading(true);
      const response = await axios.get<Recommendation[]>(`${API_BASE_URL}/recommendations/`, {
        headers: authHeaders,
      });
      setRecs(response.data);
      setMessage(null);
    } catch (err) {
      setMessage('Erreur lors du chargement des recommandations');
    } finally {
      setLoading(false);
    }
  };

  const fetchClientRecs = async () => {
    if (!clientCode) return;
    setMessage(null);
    try {
      setLoading(true);
      const response = await axios.get<Recommendation[]>(
        `${API_BASE_URL}/recommendations/client/${encodeURIComponent(clientCode)}`,
        { headers: authHeaders }
      );
      setRecs(response.data);
    } catch (err) {
      setMessage('Aucune recommandation trouvée ou erreur');
      setRecs([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-3xl font-bold mb-4">Recommandations</h2>
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={generateRecs}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Générer des recommandations
        </button>
        <button
          onClick={fetchAllRecs}
          className="bg-blue-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Rafraîchir toutes les recommandations
        </button>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Code client"
            value={clientCode}
            onChange={(e) => setClientCode(e.target.value)}
            className="border px-2 py-1 rounded"
          />
          <button
            onClick={fetchClientRecs}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            Recos client
          </button>
        </div>
      </div>
      {message && <p className="mb-2 text-sm text-gray-700">{message}</p>}
      {recs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">Client</th>
                <th className="px-2 py-1 text-left">Produit</th>
                <th className="px-2 py-1 text-left">Score</th>
                <th className="px-2 py-1 text-left">Scénario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recs.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1 whitespace-nowrap">{r.client_code}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.product_key}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.score.toFixed(2)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.scenario ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
