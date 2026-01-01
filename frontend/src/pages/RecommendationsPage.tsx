import React, { useState } from 'react';
import axios from 'axios';

interface Recommendation {
  id: number;
  client_code: string;
  product_key: string;
  score: number;
  scenario?: string;
  created_at: string;
}

export default function RecommendationsPage() {
  const [clientCode, setClientCode] = useState('');
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const token = localStorage.getItem('token');

  const authHeaders = {
    Authorization: `Bearer ${token}`,
  };

  const generateRecs = async () => {
    setMessage(null);
    try {
      const response = await axios.post<Recommendation[]>(
        '/api/recommendations/generate',
        {},
        { headers: authHeaders }
      );
      setRecs(response.data);
      setMessage(`Généré ${response.data.length} recommandations`);
    } catch (err) {
      setMessage("Erreur lors de la génération des recommandations");
    }
  };

  const fetchClientRecs = async () => {
    if (!clientCode) return;
    setMessage(null);
    try {
      const response = await axios.get<Recommendation[]>(
        `/api/recommendations/client/${encodeURIComponent(clientCode)}`,
        { headers: authHeaders }
      );
      setRecs(response.data);
      setMessage(null);
    } catch (err) {
      setMessage("Aucune recommandation trouvée ou erreur");
      setRecs([]);
    }
  };

  return (
    <div>
      <h2>Recommandations</h2>
      <div style={{ marginBottom: '1rem' }}>
        <button onClick={generateRecs}>Générer des recommandations</button>
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Code client"
          value={clientCode}
          onChange={(e) => setClientCode(e.target.value)}
          style={{ marginRight: '0.5rem' }}
        />
        <button onClick={fetchClientRecs}>Voir les recommandations</button>
      </div>
      {message && <p>{message}</p>}
      {recs.length > 0 && (
        <table border={1} cellPadding={4} style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>Produit</th>
              <th>Score</th>
              <th>Scénario</th>
            </tr>
          </thead>
          <tbody>
            {recs.map((r) => (
              <tr key={r.id}>
                <td>{r.product_key}</td>
                <td>{r.score.toFixed(2)}</td>
                <td>{r.scenario}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}