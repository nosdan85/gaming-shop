import { useEffect, useState, useContext } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { ShopContext } from '../context/ShopContext';

const AdminOrders = () => {
  const { user } = useContext(ShopContext);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(null);

  useEffect(() => {
    const localUser = user || (() => {
      try {
        const stored = localStorage.getItem('discordUser') || localStorage.getItem('user');
        return stored ? JSON.parse(stored) : null;
      } catch {
        return null;
      }
    })();

    if (!localUser?.discordId) {
      setIsOwner(false);
      setLoading(false);
      return;
    }

    axios.get('/api/shop/check-owner')
      .then((res) => setIsOwner(res.data?.isOwner === true))
      .catch(() => setIsOwner(false))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (isOwner !== true) return;
    setLoading(true);
    axios.get('/api/shop/orders')
      .then((res) => setOrders(res.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [isOwner]);

  if (isOwner === false) {
    return <Navigate to="/" replace />;
  }

  if (isOwner !== true) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center text-[var(--color-text-secondary)]">
        Checking access...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-gothic text-[var(--color-text-primary)] mb-6">Orders</h1>
        {loading ? (
          <p className="text-[var(--color-text-secondary)]">Loading...</p>
        ) : orders.length === 0 ? (
          <p className="text-[var(--color-text-secondary)]">No orders yet.</p>
        ) : (
          <div className="space-y-3 overflow-x-auto">
            {orders.map((order) => (
              <div key={order.orderId} className="bg-[var(--color-bg-secondary)] rounded-[8px] p-4 border border-[var(--color-border)]">
                <div className="flex flex-wrap gap-4 items-start justify-between">
                  <div>
                    <p className="text-[var(--color-text-primary)] font-gothic">{order.orderId}</p>
                    <p className="text-[var(--color-text-secondary)] text-sm">Customer: {order.discordUsername || order.discordId}</p>
                    <p className="text-[var(--color-text-secondary)] text-sm">${order.totalAmount?.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[var(--color-text-secondary)] text-sm">Payment: {order.paymentMethod}</p>
                    <p className={order.isPaid ? 'text-[var(--color-success)]' : 'text-[var(--color-gold)]'}>
                      {order.isPaid ? 'Paid' : 'Unpaid'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <a href="/" className="inline-block mt-6 text-[var(--color-text-secondary)] hover:text-[var(--color-error)] text-sm">&larr; Back to shop</a>
      </div>
    </div>
  );
};

export default AdminOrders;

