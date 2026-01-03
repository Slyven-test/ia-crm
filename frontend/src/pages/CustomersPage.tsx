import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface Client {
  id: number;
  client_code: string;
  name?: string;
  email?: string;
  last_purchase_date?: string;
  total_spent?: number;
  total_orders?: number;
  average_order_value?: number;
  recency?: number;
  frequency?: number;
  monetary?: number;
  rfm_score?: number;
  rfm_segment?: string;
  preferred_families?: string;
  budget_band?: string;
  cluster?: string;
}

export default function CustomersPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');

  const fetchClients = async () => {
    try {
      setLoading(true);
      const resp = await axios.get(`${apiUrl}/clients/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(resp.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const runRfm = async () => {
    try {
      setLoading(true);
      await axios.post(
        `${apiUrl}/rfm/run`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchClients();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Clients</h1>
      <button
        onClick={runRfm}
        className="mb-4 bg-blue-500 text-white px-4 py-2 rounded"
        disabled={loading}
      >
        {loading ? 'Calcul en cours…' : 'Recalculer RFM'}
      </button>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Code</th>
              <th className="px-2 py-1 text-left">Nom</th>
              <th className="px-2 py-1 text-left">Email</th>
              <th className="px-2 py-1 text-left">Segment</th>
              <th className="px-2 py-1 text-left">Total dépensé</th>
              <th className="px-2 py-1 text-left">Commandes</th>
              <th className="px-2 py-1 text-left">Panier moyen</th>
              <th className="px-2 py-1 text-left">Budget</th>
              <th className="px-2 py-1 text-left">Familles préférées</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1 whitespace-nowrap">{c.client_code}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.name ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.email ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.rfm_segment ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.total_spent?.toFixed(2) ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.total_orders ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.average_order_value?.toFixed(2) ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.budget_band ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{c.preferred_families ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
