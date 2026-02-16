import { createContext, useState } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('adminToken'));

    const login = (newToken) => {
        setToken(newToken);
        localStorage.setItem('adminToken', newToken);
    };

    const logout = () => {
        setToken(null);
        localStorage.removeItem('adminToken');
    };

    return (
        <AuthContext.Provider value={{ token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};