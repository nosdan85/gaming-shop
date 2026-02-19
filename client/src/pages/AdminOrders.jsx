import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';

const AdminOrders = () => {
  const { user } = useContext(ShopContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(null);

  useEffect(() => {
    const u = user || (() => {
      try {
        const s = localStorage.getItem('discordUser') || localStorage.getItem('user');
        return s ? JSON.parse(s) : null;
      } catch { return null; }
    })();
    if (!u?.discordId) {
      setIsOwner(false);
      return;
    }
    axios.get(`/api/shop/check-owner?discordId=${u.discordId}`)
      .then(res => setIsOwner(res.data?.isOwner === true))
      .catch(() => setIsOwner(false));
  }, [user?.discordId]);

  useEffect(() => {
    if (isOwner !== true) return;
    axios.get('/api/shop/orders')
      .then(res => setOrders(res.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (isOwner === false || (!user?.discordId && isOwner !== null)) {
    return <Navigate to="/" replace />;
  }
  if (isOwner !== true) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-gray-400">
        Checking access...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Orders</h1>
        {loading ? (
          <p className="text-gray-400">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-gray-400">No orders yet.</p>
        ) : (
          <div className="space-y-3 overflow-x-auto">
            {orders.map(o => (
              <div key={o.orderId} className="bg-[#1c1c1e] rounded-xl p-4 border border-[#2c2c2e]">
                <div className="flex flex-wrap gap-4 items-start justify-between">
                  <div>
                    <p className="text-white font-bold">{o.orderId}</p>
                    <p className="text-gray-400 text-sm">Customer: {o.discordUsername || o.discordId}</p>
                    <p className="text-gray-400 text-sm">${o.totalAmount?.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-sm">Payment: {o.paymentMethod}</p>
                    <p className={o.isPaid ? 'text-green-400' : 'text-yellow-400'}>
                      {o.isPaid ? 'Paid' : 'Unpaid'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <a href="/" className="inline-block mt-6 text-gray-500 hover:text-white text-sm">← Back to shop</a>
      </div>
    </div>
  );
};

export default AdminOrders;
