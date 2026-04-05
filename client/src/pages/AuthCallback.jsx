import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
    const { loginDiscord } = useAuth();
    const hasFetched = useRef(false);
    const [status, setStatus] = useState('Processing Discord login...');
    const [debugInfo, setDebugInfo] = useState('');

    useEffect(() => {
        const handleAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (!code) {
                setStatus('Error: no authorization code found.');
                return;
            }

            if (hasFetched.current) return;
            hasFetched.current = true;

            try {
                setStatus('Verifying with server...');
                const redirectUri = `${window.location.origin}/auth/discord/callback`;
                const response = await axios.post('/api/shop/auth/discord', {
                    code,
                    redirect_uri: redirectUri
                });

                const userData = response.data?.user;
                const token = response.data?.token;
                if (!userData || !token) {
                    setStatus('Login failed');
                    setDebugInfo('Missing user/token from server response.');
                    return;
                }

                loginDiscord(userData, token);
                setStatus('Success! Redirecting...');
                setTimeout(() => {
                    window.location.href = '/';
                }, 400);
            } catch (error) {
                const data = error.response?.data || {};
                const statusCode = error.response?.status;
                const isRateLimit = data?.code === 'DISCORD_RATE_LIMIT' || statusCode === 503;

                if (isRateLimit) {
                    setStatus('Discord is temporarily rate limited');
                    setDebugInfo(
                        `${data?.error || 'Discord temporary block.'}\n\n` +
                        'Please wait a few minutes and try again.'
                    );
                    return;
                }

                setStatus('Discord login failed');
                setDebugInfo(
                    `Error: ${data?.error || error.message}\n\n` +
                    `HTTP: ${statusCode || 'unknown'}`
                );
            }
        };

        handleAuth();
    }, [loginDiscord]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <h2 className="text-2xl font-bold mb-4">{status}</h2>
            {debugInfo && (
                <div className="bg-red-900 p-4 rounded border border-red-500 max-w-2xl w-full overflow-auto">
                    <h3 className="font-bold text-red-300 mb-2">Error Log:</h3>
                    <pre className="text-sm font-mono whitespace-pre-wrap">{debugInfo}</pre>
                    <button
                        onClick={() => { window.location.href = '/'; }}
                        className="mt-4 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
                    >
                        Back to Home
                    </button>
                </div>
            )}
        </div>
    );
};

export default AuthCallback;
