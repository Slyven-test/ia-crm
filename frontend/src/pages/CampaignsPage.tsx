import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

export default function CampaignsPage() {
  const [runs, setRuns] = useState<Array<{ run_id: string }>>([]);
  const [runId, setRunId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [batchSize, setBatchSize] = useState(200);
  const [segment, setSegment] = useState('');
  const [cluster, setCluster] = useState('');
  const [preview, setPreview] = useState<any[]>([]);
  const [counts, setCounts] = useState<{ n_selected: number; n_in_batch: number } | null>(null);
  const [sendResult, setSendResult] = useState<any | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchRuns = async () => {
    try {
      const resp = await axios.get(`${API_BASE_URL}/reco/runs?limit=20`, { headers: authHeaders });
      setRuns(resp.data);
      if (resp.data.length > 0 && !runId) setRunId(resp.data[0].run_id);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const previewBatch = async () => {
    if (!templateId) return;
    setMessage(null);
    setSendResult(null);
    try {
      const resp = await axios.post(
        `${API_BASE_URL}/campaigns/preview`,
        {
          run_id: runId || undefined,
          template_id: templateId,
          batch_size: batchSize,
          preview_only: true,
          segment: segment || undefined,
          cluster: cluster || undefined,
        },
        { headers: authHeaders }
      );
      setPreview(resp.data.preview || []);
      setCounts({ n_selected: resp.data.n_selected, n_in_batch: resp.data.n_in_batch });
      setSendResult(resp.data.result);
      setMessage(`Prévisualisation prête (${resp.data.n_in_batch}/${resp.data.n_selected})`);
    } catch (err: any) {
      setMessage(err?.response?.data?.detail || 'Erreur lors de la prévisualisation');
    }
  };

  const sendBatch = async () => {
    if (!templateId) return;
    setMessage(null);
    try {
      const resp = await axios.post(
        `${API_BASE_URL}/campaigns/send`,
        {
          run_id: runId || undefined,
          template_id: templateId,
          batch_size: batchSize,
          preview_only: false,
          segment: segment || undefined,
          cluster: cluster || undefined,
        },
        { headers: authHeaders }
      );
      setPreview(resp.data.preview || []);
      setCounts({ n_selected: resp.data.n_selected, n_in_batch: resp.data.n_in_batch });
      setSendResult(resp.data.result);
      setMessage(`Batch ${resp.data.result?.dry_run ? 'simulé' : 'envoyé'} (contacts: ${resp.data.result?.count ?? resp.data.n_in_batch})`);
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
            Run (optionnel, sinon dernier run)
            <select value={runId} onChange={(e) => setRunId(e.target.value)} className="border w-full px-2 py-1 mt-1">
              <option value="">(dernier run)</option>
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
          <label className="block text-sm mb-2">
            Segment RFM (optionnel)
            <input className="border w-full px-2 py-1" value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="ex: Champions" />
          </label>
          <label className="block text-sm mb-2">
            Cluster (optionnel)
            <input className="border w-full px-2 py-1" value={cluster} onChange={(e) => setCluster(e.target.value)} placeholder="ex: CL1" />
          </label>
          <div className="flex gap-2">
            <button className="bg-gray-200 px-3 py-2 rounded" onClick={previewBatch}>Prévisualiser</button>
            <button className="bg-blue-600 text-white px-3 py-2 rounded" onClick={sendBatch}>Envoyer</button>
          </div>
        </div>
        <div className="border p-3 rounded">
          <h3 className="font-semibold mb-2">Prévisualisation (5 contacts)</h3>
          {counts && (
            <p className="text-sm text-gray-700 mb-2">
              Sélectionnés: {counts.n_selected} — Batch: {counts.n_in_batch}
            </p>
          )}
          {preview.length === 0 && <p className="text-sm text-gray-500">Aucune donnée. Lancez Prévisualiser.</p>}
          {preview.length > 0 && (
            <ul className="text-sm list-disc list-inside">
              {preview.map((p, idx) => (
                <li key={idx}>
                  {p.customer_code} — {p.email} — {p.name ?? '-'} {p.product_key ? `(${p.product_key}, ${p.scenario ?? '-'})` : ''}
                </li>
              ))}
            </ul>
          )}
          {sendResult && (
            <div className="mt-3 text-sm text-gray-700">
              <p>Dry run: {sendResult.dry_run ? 'oui' : 'non'}</p>
              {sendResult.api_calls !== undefined && <p>Appels API: {sendResult.api_calls}</p>}
            </div>
          )}
        </div>
      </div>
      {message && <p className="mt-2 text-red-600">{message}</p>}
    </div>
  );
}
