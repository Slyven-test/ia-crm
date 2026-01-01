import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface AuditLog {
  executed_at: string;
  errors: number;
  warnings: number;
  score: number;
  details: string;
}

export default function AuditPage() {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('token');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [running, setRunning] = useState<boolean>(false);

  const fetchLogs = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/audit/latest?limit=5`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setLogs(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  const runAudit = async () => {
    try {
      setRunning(true);
      await axios.post(
        `${apiUrl}/audit/run`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchLogs();
    } catch (err) {
      console.error(err);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Audit de Qualité</h1>
      <button
        className="mb-4 bg-indigo-600 text-white px-4 py-2 rounded"
        onClick={runAudit}
        disabled={running}
      >
        {running ? 'Audit en cours…' : 'Lancer un audit'}
      </button>
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Date</th>
            <th className="px-2 py-1 text-left">Erreurs</th>
            <th className="px-2 py-1 text-left">Avertissements</th>
            <th className="px-2 py-1 text-left">Score</th>
            <th className="px-2 py-1 text-left">Détails</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {logs.map((log, idx) => (
            <tr key={idx}>
              <td className="px-2 py-1 whitespace-nowrap">{new Date(log.executed_at).toLocaleString()}</td>
              <td className="px-2 py-1 whitespace-nowrap">{log.errors}</td>
              <td className="px-2 py-1 whitespace-nowrap">{log.warnings}</td>
              <td className="px-2 py-1 whitespace-nowrap">{log.score.toFixed(2)}</td>
              <td className="px-2 py-1 whitespace-pre-line">{log.details}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}