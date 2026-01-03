import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface RunSummary {
  gating_rate?: number;
  total_clients?: number;
  total_recommendations?: number;
  scenario_counts?: Record<string, number>;
}

interface NextAction {
  id: number;
  customer_code: string;
  eligible: boolean;
  reason?: string;
  scenario?: string;
  audit_score?: number;
}

interface AuditRow {
  id: number;
  customer_code: string;
  rule_code: string;
  severity: string;
  details_json?: string;
}

interface RunDetail {
  run: { run_id: string };
  summary?: RunSummary;
  next_actions: NextAction[];
  top_audit: AuditRow[];
}

export default function AuditPage() {
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchLatestRun = async () => {
    try {
      setLoading(true);
      const runs = await axios.get(`${apiUrl}/reco/runs?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!runs.data || runs.data.length === 0) {
        setDetail(null);
        return;
      }
      const runId = runs.data[0].run_id;
      const resp = await axios.get(`${apiUrl}/reco/runs/${runId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDetail(resp.data);
    } catch (err) {
      console.error(err);
      setDetail(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestRun();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">QC & Audit</h1>
      <p className="mb-4 text-gray-700">Top 20 clients les plus risqués du dernier run (gating, règles audit).</p>
      {loading && <p>Chargement…</p>}
      {!loading && !detail && <p>Aucun run disponible.</p>}
      {!loading && detail && (
        <>
          <div className="mb-4 border p-3 rounded">
            <p><strong>Run:</strong> {detail.run.run_id}</p>
            <p><strong>Gating rate:</strong> {detail.summary?.gating_rate !== undefined ? `${Math.round((detail.summary.gating_rate || 0) * 100)}%` : 'N/A'}</p>
            <p><strong>Total clients:</strong> {detail.summary?.total_clients ?? 'N/A'}</p>
            <p><strong>Recommandations:</strong> {detail.summary?.total_recommendations ?? 'N/A'}</p>
          </div>
          <h2 className="text-xl font-semibold mb-2">Next actions (top 20 pires scores)</h2>
          <table className="min-w-full text-sm divide-y divide-gray-200 mb-4">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">Client</th>
                <th className="px-2 py-1 text-left">Scenario</th>
                <th className="px-2 py-1 text-left">Score audit</th>
                <th className="px-2 py-1 text-left">Éligible</th>
                <th className="px-2 py-1 text-left">Raison</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detail.next_actions.map((na) => (
                <tr key={na.id}>
                  <td className="px-2 py-1">{na.customer_code}</td>
                  <td className="px-2 py-1">{na.scenario ?? '-'}</td>
                  <td className="px-2 py-1">{na.audit_score?.toFixed(1) ?? '-'}</td>
                  <td className="px-2 py-1">{na.eligible ? 'Oui' : 'Non'}</td>
                  <td className="px-2 py-1">{na.reason ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="text-xl font-semibold mb-2">Infractions audit</h2>
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">Client</th>
                <th className="px-2 py-1 text-left">Règle</th>
                <th className="px-2 py-1 text-left">Sévérité</th>
                <th className="px-2 py-1 text-left">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detail.top_audit.map((row) => (
                <tr key={row.id}>
                  <td className="px-2 py-1">{row.customer_code}</td>
                  <td className="px-2 py-1">{row.rule_code}</td>
                  <td className="px-2 py-1">{row.severity}</td>
                  <td className="px-2 py-1 whitespace-pre-wrap">{row.details_json ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
