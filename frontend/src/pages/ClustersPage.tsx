import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface Distribution {
  [cluster: string]: number;
}

export default function ClustersPage() {
  const [distribution, setDistribution] = useState<Distribution>({});
  const [nClusters, setNClusters] = useState<number>(4);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const apiUrl = API_BASE_URL;
  const token = localStorage.getItem('token');

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const fetchDistribution = async () => {
    try {
      const res = await axios.get<Distribution>(`${apiUrl}/clusters/`, {
        headers: authHeaders,
      });
      setDistribution(res.data);
    } catch (err) {
      setMessage('Erreur lors du chargement des clusters');
      console.error(err);
    }
  };

  const recomputeClusters = async () => {
    if (nClusters < 2) {
      setMessage('Le nombre de clusters doit être au moins 2');
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      await axios.post<Distribution>(
        `${apiUrl}/clusters/recompute?n_clusters=${nClusters}`,
        {},
        {
          headers: authHeaders,
        }
      );
      await fetchDistribution();
      setMessage('Clusters recalculés');
    } catch (err) {
      setMessage('Erreur lors du recalcul des clusters');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDistribution();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Segmentation (Clusters)</h1>
      <div className="mb-4 flex items-center gap-2">
        <label htmlFor="nclusters">Nombre de clusters : </label>
        <input
          id="nclusters"
          type="number"
          min={2}
          value={nClusters}
          onChange={(e) => setNClusters(parseInt(e.target.value, 10))}
          className="border px-2 py-1 w-20"
        />
        <button
          onClick={recomputeClusters}
          className="bg-green-600 text-white px-4 py-2 rounded"
          disabled={loading}
        >
          Recalculer
        </button>
      </div>
      {message && <p className="mb-2 text-sm text-gray-700">{message}</p>}
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Cluster</th>
            <th className="px-2 py-1 text-left">Nombre de clients</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {Object.entries(distribution).map(([cluster, count]) => (
            <tr key={cluster}>
              <td className="px-2 py-1 whitespace-nowrap">{cluster}</td>
              <td className="px-2 py-1 whitespace-nowrap">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
