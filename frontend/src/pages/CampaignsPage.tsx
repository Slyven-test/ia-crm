import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface RunOption {
  run_id: string;
}

interface BrevoLog {
  id: number;
  action: string;
  status: string;
  created_at?: string;
  payload_redacted?: string;
}

export default function CampaignsPage() {
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [runId, setRunId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [batchSize, setBatchSize] = useState(200);
  const [logs, setLogs] = useState<BrevoLog[]>([]);
  const [preview, setPreview] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchRuns = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/reco/runs?limit=20`, { headers: authHeaders });
      setRuns(resp.data);
      if (resp.data.length > 0 && !runId) setRunId(resp.data[0].run_id);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLogs = async (selectedRun?: string) => {
    if (!selectedRun) return;
    try {
      const resp = await axios.get(`${apiUrl}/brevo/logs?run_id=${encodeURIComponent(selectedRun)}`, { headers: authHeaders });
      setLogs(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  useEffect(() => {
    if (runId) fetchLogs(runId);
  }, [runId]);

  const prepareBatch = async () => {
    if (!runId || !templateId) return;
    setMessage(null);
    try {
      const resp = await axios.post(
        `${apiUrl}/brevo/send_batch`,
        { run_id: runId, template_id: templateId, batch_size: batchSize, dry_run: true, preview_only: true },
        { headers: authHeaders }
      );
      setPreview(resp.data.preview || []);
      setMessage(`Préparation OK (dry-run) pour ${resp.data.count} contacts`);
      fetchLogs(runId);
    } catch (err: any) {
      setMessage(err?.response?.data?.detail || 'Erreur lors de la préparation');
    }
  };

  const sendBatch = async (real: boolean) => {
    if (!runId || !templateId) return;
    setMessage(null);
    try {
      const resp = await axios.post(
        `${apiUrl}/brevo/send_batch`,
        { run_id: runId, template_id: templateId, batch_size: batchSize, dry_run: !real, preview_only: false },
        { headers: authHeaders }
      );
      setPreview(resp.data.preview || []);
      setMessage(`Batch ${resp.data.dry_run ? 'simulé' : 'envoyé'} (contacts: ${resp.data.count})`);
      fetchLogs(runId);
    } catch (err: any) {
      setMessage(err?.response?.data?.detail || 'Erreur lors de l’envoi');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Campagnes (Brevo)</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="border p-3 rounded">
          <h3 className="font-semibold mb-2">Paramétrage batch</h3>
          <label className="block text-sm mb-2">
            Run
            <select value={runId} onChange={(e) => setRunId(e.target.value)} className="border w-full px-2 py-1 mt-1">
              {runs.map((r) => (
                <option key={r.run_id} value={r.run_id}>{r.run_id}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm mb-2">
            Template ID
            <input className="border w-full px-2 py-1" value={templateId} onChange={(e) => setTemplateId(e.target.value)} />
          </label>
          <label className="block text-sm mb-2">
            Taille lot (200-300)
            <input className="border w-full px-2 py-1" type="number" min={200} max={300} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
          </label>
          <div className="flex gap-2">
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={prepareBatch}>Prepare (Dry-run)</button>
            <button className="bg-green-600 text-white px-3 py-2 rounded" onClick={() => sendBatch(false)}>Send (Dry-run)</button>
            <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={() => sendBatch(true)}>Send (REAL)</button>
          </div>
        </div>
        <div className="border p-3 rounded">
          <h3 className="font-semibold mb-2">Prévisualisation (5 contacts)</h3>
          {preview.length === 0 && <p className="text-sm text-gray-500">Aucune donnée. Lancez Prepare ou Send.</p>}
          {preview.length > 0 && (
            <ul className="text-sm list-disc list-inside">
              {preview.map((p, idx) => (
                <li key={idx}>{p.customer_code} — {p.email} — {p.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border p-3 rounded mb-4">
        <h3 className="font-semibold mb-2">Logs Brevo</h3>
        {logs.length === 0 && <p className="text-sm text-gray-500">Aucun log pour ce run.</p>}
        {logs.length > 0 && (
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1 text-left">Action</th>
                <th className="px-2 py-1 text-left">Statut</th>
                <th className="px-2 py-1 text-left">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-2 py-1">{log.action}</td>
                  <td className="px-2 py-1">{log.status}</td>
                  <td className="px-2 py-1">{log.created_at ? new Date(log.created_at).toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {message && <p className="mt-2 text-red-600">{message}</p>}
    </div>
  );
}
