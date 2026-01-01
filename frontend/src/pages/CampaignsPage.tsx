import React, { useState } from 'react';
import axios from 'axios';

export default function CampaignsPage() {
  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [campaignIdToSend, setCampaignIdToSend] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const token = localStorage.getItem('token');
  const authHeaders = { Authorization: `Bearer ${token}` };

  const createCampaign = async () => {
    if (!name) return;
    setMessage(null);
    try {
      const response = await axios.post(
        '/api/campaigns',
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
        `/api/campaigns/${campaignIdToSend}/send`,
        {},
        { headers: authHeaders }
      );
      setMessage(response.data.message + ` (${response.data.count} e-mails envoyés)`);
      setCampaignIdToSend('');
    } catch (err) {
      setMessage('Erreur lors de l’envoi de la campagne');
    }
  };

  return (
    <div>
      <h2>Campagnes</h2>
      <h3>Créer une nouvelle campagne</h3>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Nom de la campagne"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <input
          type="text"
          placeholder="ID du template (optionnel)"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <button onClick={createCampaign}>Créer</button>
      </div>
      <h3>Envoyer une campagne existante</h3>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="number"
          placeholder="ID de la campagne"
          value={campaignIdToSend}
          onChange={(e) => setCampaignIdToSend(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <button onClick={sendCampaign}>Envoyer</button>
      </div>
      {message && <p>{message}</p>}
    </div>
  );
}