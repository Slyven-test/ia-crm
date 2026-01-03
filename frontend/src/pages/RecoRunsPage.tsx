import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface RunSummary {
  gating_rate?: number;
  total_clients?: number;
  total_recommendations?: number;
  scenario_counts?: Record<string, number>;
  top_errors?: [string, number][];
  gate_export?: boolean;
}

interface RunRow {
  id: number;
  run_id: string;
  started_at: string;
  dataset_version?: string;
  status?: string;
  summary?: { summary_json?: string };
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
  severity: string;
  rule_code: string;
  details_json?: string;
}

interface RunDetail {
  run: RunRow;
  summary?: RunSummary;
  next_actions: NextAction[];
  top_audit: AuditRow[];
}

export default function RecoRunsPage() {
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunDetail | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [topN, setTopN] = useState(5);
  const [silenceWindow, setSilenceWindow] = useState(7);

  const authHeader = { Authorization: `Bearer ${token}` };

  const fetchRuns = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/reco/runs`, { headers: authHeader });
      setRuns(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const loadRunDetail = async (runId: string) => {
    try {
      setLoadingRun(true);
      const resp = await axios.get<RunDetail>(`${apiUrl}/reco/runs/${runId}`, { headers: authHeader });
      setSelectedRun(resp.data);
    } catch (err) {
      console.error(err);
      setSelectedRun(null);
    } finally {
      setLoadingRun(false);
    }
  };

  const triggerRun = async () => {
    try {
      setCreatingRun(true);
      const resp = await axios.post<RunDetail>(
        `${apiUrl}/reco/run?top_n=${topN}&silence_window_days=${silenceWindow}`,
        {},
        { headers: authHeader }
      );
      setSelectedRun(resp.data);
      fetchRuns();
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingRun(false);
    }
  };

  const parseSummary = (run: RunRow): RunSummary | undefined => {
    if (run.summary?.summary_json) {
      try {
        return JSON.parse(run.summary.summary_json);
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const downloadExport = async (runId: string, kind: 'reco_output' | 'audit_output' | 'next_action_output' | 'run_summary') => {
    const endpoint = kind === 'run_summary' ? `run_summary.json` : `${kind}.csv`;
    const url = `${apiUrl}/export/runs/${runId}/${endpoint}`;
    const resp = await axios.get(url, { headers: authHeader, responseType: 'blob' });
    const blob = new Blob([resp.data]);
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = `${kind}_${runId}.${kind === 'run_summary' ? 'json' : 'csv'}`;
    link.click();
  };

  const renderScenarioCounts = (summary?: RunSummary) => {
    if (!summary?.scenario_counts) return <p className="text-sm text-gray-500">Aucune donnée</p>;
    return (
      <ul>
        {Object.entries(summary.scenario_counts).map(([scenario, count]) => (
          <li key={scenario}>{scenario}: {count}</li>
        ))}
      </ul>
    );
  };

  const renderTopErrors = (summary?: RunSummary) => {
    if (!summary?.top_errors || summary.top_errors.length === 0) return <p className="text-sm text-gray-500">Aucune alerte</p>;
    return (
      <ul>
        {summary.top_errors.map(([rule, count]) => (
          <li key={rule}>{rule}: {count}</li>
        ))}
      </ul>
    );
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Runs, gating et exports</h1>
      <div className="flex items-center gap-4 mb-4">
        <button
          className="bg-indigo-600 text-white px-4 py-2 rounded"
          onClick={triggerRun}
          disabled={creatingRun}
        >
          {creatingRun ? 'Run en cours…' : 'Lancer un run'}
        </button>
        <label className="text-sm">Top N
          <input
            className="border ml-2 px-2 py-1 w-16"
            type="number"
            min={1}
            max={20}
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
          />
        </label>
        <label className="text-sm">Silence (j)
          <input
            className="border ml-2 px-2 py-1 w-16"
            type="number"
            min={1}
            max={60}
            value={silenceWindow}
            onChange={(e) => setSilenceWindow(Number(e.target.value))}
          />
        </label>
      </div>

      <table className="min-w-full text-sm divide-y divide-gray-200 mb-6">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Run ID</th>
            <th className="px-2 py-1 text-left">Démarré</th>
            <th className="px-2 py-1 text-left">Dataset</th>
            <th className="px-2 py-1 text-left">Status</th>
            <th className="px-2 py-1 text-left">Gating</th>
            <th className="px-2 py-1 text-left"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {runs.map((r) => {
            const summary = parseSummary(r);
            return (
              <tr key={r.run_id} className={selectedRun?.run.run_id === r.run_id ? 'bg-gray-100' : ''}>
                <td className="px-2 py-1 whitespace-nowrap">{r.run_id}</td>
                <td className="px-2 py-1 whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
                <td className="px-2 py-1 whitespace-nowrap">{r.dataset_version ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{r.status ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">
                  {summary?.gating_rate !== undefined ? `${Math.round(summary.gating_rate * 100)}%` : '-'}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <button className="text-blue-600 underline" onClick={() => loadRunDetail(r.run_id)}>
                    Détails
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {loadingRun && <p>Chargement du run…</p>}
      {selectedRun && !loadingRun && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border p-3 rounded">
            <h2 className="font-semibold mb-2">Résumé</h2>
            <p>Run: {selectedRun.run.run_id}</p>
            <p>Clients: {selectedRun.summary?.total_clients ?? 'N/A'}</p>
            <p>Recommandations: {selectedRun.summary?.total_recommendations ?? 'N/A'}</p>
            <p>Gating rate: {selectedRun.summary?.gating_rate !== undefined ? `${Math.round((selectedRun.summary.gating_rate || 0) * 100)}%` : 'N/A'}</p>
            <p>Gate export: {selectedRun.summary?.gate_export ? 'OK' : 'Non'}</p>
          </div>
          <div className="border p-3 rounded">
            <h2 className="font-semibold mb-2">Counts par scénario</h2>
            {renderScenarioCounts(selectedRun.summary)}
          </div>
          <div className="border p-3 rounded">
            <h2 className="font-semibold mb-2">Top erreurs audit</h2>
            {renderTopErrors(selectedRun.summary)}
          </div>
        </div>
      )}

      {selectedRun && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">QC : top 20 pires scores</h3>
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
              {selectedRun.next_actions.map((na) => (
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
          <div className="mb-4">
            <h3 className="font-semibold mb-2">Infractions audit</h3>
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 py-1 text-left">Client</th>
                  <th className="px-2 py-1 text-left">Règle</th>
                  <th className="px-2 py-1 text-left">Severité</th>
                  <th className="px-2 py-1 text-left">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {selectedRun.top_audit.map((row) => (
                  <tr key={row.id}>
                    <td className="px-2 py-1">{row.customer_code}</td>
                    <td className="px-2 py-1">{row.rule_code}</td>
                    <td className="px-2 py-1">{row.severity}</td>
                    <td className="px-2 py-1 whitespace-pre-wrap">{row.details_json ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-3">
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport(selectedRun.run.run_id, 'reco_output')}>
              Export reco_output.csv
            </button>
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport(selectedRun.run.run_id, 'audit_output')}>
              Export audit_output.csv
            </button>
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport(selectedRun.run.run_id, 'next_action_output')}>
              Export next_action_output.csv
            </button>
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={() => downloadExport(selectedRun.run.run_id, 'run_summary')}>
              Export run_summary.json
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
