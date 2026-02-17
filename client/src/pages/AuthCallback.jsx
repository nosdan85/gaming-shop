import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const AuthCallback = () => {
    const { loginDiscord } = useAuth();
    const hasFetched = useRef(false);
    const [status, setStatus] = useState("Processing Discord Login..."); // Tiếng Anh
    const [debugInfo, setDebugInfo] = useState("");

    useEffect(() => {
        const handleAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (!code) {
                setStatus("Error: No Authorization Code found."); // Tiếng Anh
                return;
            }

            if (hasFetched.current) return;
            hasFetched.current = true;

            try {
                setStatus("Verifying with Server..."); // Tiếng Anh
                
                const apiUrl = import.meta.env.VITE_API_URL || "https://gaming-shop-gg64.onrender.com"; 
                
                const response = await axios.post(`${apiUrl}/api/shop/auth/discord`, { code });
                
                if (response.data.user) {
                    setStatus("Success! Redirecting..."); // Tiếng Anh
                    
                    localStorage.setItem('user', JSON.stringify(response.data.user));
                    
                    if (loginDiscord) loginDiscord(response.data.user);

                    setTimeout(() => {
                        window.location.href = '/'; 
                    }, 500);

                } else {
                    setStatus("Error: User data missing.");
                    setDebugInfo(JSON.stringify(response.data, null, 2));
                }
            } catch (error) {
                console.error("Login Failed:", error);
                setStatus("LOGIN FAILED");
                const message = error.response?.data?.error || error.message;
                setDebugInfo(`Error: ${message}\n\nDetails: ${JSON.stringify(error.response?.data || {}, null, 2)}`);
            }
        };

        handleAuth();
    }, [loginDiscord]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <h2 className="text-2xl font-bold mb-4">{status}</h2>
            {debugInfo && (
                <div className="bg-red-900 p-4 rounded border border-red-500 max-w-2xl w-full overflow-auto">
                    <h3 className="font-bold text-red-300 mb-2">Error Log (Send to Admin):</h3>
                    <pre className="text-sm font-mono whitespace-pre-wrap">{debugInfo}</pre>
                    <button 
                        onClick={() => window.location.href = '/'}
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