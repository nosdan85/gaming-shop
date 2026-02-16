import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
    const navigate = useNavigate();
    const { loginDiscord } = useAuth();
    const hasFetched = useRef(false);
    const [status, setStatus] = useState("Đang xử lý đăng nhập...");
    const [debugInfo, setDebugInfo] = useState("");

    useEffect(() => {
        const handleAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (!code) {
                setStatus("Lỗi: Không tìm thấy mã Code từ Discord.");
                return;
            }

            if (hasFetched.current) return;
            hasFetched.current = true;

            try {
                setStatus("Đang gửi Code về Server Render...");
                // Gọi API
                const response = await axios.post('/api/shop/auth/discord', { code });
                
                if (response.data.user) {
                    setStatus("Thành công! Đang chuyển hướng...");
                    loginDiscord(response.data.user);
                    setTimeout(() => navigate('/'), 1000);
                } else {
                    setStatus("Lỗi: Server không trả về user.");
                    setDebugInfo(JSON.stringify(response.data, null, 2));
                }
            } catch (error) {
                console.error("Login Failed:", error);
                setStatus("ĐĂNG NHẬP THẤT BẠI");
                // Hiện chi tiết lỗi ra màn hình để chụp ảnh
                const message = error.response?.data?.error || error.message;
                setDebugInfo(`Lỗi: ${message}\n\nChi tiết: ${JSON.stringify(error.response?.data || {}, null, 2)}`);
            }
        };

        handleAuth();
    }, [navigate, loginDiscord]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <h2 className="text-2xl font-bold mb-4">{status}</h2>
            {debugInfo && (
                <div className="bg-red-900 p-4 rounded border border-red-500 max-w-2xl w-full overflow-auto">
                    <h3 className="font-bold text-red-300 mb-2">Thông tin lỗi (Chụp ảnh gửi Admin):</h3>
                    <pre className="text-sm font-mono whitespace-pre-wrap">{debugInfo}</pre>
                    <button 
                        onClick={() => navigate('/')}
                        className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
                    >
                        Quay về trang chủ
                    </button>
                </div>
            )}
        </div>
    );
};

export default AuthCallback;