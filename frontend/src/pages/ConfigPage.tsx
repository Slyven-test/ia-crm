import React, { useEffect, useState } from 'react';
import axios from 'axios';
import API_BASE_URL from '../lib/apiBase';

interface ConfigSetting {
  id: number;
  tenant_id: number;
  key: string;
  value: string;
  description?: string | null;
}

export default function ConfigPage() {
  const apiUrl = API_BASE_URL;
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const [settings, setSettings] = useState<ConfigSetting[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [newValue, setNewValue] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchSettings = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/config/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSettings(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const startEdit = (setting: ConfigSetting) => {
    setEditingKey(setting.key);
    setNewValue(setting.value ?? '');
    setNewDescription(setting.description ?? '');
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setNewValue('');
    setNewDescription('');
  };

  const saveEdit = async (key: string) => {
    try {
      setLoading(true);
      await axios.put(
        `${apiUrl}/config/${encodeURIComponent(key)}`,
        {
          value: newValue,
          description: newDescription,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchSettings();
      cancelEdit();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Paramètres de configuration</h1>
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Clé</th>
            <th className="px-2 py-1 text-left">Valeur</th>
            <th className="px-2 py-1 text-left">Description</th>
            <th className="px-2 py-1 text-left"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {settings.map((s) => (
            <tr key={s.id}>
              <td className="px-2 py-1 whitespace-nowrap font-semibold">
                {s.key}
              </td>
              <td className="px-2 py-1 whitespace-pre-wrap">
                {editingKey === s.key ? (
                  <textarea
                    className="border w-full px-2 py-1"
                    rows={3}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                  />
                ) : (
                  <code className="bg-gray-100 p-1 rounded block">
                    {s.value}
                  </code>
                )}
              </td>
              <td className="px-2 py-1 whitespace-pre-wrap">
                {editingKey === s.key ? (
                  <textarea
                    className="border w-full px-2 py-1"
                    rows={3}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                ) : (
                  s.description ?? '-'
                )}
              </td>
              <td className="px-2 py-1 whitespace-nowrap text-right">
                {editingKey === s.key ? (
                  <>
                    <button
                      onClick={() => saveEdit(s.key)}
                      disabled={loading}
                      className="mr-2 bg-green-600 text-white px-3 py-1 rounded"
                    >
                      Enregistrer
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="bg-gray-500 text-white px-3 py-1 rounded"
                    >
                      Annuler
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startEdit(s)}
                    className="text-blue-600 underline"
                  >
                    Modifier
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
