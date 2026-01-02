import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Distribution {
  [segment: string]: number;
}

export default function RfmPage() {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('token');
  const [distribution, setDistribution] = useState<Distribution>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');

  const fetchDistribution = async () => {
    try {
      const res = await axios.get(`${apiUrl}/rfm/distribution`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDistribution(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDistribution();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runRfm = async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.post(
        `${apiUrl}/rfm/run`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      setMessage(res.data.message || 'Analyse RFM lancée');
      // Actualiser la distribution avec le résultat renvoyé si présent
      if (res.data.distribution) {
        setDistribution(res.data.distribution);
      } else {
        // Sinon, refetch
        fetchDistribution();
      }
    } catch (err) {
      console.error(err);
      setMessage('Erreur lors de l’exécution de l’analyse RFM');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Analyse RFM</h1>
      <p className="mb-4">Cette page vous permet de recalculer les scores RFM et de consulter la distribution des segments pour le locataire courant.</p>
      <button
        onClick={runRfm}
        disabled={loading}
        className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? 'Calcul en cours…' : 'Lancer l’analyse RFM'}
      </button>
      {message && <p className="mt-2 text-green-600">{message}</p>}
      <h2 className="text-2xl font-bold mt-6 mb-2">Distribution des segments RFM</h2>
      {Object.keys(distribution).length > 0 ? (
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Segment</th>
              <th className="px-2 py-1 text-left">Nombre de clients</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Object.entries(distribution).map(([segment, count]) => (
              <tr key={segment}>
                <td className="px-2 py-1 whitespace-nowrap">{segment}</td>
                <td className="px-2 py-1 whitespace-nowrap">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>Aucune donnée disponible.</p>
      )}
    </div>
  );
}