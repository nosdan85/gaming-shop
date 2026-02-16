import { useState, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AdminLogin = () => {
    const [password, setPassword] = useState('');
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post('http://localhost:5000/api/admin/login', { password });
            login(res.data.token);
            navigate('/admin/dashboard');
        } catch (err) {
            alert('Sai mật khẩu');
        }
    };

    return (
        <div className="flex items-center justify-center h-screen bg-[#050B1E]">
            <form onSubmit={handleSubmit} className="bg-[#0F172A] p-8 rounded-xl border border-blue-500/30">
                <h2 className="text-2xl font-bold mb-4 text-white">Admin Access</h2>
                <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full p-2 mb-4 bg-black/50 text-white rounded"
                    placeholder="Enter Password"
                />
                <button className="w-full btn-primary">Login</button>
            </form>
        </div>
    );
};
export default AdminLogin;