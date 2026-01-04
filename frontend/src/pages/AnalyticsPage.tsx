import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface Overview {
  total_clients: number;
  active_clients: number;
  churn_rate: number;
  total_revenue: number;
  average_order_value: number;
  recommendation_count: number;
}

interface TrendPoint {
  period: string;
  revenue: number;
}

interface Outcomes {
  emails_sent: number;
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
  conversion_rate: number;
}

export default function AnalyticsPage() {
  const apiUrl = API_BASE_URL;
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);

  const fetchData = async () => {
    try {
      const [ovRes, trendRes, outRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/analytics/overview`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/analytics/sales-trend?period=month`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/analytics/outcomes`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      setOverview(ovRes.data);
      setTrend(trendRes.data);
      setOutcomes(outRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Analytics</h1>
      {overview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-semibold">Total clients</h3>
            <p className="text-2xl">{overview.total_clients}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-semibold">Clients actifs</h3>
            <p className="text-2xl">{overview.active_clients}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-semibold">Taux de churn</h3>
            <p className="text-2xl">{(overview.churn_rate * 100).toFixed(1)}%</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-semibold">Revenu total (€)</h3>
            <p className="text-2xl">{overview.total_revenue.toFixed(2)}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-semibold">Panier moyen (€)</h3>
            <p className="text-2xl">{overview.average_order_value.toFixed(2)}</p>
          </div>
          <div className="bg-white shadow rounded p-4">
            <h3 className="text-lg font-semibold">Recommandations</h3>
            <p className="text-2xl">{overview.recommendation_count}</p>
          </div>
        </div>
      )}
      {outcomes && (
        <>
          <h2 className="text-2xl font-bold mb-2">Métriques marketing</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white shadow rounded p-4">
              <h3 className="text-lg font-semibold">E‑mails envoyés</h3>
              <p className="text-2xl">{outcomes.emails_sent}</p>
            </div>
            <div className="bg-white shadow rounded p-4">
              <h3 className="text-lg font-semibold">Taux d'ouverture</h3>
              <p className="text-2xl">{(outcomes.open_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white shadow rounded p-4">
              <h3 className="text-lg font-semibold">Taux de clic</h3>
              <p className="text-2xl">{(outcomes.click_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white shadow rounded p-4">
              <h3 className="text-lg font-semibold">Taux de désabonnement</h3>
              <p className="text-2xl">{(outcomes.unsubscribe_rate * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white shadow rounded p-4">
              <h3 className="text-lg font-semibold">Taux de conversion</h3>
              <p className="text-2xl">{(outcomes.conversion_rate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </>
      )}
      <h2 className="text-2xl font-bold mb-2">Tendance des ventes</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Période</th>
              <th className="px-2 py-1 text-left">Revenu (€)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {trend.map((t) => (
              <tr key={t.period}>
                <td className="px-2 py-1 whitespace-nowrap">{t.period}</td>
                <td className="px-2 py-1 whitespace-nowrap">{t.revenue.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
