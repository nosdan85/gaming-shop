import { useState } from 'react';
import axios from 'axios';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminToken } from '../utils/jwt';

const AdminLogin = () => {
    const [password, setPassword] = useState('');
    const { login, token } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post('/api/admin/login', { password });
            login(res.data.token);
            navigate('/admin/orders.php');
        } catch (err) {
            alert(err.response?.data?.message || 'Wrong password');
        }
    };

    if (isAdminToken(token)) {
        return <Navigate to="/admin/orders.php" replace />;
    }

    return (
        <div className="flex items-center justify-center h-screen bg-[var(--color-bg-main)]">
            <form onSubmit={handleSubmit} className="bg-[var(--color-bg-secondary)] p-8 rounded-[10px] border border-[var(--color-border)] shadow-[rgba(17,24,39,0.1)_0px_20px_52px]">
                <h2 className="text-2xl font-gothic tracking-[-0.72px] mb-4 text-[var(--color-text-primary)]">Admin Access</h2>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2 mb-4 bg-transparent border border-[var(--color-border)] text-[var(--color-text-primary)] rounded-[8px] focus:outline-none focus:border-[var(--color-border-medium)]"
                    placeholder="Enter Password"
                />
                <button className="w-full bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:text-[var(--color-error)] py-2 px-4 rounded-[8px] font-gothic transition-colors duration-150">Login</button>
            </form>
        </div>
    );
};

export default AdminLogin;
