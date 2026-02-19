import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    // 1. Khởi tạo state bằng cách đọc ngay từ LocalStorage (để F5 không bị mất)
    const [user, setUser] = useState(() => {
        const savedUser = localStorage.getItem('user');
        return savedUser ? JSON.parse(savedUser) : null;
    });

    // 2. Login - save to storage
    const loginDiscord = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    // 3. Logout - clear storage
    const logout = () => {
        setUser(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = '/'; // Tải lại trang cho sạch
    };

    // 4. Theo dõi thay đổi (Phòng hờ)
    useEffect(() => {
        const savedUser = localStorage.getItem('user');
        if (savedUser && !user) {
            setUser(JSON.parse(savedUser));
        }
    }, []);

    return (
        <AuthContext.Provider value={{ user, loginDiscord, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);