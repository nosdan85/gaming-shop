import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

export const AuthContext = createContext();

const applyAxiosAuthHeader = (token) => {
    if (token) {
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete axios.defaults.headers.common.Authorization;
    }
};

const parseUser = (rawUser) => {
    if (!rawUser) return null;
    try {
        return JSON.parse(rawUser);
    } catch {
        return null;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => parseUser(localStorage.getItem('user')));
    const [token, setToken] = useState(() => localStorage.getItem('token') || '');

    useEffect(() => {
        applyAxiosAuthHeader(token);
    }, [token]);

    const loginDiscord = (userData, jwtToken) => {
        setUser(userData || null);
        if (userData) {
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.setItem('discordUser', JSON.stringify(userData));
        } else {
            localStorage.removeItem('user');
            localStorage.removeItem('discordUser');
        }

        if (jwtToken) {
            setToken(jwtToken);
            localStorage.setItem('token', jwtToken);
        }
    };

    const login = (jwtToken) => {
        if (!jwtToken) return;
        setToken(jwtToken);
        localStorage.setItem('token', jwtToken);
    };

    const logout = () => {
        setUser(null);
        setToken('');
        localStorage.removeItem('user');
        localStorage.removeItem('discordUser');
        localStorage.removeItem('token');
        window.location.href = '/';
    };

    return (
        <AuthContext.Provider value={{ user, token, loginDiscord, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
