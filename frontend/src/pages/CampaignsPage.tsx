import React, { useState } from 'react';
import axios from 'axios';

export default function CampaignsPage() {
  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [campaignIdToSend, setCampaignIdToSend] = useState('');
  const [campaignIdStats, setCampaignIdStats] = useState('');
  const [stats, setStats] = useState<any | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const apiUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');
  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const createCampaign = async () => {
    if (!name) return;
    setMessage(null);
    try {
      const response = await axios.post(
        `${apiUrl}/campaigns`,
        {
          name,
          scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          template_id: templateId || null,
        },
        { headers: authHeaders }
      );
      setMessage(`Campagne créée avec l'ID ${response.data.id}`);
      setName('');
      setScheduledAt('');
      setTemplateId('');
    } catch (err) {
      setMessage('Erreur lors de la création de la campagne');
    }
  };

  const sendCampaign = async () => {
    if (!campaignIdToSend) return;
    setMessage(null);
    try {
      const response = await axios.post(
        `${apiUrl}/campaigns/${campaignIdToSend}/send`,
        {},
        { headers: authHeaders }
      );
      setMessage(response.data.message + ` (${response.data.count} e-mails envoyés)`);
      setCampaignIdToSend('');
    } catch (err) {
      setMessage('Erreur lors de l’envoi de la campagne');
    }
  };

  const getStats = async () => {
    if (!campaignIdStats) return;
    setMessage(null);
    setStats(null);
    try {
      const response = await axios.get(
        `${apiUrl}/campaigns/${campaignIdStats}/stats`,
        { headers: authHeaders }
      );
      setStats(response.data);
    } catch (err) {
      setMessage('Erreur lors de la récupération des statistiques');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Campagnes</h2>
      <h3 className="font-semibold">Créer une nouvelle campagne</h3>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Nom de la campagne"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border px-2 py-1 mr-2"
        />
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="border px-2 py-1 mr-2"
        />
        <input
          type="text"
          placeholder="ID du template (optionnel)"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="border px-2 py-1 mr-2"
        />
        <button onClick={createCampaign} className="bg-blue-600 text-white px-3 py-1 rounded">
          Créer
        </button>
      </div>
      <h3 className="font-semibold">Envoyer une campagne existante</h3>
      <div className="mb-4">
        <input
          type="number"
          placeholder="ID de la campagne"
          value={campaignIdToSend}
          onChange={(e) => setCampaignIdToSend(e.target.value)}
          className="border px-2 py-1 mr-2"
        />
        <button onClick={sendCampaign} className="bg-green-600 text-white px-3 py-1 rounded">
          Envoyer
        </button>
      </div>
      <h3 className="font-semibold">Statistiques de campagne</h3>
      <div className="mb-4">
        <input
          type="number"
          placeholder="ID de la campagne"
          value={campaignIdStats}
          onChange={(e) => setCampaignIdStats(e.target.value)}
          className="border px-2 py-1 mr-2"
        />
        <button onClick={getStats} className="bg-purple-600 text-white px-3 py-1 rounded">
          Afficher stats
        </button>
      </div>
      {stats && (
        <div className="mb-4 border p-3 bg-gray-50 rounded">
          <h4 className="font-semibold mb-2">Statistiques pour la campagne {campaignIdStats}</h4>
          <ul className="list-disc list-inside text-sm">
            <li>Envoyés : {stats.sent}</li>
            <li>Ouvertures : {stats.open}</li>
            <li>Clics : {stats.click}</li>
            <li>Rebonds : {stats.bounce}</li>
            <li>Désinscriptions : {stats.unsubscribe}</li>
          </ul>
        </div>
      )}
      {message && <p className="mt-2 text-red-600">{message}</p>}
    </div>
  );
}