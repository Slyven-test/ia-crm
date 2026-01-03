import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Recommendation {
  id: number;
  client_code: string;
  product_key: string;
  score: number;
  scenario?: string;
  is_approved?: boolean;
}

export default function ReviewPage() {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const fetchRecommendations = async () => {
    try {
      const response = await axios.get<Recommendation[]>(`${apiUrl}/recommendations/`, {
        headers: authHeaders,
      });
      // Ne conserver que les recommandations non approuvées
      setRecs(response.data.filter((r) => !r.is_approved));
    } catch (err) {
      setMessage('Erreur lors du chargement des recommandations');
      console.error(err);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const approveSelected = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    setMessage(null);
    try {
      await axios.post(
        `${apiUrl}/recommendations/approve`,
        { reco_ids: Array.from(selected) },
        { headers: authHeaders }
      );
      setSelected(new Set());
      await fetchRecommendations();
      setMessage('Recommandations approuvées');
    } catch (err) {
      setMessage('Erreur lors de l’approbation');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Revue des Recommandations</h1>
      <div className="mb-4">
        <button
          onClick={approveSelected}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={loading || selected.size === 0}
        >
          Approuver la sélection
        </button>
      </div>
      {message && <p className="mb-2 text-sm text-gray-700">{message}</p>}
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left"></th>
            <th className="px-2 py-1 text-left">Client</th>
            <th className="px-2 py-1 text-left">Produit</th>
            <th className="px-2 py-1 text-left">Score</th>
            <th className="px-2 py-1 text-left">Scénario</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {recs.map((r) => (
            <tr key={r.id}>
              <td className="px-2 py-1 text-center">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                />
              </td>
              <td className="px-2 py-1 whitespace-nowrap">{r.client_code}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.product_key}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.score.toFixed(2)}</td>
              <td className="px-2 py-1 whitespace-nowrap">{r.scenario ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}