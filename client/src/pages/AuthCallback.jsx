import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
    const navigate = useNavigate();
    const { loginDiscord } = useAuth();
    
    // useRef giúp biến này không bị reset khi component render lại
    const hasFetched = useRef(false); 

    useEffect(() => {
        const handleAuth = async () => {
            // Lấy code từ URL
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            // NẾU: Không có code HOẶC Đã chạy rồi -> Thì dừng lại ngay
            if (!code || hasFetched.current) return;

            // Đánh dấu là đã chạy
            hasFetched.current = true;

            try {
                // Gọi về Server Render để đổi code lấy thông tin User
                // Lưu ý: Đảm bảo biến môi trường VITE_API_URL đã đúng
                const response = await axios.post('/api/shop/auth/discord', { code });

                if (response.data.user) {
                    loginDiscord(response.data.user);
                    navigate('/'); // Thành công -> Về trang chủ
                }
            } catch (error) {
                console.error("Login Failed:", error);
                // Lỗi cũng về trang chủ luôn, KHÔNG ĐƯỢC redirect lại Discord
                navigate('/'); 
            }
        };

        handleAuth();
    }, [navigate, loginDiscord]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white">
            <div className="text-center">
                <h2 className="text-2xl font-bold mb-4">Processing Login...</h2>
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto"></div>
                <p className="mt-4 text-gray-400">Please wait a moment.</p>
            </div>
        </div>
    );
};

export default AuthCallback;