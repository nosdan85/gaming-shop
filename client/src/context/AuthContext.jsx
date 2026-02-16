import { createContext, useContext, useState, useEffect } from 'react';

// 1. Tạo Context
const AuthContext = createContext();

// 2. Tạo Hook useAuth (Cái bạn đang thiếu đây!)
// Dòng này rất quan trọng, nó giúp các file khác dùng được hàm useAuth()
export const useAuth = () => {
  return useContext(AuthContext);
};

// 3. Tạo Provider
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);

  // Tự động nạp user từ bộ nhớ khi tải trang
  useEffect(() => {
    const storedUser = localStorage.getItem('discord_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error("Lỗi đọc user cũ:", e);
        localStorage.removeItem('discord_user');
      }
    }
  }, []);

  // Hàm đăng nhập
  const loginDiscord = (userData) => {
    setUser(userData);
    localStorage.setItem('discord_user', JSON.stringify(userData));
  };

  // Hàm đăng xuất
  const logout = () => {
    setUser(null);
    localStorage.removeItem('discord_user');
  };

  return (
    <AuthContext.Provider value={{ user, loginDiscord, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;