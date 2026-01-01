import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Product {
  id: number;
  product_key: string;
  name: string;
  family?: string;
  price?: number;
  margin?: number;
  global_popularity_score?: number;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const token = localStorage.getItem('token');

  const fetchProducts = async () => {
    try {
      const resp = await axios.get(`${apiUrl}/products/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setProducts(resp.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Produits</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-1 text-left">Key</th>
              <th className="px-2 py-1 text-left">Nom</th>
              <th className="px-2 py-1 text-left">Famille</th>
              <th className="px-2 py-1 text-left">Prix (€)</th>
              <th className="px-2 py-1 text-left">Popularité</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p) => (
              <tr key={p.id}>
                <td className="px-2 py-1 whitespace-nowrap">{p.product_key}</td>
                <td className="px-2 py-1 whitespace-nowrap">{p.name}</td>
                <td className="px-2 py-1 whitespace-nowrap">{p.family ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{p.price?.toFixed(2) ?? '-'}</td>
                <td className="px-2 py-1 whitespace-nowrap">{(p.global_popularity_score ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}