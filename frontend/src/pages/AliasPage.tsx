import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Alias {
  id: number;
  label_norm: string;
  product_key: string;
}

interface Product {
  product_key: string;
  label: string;
}

export default function AliasPage() {
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('token');
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newProductKey, setNewProductKey] = useState('');
  const [message, setMessage] = useState('');

  const fetchAliases = async () => {
    try {
      const res = await axios.get(`${apiUrl}/aliases`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAliases(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await axios.get(`${apiUrl}/products`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(res.data);
      if (res.data.length > 0) {
        setNewProductKey(res.data[0].product_key);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAliases();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const payload = {
        label_norm: newLabel.trim().toLowerCase(),
        product_key: newProductKey,
      };
      const res = await axios.post(`${apiUrl}/aliases`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage('Alias ajouté avec succès');
      setNewLabel('');
      await fetchAliases();
    } catch (err: any) {
      console.error(err);
      setMessage(err.response?.data?.detail || 'Erreur lors de l’ajout');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Supprimer cet alias ?')) return;
    try {
      await axios.delete(`${apiUrl}/aliases/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage('Alias supprimé');
      await fetchAliases();
    } catch (err) {
      console.error(err);
      setMessage('Erreur lors de la suppression');
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Alias Produits</h1>
      <p className="mb-4">Les alias permettent de faire correspondre les labels bruts des exports à des clés produit. Utilisez cette page pour les gérer.</p>
      <form onSubmit={handleAdd} className="mb-4">
        <div className="flex flex-col md:flex-row gap-4">
          <input
            type="text"
            placeholder="Libellé normalisé"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            required
            className="border p-2 rounded flex-1"
          />
          <select
            value={newProductKey}
            onChange={(e) => setNewProductKey(e.target.value)}
            className="border p-2 rounded flex-1"
          >
            {products.map((p) => (
              <option key={p.product_key} value={p.product_key}>
                {p.product_key} - {p.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
          >
            Ajouter
          </button>
        </div>
      </form>
      {message && <p className="mb-4 text-green-600">{message}</p>}
      <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 text-left">Label normalisé</th>
            <th className="px-2 py-1 text-left">Produit</th>
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {aliases.map((a) => (
            <tr key={a.id}>
              <td className="px-2 py-1 whitespace-nowrap">{a.label_norm}</td>
              <td className="px-2 py-1 whitespace-nowrap">{a.product_key}</td>
              <td className="px-2 py-1">
                <button
                  onClick={() => handleDelete(a.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  Supprimer
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}