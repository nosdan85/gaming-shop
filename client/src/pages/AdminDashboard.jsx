import { useEffect, useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';

const AdminDashboard = () => {
    const { token } = useContext(AuthContext);
    const [stats, setStats] = useState(null);
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            const config = { headers: { 'x-auth-token': token } };
            const statsRes = await axios.get('http://localhost:5000/api/admin/stats', config);
            const ordersRes = await axios.get('http://localhost:5000/api/admin/orders', config);
            setStats(statsRes.data);
            setOrders(ordersRes.data);
        };
        fetchData();
    }, [token]);

    const updateStatus = async (id, status) => {
        await axios.put(`http://localhost:5000/api/admin/order/${id}`, { status }, {
            headers: { 'x-auth-token': token }
        });
        alert('Updated');
        window.location.reload();
    };

    if (!stats) return <div className="text-white">Loading...</div>;

    return (
        <div className="p-8 text-white">
            <h1 className="text-3xl font-bold mb-8 gradient-text">Dashboard</h1>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-[#0F172A] p-6 rounded-xl border border-blue-500/20">
                    <h3 className="text-gray-400">Total Revenue</h3>
                    <p className="text-2xl font-bold">${stats.revenue}</p>
                </div>
                <div className="bg-[#0F172A] p-6 rounded-xl border border-purple-500/20">
                    <h3 className="text-gray-400">Total Orders</h3>
                    <p className="text-2xl font-bold">{stats.orders}</p>
                </div>
                <div className="bg-[#0F172A] p-6 rounded-xl border border-pink-500/20">
                    <h3 className="text-gray-400">Users Linked</h3>
                    <p className="text-2xl font-bold">{stats.users}</p>
                </div>
            </div>

            {/* Orders Table */}
            <h2 className="text-xl font-bold mb-4">Recent Orders</h2>
            <div className="bg-[#0F172A] rounded-xl overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-blue-900/20">
                        <tr>
                            <th className="p-4">ID</th>
                            <th className="p-4">User</th>
                            <th className="p-4">Total</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                            <tr key={order._id} className="border-t border-gray-800 hover:bg-white/5">
                                <td className="p-4 text-sm font-mono text-blue-400">{order.orderId}</td>
                                <td className="p-4">{order.discordId}</td>
                                <td className="p-4">${order.totalAmount}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-1 rounded text-xs ${
                                        order.status === 'Completed' ? 'bg-green-500/20 text-green-400' : 
                                        order.status === 'Pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
                                    }`}>
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