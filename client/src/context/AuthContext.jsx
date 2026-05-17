import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import {
    readAuthState,
    writeAuthState,
    clearAuthState,
    emitAuthStateChanged,
    subscribeAuthStateChanges
} from '../utils/authSync';

export const AuthContext = createContext();

const applyAxiosAuthHeader = (token) => {
    if (token) {
        axios.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete axios.defaults.headers.common.Authorization;
    }
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => readAuthState().user);
    const [token, setToken] = useState(() => readAuthState().token);

    useEffect(() => {
        applyAxiosAuthHeader(token);
    }, [token]);

    useEffect(() => {
        const syncFromStorage = () => {
            const next = readAuthState();
            setUser(next.user);
            setToken(next.token);
        };
        return subscribeAuthStateChanges(syncFromStorage);
    }, []);

    const loginDiscord = (userData, jwtToken) => {
        const nextUser = userData || null;
        const nextToken = jwtToken || '';
        setUser(nextUser);
        setToken(nextToken);
        writeAuthState({ user: nextUser, token: nextToken });
        emitAuthStateChanged();
    };

    const login = (jwtToken) => {
        if (!jwtToken) return;
        setToken(jwtToken);
        writeAuthState({ user, token: jwtToken });
        emitAuthStateChanged();
    };

    const logout = () => {
        setUser(null);
        setToken('');
        clearAuthState();
        emitAuthStateChanged();
        window.location.href = '/';
    };

    return (
        <AuthContext.Provider value={{ user, token, loginDiscord, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
