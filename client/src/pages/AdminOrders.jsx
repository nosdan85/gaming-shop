import { useEffect, useState } from 'react';
import axios from 'axios';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/shop/orders')
      .then(res => setOrders(res.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

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
