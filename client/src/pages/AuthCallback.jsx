import { useEffect, useRef, useState } from 'react';
// Không cần dùng useNavigate nữa vì ta sẽ reload cứng trang web
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
    // const navigate = useNavigate(); // Bỏ cái này
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

            // Chặn React gọi API 2 lần (Strict Mode)
            if (hasFetched.current) return;
            hasFetched.current = true;

            try {
                setStatus("Đang gửi Code về Server Render...");
                
                // Sử dụng biến môi trường để lấy link API chuẩn
                const apiUrl = import.meta.env.VITE_API_URL || "https://gaming-shop-gg64.onrender.com"; 
                
                // Gọi API
                const response = await axios.post(`${apiUrl}/api/shop/auth/discord`, { code });
                
                if (response.data.user) {
                    setStatus("Thành công! Đang tải lại trang...");
                    
                    // --- BƯỚC QUAN TRỌNG 1: Lưu cứng vào LocalStorage ---
                    // Phải lưu thủ công ở đây để đảm bảo dữ liệu có sẵn trước khi reload
                    localStorage.setItem('user', JSON.stringify(response.data.user));
                    
                    // Nếu context có hàm login, gọi nó để cập nhật state tạm thời
                    if (loginDiscord) loginDiscord(response.data.user);

                    // --- BƯỚC QUAN TRỌNG 2: Dùng window.location.href ---
                    // Thay vì navigate('/'), dùng cái này để F5 lại toàn bộ web
                    // Web sẽ tự động đọc localStorage và hiện Avatar
                    setTimeout(() => {
                        window.location.href = '/'; 
                    }, 500);

                } else {
                    setStatus("Lỗi: Server không trả về user.");
                    setDebugInfo(JSON.stringify(response.data, null, 2));
                }
            } catch (error) {
                console.error("Login Failed:", error);
                setStatus("ĐĂNG NHẬP THẤT BẠI");
                
                // Hiện chi tiết lỗi
                const message = error.response?.data?.error || error.message;
                setDebugInfo(`Lỗi: ${message}\n\nChi tiết: ${JSON.stringify(error.response?.data || {}, null, 2)}`);
            }
        };

        handleAuth();
    }, [loginDiscord]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <h2 className="text-2xl font-bold mb-4">{status}</h2>
            {debugInfo && (
                <div className="bg-red-900 p-4 rounded border border-red-500 max-w-2xl w-full overflow-auto">
                    <h3 className="font-bold text-red-300 mb-2">Thông tin lỗi (Chụp ảnh gửi Admin):</h3>
                    <pre className="text-sm font-mono whitespace-pre-wrap">{debugInfo}</pre>
                    <button 
                        onClick={() => window.location.href = '/'}
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