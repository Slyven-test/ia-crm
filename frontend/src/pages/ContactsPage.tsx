import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface ContactEvent {
  id: number;
  client_id: number;
  contact_date: string;
  channel?: string;
  status?: string;
  campaign_id?: number;
}

export default function ContactsPage() {
  const apiUrl = API_BASE_URL;
  const token = localStorage.getItem('token');
  const [events, setEvents] = useState<ContactEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientCodeFilter, setClientCodeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const fetchEvents = async () => {
    try {
      setLoading(true);
      // Build query params
      const params: any = {};
      if (clientCodeFilter.trim().length > 0) {
        params.client_code = clientCodeFilter.trim();
      }
      if (statusFilter.trim().length > 0) {
        params.status = statusFilter.trim();
      }
      const resp = await axios.get(`${apiUrl}/contacts`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      setEvents(resp.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Événements de contact</h1>
      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm mb-1">Filtrer par code client :</label>
          <input
            type="text"
            value={clientCodeFilter}
            onChange={(e) => setClientCodeFilter(e.target.value)}
            className="border px-2 py-1"
          />
        </div>
        <div>
          <label className="block text-sm mb-1">Filtrer par statut :</label>
          <input
            type="text"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border px-2 py-1"
            placeholder="delivered, open, click…"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchEvents}
            className="bg-blue-500 text-white px-4 py-2 rounded"
            disabled={loading}
          >
            {loading ? 'Chargement…' : 'Rechercher'}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Date</th>
              <th className="px-2 py-1 text-left">Client ID</th>
              <th className="px-2 py-1 text-left">Canal</th>
              <th className="px-2 py-1 text-left">Statut</th>
              <th className="px-2 py-1 text-left">Campagne ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((ev) => (
              <tr key={ev.id}>
                <td className="px-2 py-1 whitespace-nowrap">
                  {new Date(ev.contact_date).toLocaleString()}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{ev.client_id}</td>
                <td className="px-2 py-1 whitespace-nowrap">{ev.channel ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{ev.status ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{ev.campaign_id ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
