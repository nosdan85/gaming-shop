import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { isAdminToken } from '../utils/jwt';

const AdminDashboard = () => {
    const { token } = useAuth();
    const [stats, setStats] = useState(null);
    const [orders, setOrders] = useState([]);
    const [failed, setFailed] = useState(false);
    const [actioning, setActioning] = useState('');

    const hasAdminToken = isAdminToken(token);

    const fetchData = useCallback(async () => {
        if (!token || !hasAdminToken) return;
        try {
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const statsRes = await axios.get('/api/admin/stats', config);
            const ordersRes = await axios.get('/api/admin/orders', config);
            setStats(statsRes.data);
            setOrders(ordersRes.data);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [token, hasAdminToken]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const updateStatus = async (id, status) => {
        await axios.put(`/api/admin/order/${id}`, { status }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        await fetchData();
    };

    const normalizePaymentStatus = (order) => (
        order.paymentStatus
        || (order.status === 'Completed' ? 'paid' : (order.status === 'Cancelled' ? 'cancelled' : 'pending'))
    );

    const getPaymentStatusLabel = (order) => {
        const paymentStatus = normalizePaymentStatus(order);
        if (paymentStatus === 'paid') return 'Đã thanh toán';
        if (paymentStatus === 'cancelled') return 'Đã hủy';
        return 'Chưa thanh toán';
    };

    const getPaymentStatusClass = (order) => {
        const paymentStatus = normalizePaymentStatus(order);
        if (paymentStatus === 'paid') return 'bg-[rgba(31,138,101,0.16)] text-[var(--color-success)] border-[rgba(31,138,101,0.35)]';
        if (paymentStatus === 'cancelled') return 'bg-[rgba(207,45,86,0.14)] text-[var(--color-error)] border-[rgba(207,45,86,0.35)]';
        return 'bg-[rgba(207,45,86,0.14)] text-[var(--color-error)] border-[rgba(207,45,86,0.35)]';
    };

    const recheckIpn = async (order) => {
        const key = `${order._id}:ipn`;
        setActioning(key);
        try {
            const res = await axios.post(`/api/admin/order/${order._id}/recheck-ipn`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert(`IPN check: ${res.data?.message || 'done'}`);
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.message || 'Could not recheck IPN');
        } finally {
            setActioning('');
        }
    };

    const markPaidManually = async (order) => {
        const txnId = window.prompt(`PayPal transaction ID for ${order.orderId}`);
        if (!txnId) return;
        const note = window.prompt('Admin note (optional)') || '';
        const key = `${order._id}:manual`;
        setActioning(key);
        try {
            await axios.post(`/api/admin/order/${order._id}/mark-paid`, { txnId, note }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await fetchData();
        } catch (err) {
            alert(err.response?.data?.message || 'Could not mark order paid');
        } finally {
            setActioning('');
        }
    };

    if (!token || !hasAdminToken) return <Navigate to="/admin/login" replace />;
    if (failed) return <div className="text-[var(--color-text-primary)] p-8 bg-[var(--color-bg-main)]">Could not load dashboard.</div>;
    if (!stats) return <div className="text-[var(--color-text-primary)] p-8 bg-[var(--color-bg-main)]">Loading...</div>;

    return (
        <div className="p-8 text-[var(--color-text-primary)] bg-[var(--color-bg-main)] min-h-screen">
            <h1 className="text-3xl font-gothic tracking-[-0.72px] mb-8 text-[var(--color-text-primary)]">Dashboard</h1>

            <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-[var(--color-bg-secondary)] p-6 rounded-[8px] border border-[var(--color-border)]">
                    <h3 className="text-[var(--color-text-secondary)]">Total Revenue</h3>
                    <p className="text-2xl font-gothic">{stats.revenue}</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] p-6 rounded-[8px] border border-[var(--color-border)]">
                    <h3 className="text-[var(--color-text-secondary)]">Total Orders</h3>
                    <p className="text-2xl font-gothic">{stats.orders}</p>
                </div>
                <div className="bg-[var(--color-bg-secondary)] p-6 rounded-[8px] border border-[var(--color-border)]">
                    <h3 className="text-[var(--color-text-secondary)]">Users Linked</h3>
                    <p className="text-2xl font-gothic">{stats.users}</p>
                </div>
            </div>

            <h2 className="text-xl font-gothic mb-4">Recent Orders</h2>
            <div className="bg-[var(--color-bg-secondary)] rounded-[8px] overflow-x-auto border border-[var(--color-border)]">
                <table className="w-full min-w-[1120px] text-left">
                    <thead className="bg-[var(--color-bg-elevated)]">
                        <tr>
                            <th className="p-4">ID</th>
                            <th className="p-4">User</th>
                            <th className="p-4">Email</th>
                            <th className="p-4">Total</th>
                            <th className="p-4">Payment</th>
                            <th className="p-4">Memo</th>
                            <th className="p-4">Txn</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr key={order._id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]">
                                <td className="p-4 text-sm font-mono text-[var(--color-accent)]">{order.orderId}</td>
                                <td className="p-4">{order.discordUsername || order.discordId}</td>
                                <td className="p-4 text-xs break-all">{order.customerEmail || '-'}</td>
                                <td className="p-4">${Number(order.totalAmount || 0).toFixed(2)}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded-[8px] border text-xs whitespace-nowrap ${getPaymentStatusClass(order)}`}
                                    >
                                        {getPaymentStatusLabel(order)}
                                    </span>
                                    <p className="text-[10px] text-[var(--color-text-secondary)] mt-1">{order.paymentMethod || '-'}</p>
                                </td>
                                <td className="p-4 text-xs max-w-[220px] break-words">{order.memoExpected || '-'}</td>
                                <td className="p-4 text-xs font-mono break-all">{order.txnId || '-'}</td>
                                <td className="p-4">
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={() => recheckIpn(order)}
                                            disabled={Boolean(actioning)}
                                            className="text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-1 rounded-[8px] hover:text-[var(--color-error)] disabled:opacity-50"
                                        >
                                            {actioning === `${order._id}:ipn` ? 'Checking...' : 'Kiểm tra IPN thủ công'}
                                        </button>
                                        {normalizePaymentStatus(order) !== 'paid' && (
                                            <button
                                                onClick={() => markPaidManually(order)}
                                                disabled={Boolean(actioning)}
                                                className="text-xs bg-[rgba(31,138,101,0.16)] text-[var(--color-success)] border border-[rgba(31,138,101,0.35)] px-2 py-1 rounded-[8px] disabled:opacity-50"
                                            >
                                                {actioning === `${order._id}:manual` ? 'Saving...' : 'Xác nhận thủ công'}
                                            </button>
                                        )}
                                        {order.status !== 'Cancelled' && normalizePaymentStatus(order) !== 'paid' && (
                                            <button
                                                onClick={() => updateStatus(order._id, 'Cancelled')}
                                                disabled={Boolean(actioning)}
                                                className="text-xs bg-[rgba(207,45,86,0.12)] text-[var(--color-error)] border border-[rgba(207,45,86,0.35)] px-2 py-1 rounded-[8px] disabled:opacity-50"
                                            >
                                                Hủy đơn
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AdminDashboard;
