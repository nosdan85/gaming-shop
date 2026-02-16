import { useEffect, useContext, useRef } from 'react'; // Thêm useRef
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ShopContext } from '../context/ShopContext';

const AuthCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { loginDiscord } = useContext(ShopContext);
  const processed = useRef(false); // Cờ chống chạy 2 lần

  useEffect(() => {
    const code = searchParams.get('code');
    
    // Nếu có code và chưa xử lý
    if (code && !processed.current) {
      processed.current = true; // Đánh dấu đã chạy

      axios.post('/api/shop/auth/discord', { code })
        .then(res => {
          loginDiscord(res.data);
          navigate('/');
        })
        .catch(err => {
          console.error("Login Failed", err);
          // Nếu lỗi do code cũ, vẫn về trang chủ
          navigate('/');
        });
    } else if (!code) {
        navigate('/');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#050B1E] flex flex-col items-center justify-center text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#4DA3FF] mb-4"></div>
      <h2 className="text-xl font-bold">Verifying Discord...</h2>
    </div>
  );
};

export default AuthCallback;