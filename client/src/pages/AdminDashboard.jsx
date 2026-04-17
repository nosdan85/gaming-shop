import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import { isAdminToken } from '../utils/jwt';

const AdminDashboard = () => {
    const { token } = useAuth();
    const [stats, setStats] = useState(null);
    const [orders, setOrders] = useState([]);
    const [failed, setFailed] = useState(false);

    const hasAdminToken = isAdminToken(token);

    useEffect(() => {
        const fetchData = async () => {
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
        };
        fetchData();
    }, [token, hasAdminToken]);

    const updateStatus = async (id, status) => {
        await axios.put(`/api/admin/order/${id}`, { status }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const refreshed = await axios.get('/api/admin/orders', {
            headers: { Authorization: `Bearer ${token}` }
        });
        setOrders(refreshed.data);
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
            <div className="bg-[var(--color-bg-secondary)] rounded-[8px] overflow-hidden border border-[var(--color-border)]">
                <table className="w-full text-left">
                    <thead className="bg-[var(--color-bg-elevated)]">
                        <tr>
                            <th className="p-4">ID</th>
                            <th className="p-4">User</th>
                            <th className="p-4">Total</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map((order) => (
                            <tr key={order._id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]">
                                <td className="p-4 text-sm font-mono text-[var(--color-accent)]">{order.orderId}</td>
                                <td className="p-4">{order.discordId}</td>
                                <td className="p-4">${order.totalAmount}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        order.status === 'Completed' ? 'bg-[rgba(31,138,101,0.2)] text-[var(--color-success)]'
                                            : order.status === 'Pending' ? 'bg-[rgba(192,133,50,0.2)] text-[var(--color-gold)]'
                                                : 'bg-[rgba(245,78,0,0.2)] text-[var(--color-accent)]'
                                    }`}
                                    >
                                        {order.status}
                                    </span>
                                </td>
                                <td className="p-4">
                                    {order.status !== 'Completed' && (
                                        <button
                                            onClick={() => updateStatus(order._id, 'Completed')}
                                            className="text-xs bg-green-600 px-2 py-1 rounded hover:bg-green-700"
                                        >
                                            Mark Done
                                        </button>
                                    )}
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
