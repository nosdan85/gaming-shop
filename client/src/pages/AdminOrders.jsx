import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { ShopContext } from '../context/ShopContext';

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return '-';
  }
};

const statusClass = (status) => {
  if (status === 'paid' || status === 'completed') {
    return 'text-[var(--color-success)] bg-[rgba(31,138,101,0.14)] border-[rgba(31,138,101,0.35)]';
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'text-[var(--color-error)] bg-[rgba(207,45,86,0.14)] border-[rgba(207,45,86,0.35)]';
  }
  return 'text-[var(--color-gold)] bg-[rgba(204,150,64,0.14)] border-[rgba(204,150,64,0.35)]';
};

const normalizeSearch = (value) => String(value || '').trim().toLowerCase();

const AdminOrders = () => {
  const { user } = useContext(ShopContext);
  const [orders, setOrders] = useState([]);
  const [walletAdmin, setWalletAdmin] = useState({ pendingTopups: [], transactions: [] });
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(null);
  const [actioning, setActioning] = useState('');
  const [search, setSearch] = useState('');

  const localUser = useMemo(() => {
    if (user?.discordId) return user;
    try {
      const stored = localStorage.getItem('discordUser') || localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, walletRes] = await Promise.all([
        axios.get('/api/shop/orders'),
        axios.get('/api/shop/wallet/admin')
      ]);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setWalletAdmin({
        pendingTopups: Array.isArray(walletRes.data?.pendingTopups) ? walletRes.data.pendingTopups : [],
        transactions: Array.isArray(walletRes.data?.transactions) ? walletRes.data.transactions : []
      });
    } catch {
      setOrders([]);
      setWalletAdmin({ pendingTopups: [], transactions: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localUser?.discordId) {
      setIsOwner(false);
      setLoading(false);
      return;
    }

    axios.get('/api/shop/check-owner')
      .then((res) => setIsOwner(res.data?.isOwner === true))
      .catch(() => setIsOwner(false));
  }, [localUser?.discordId]);

  useEffect(() => {
    if (isOwner === true) fetchData();
  }, [fetchData, isOwner]);

  const approveTopup = async (topup) => {
    const txnId = window.prompt(`Transaction ID for ${topup.referenceCode || topup.id}`, topup.txnId || '');
    if (txnId === null) return;
    const adminNotes = window.prompt('Admin note (optional)', topup.adminNotes || '') || '';
    setActioning(`${topup.id}:approve`);
    try {
      await axios.post(`/api/shop/wallet/admin/topups/${topup.id}/approve`, { txnId, adminNotes });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not approve top-up');
    } finally {
      setActioning('');
    }
  };

  const rejectTopup = async (topup) => {
    const adminNotes = window.prompt(`Reject note for ${topup.referenceCode || topup.id}`, topup.adminNotes || '') || '';
    setActioning(`${topup.id}:reject`);
    try {
      await axios.post(`/api/shop/wallet/admin/topups/${topup.id}/reject`, { adminNotes });
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not reject top-up');
    } finally {
      setActioning('');
    }
  };

  const query = normalizeSearch(search);
  const pendingTopups = walletAdmin.pendingTopups || [];
  const filteredOrders = orders.filter((order) => {
    if (!query) return true;
    return [
      order.orderId,
      order.customerEmail,
      order.discordId,
      order.discordUsername,
      order.txnId,
      order.paymentMethod
    ].some((value) => normalizeSearch(value).includes(query));
  });
  const filteredTransactions = (walletAdmin.transactions || []).filter((item) => {
    if (!query) return true;
    return [
      item.referenceCode,
      item.orderId,
      item.txnId,
      item.discordId,
      item.discordUsername,
      item.methodLabel,
      item.memoExpected
    ].some((value) => normalizeSearch(value).includes(query));
  });

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
    <div className="min-h-screen bg-[var(--color-bg-main)] pt-24 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-gothic text-[var(--color-text-primary)]">Owner Control</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">Approve wallet top-ups and monitor checkout activity.</p>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="btn-press rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:text-[var(--color-error)]"
          >
            Refresh
          </button>
        </div>

        <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4">
          <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-2 tracking-wider">Search</label>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Order, Discord, email, memo, transaction"
            className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
          />
        </div>

        <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-hidden">
          <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
            <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Pending Top-ups</h2>
            <span className="text-sm text-[var(--color-text-secondary)]">{pendingTopups.length} pending</span>
          </div>
          {loading ? (
            <p className="p-4 text-sm text-[var(--color-text-secondary)]">Loading...</p>
          ) : pendingTopups.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-secondary)]">No pending top-ups.</p>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {pendingTopups.map((topup) => (
                <div key={topup.id} className="p-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`rounded-[8px] border px-2 py-1 text-xs ${statusClass(topup.status)}`}>{topup.status}</span>
                      <span className="text-[var(--color-text-primary)] font-gothic">{topup.referenceCode}</span>
                      <span className="text-[var(--color-success)] font-gothic">+${Number(topup.amount || 0).toFixed(2)}</span>
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)]">User: {topup.discordUsername || topup.discordId}</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">Method: {topup.methodLabel}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] break-all mt-1">Destination: {topup.paymentAddress || '-'}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] break-words mt-1">Memo: {topup.memoExpected || '-'}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{formatDate(topup.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button
                      type="button"
                      onClick={() => approveTopup(topup)}
                      disabled={Boolean(actioning)}
                      className="btn-press rounded-[8px] border border-[rgba(31,138,101,0.35)] bg-[rgba(31,138,101,0.14)] px-3 py-2 text-sm text-[var(--color-success)] disabled:opacity-50"
                    >
                      {actioning === `${topup.id}:approve` ? 'Saving...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectTopup(topup)}
                      disabled={Boolean(actioning)}
                      className="btn-press rounded-[8px] border border-[rgba(207,45,86,0.35)] bg-[rgba(207,45,86,0.12)] px-3 py-2 text-sm text-[var(--color-error)] disabled:opacity-50"
                    >
                      {actioning === `${topup.id}:reject` ? 'Saving...' : 'Reject'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-x-auto">
          <div className="p-4 border-b border-[var(--color-border)]">
            <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Wallet Transactions</h2>
          </div>
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
              <tr>
                <th className="p-3">Time</th>
                <th className="p-3">User</th>
                <th className="p-3">Type</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Status</th>
                <th className="p-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {filteredTransactions.map((item) => (
                <tr key={item.id} className="border-t border-[var(--color-border)]">
                  <td className="p-3 text-[var(--color-text-secondary)]">{formatDate(item.createdAt)}</td>
                  <td className="p-3 text-[var(--color-text-primary)]">{item.discordUsername || item.discordId}</td>
                  <td className="p-3 text-[var(--color-text-secondary)]">{item.type} / {item.methodLabel}</td>
                  <td className={`p-3 font-gothic ${item.direction === 'credit' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                    {item.direction === 'credit' ? '+' : '-'}${Number(item.amount || 0).toFixed(2)}
                  </td>
                  <td className="p-3"><span className={`rounded-[8px] border px-2 py-1 text-xs ${statusClass(item.status)}`}>{item.status}</span></td>
                  <td className="p-3 text-xs text-[var(--color-text-secondary)] break-all">{item.referenceCode || item.orderId || item.txnId || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-x-auto">
          <div className="p-4 border-b border-[var(--color-border)]">
            <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Orders</h2>
          </div>
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Total</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Ticket</th>
                <th className="p-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.orderId} className="border-t border-[var(--color-border)]">
                  <td className="p-3 font-mono text-[var(--color-accent)]">{order.orderId}</td>
                  <td className="p-3 text-[var(--color-text-primary)]">{order.discordUsername || order.discordId}</td>
                  <td className="p-3 text-[var(--color-text-primary)]">${Number(order.totalAmount || 0).toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`rounded-[8px] border px-2 py-1 text-xs ${statusClass(order.paymentStatus)}`}>
                      {order.paymentStatus}
                    </span>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{order.paymentMethod || '-'}</p>
                  </td>
                  <td className="p-3 text-xs text-[var(--color-text-secondary)]">{order.ticketStatus || '-'}</td>
                  <td className="p-3 text-[var(--color-text-secondary)]">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};

export default AdminOrders;
