import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const MAX_AUTH_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 15000;
const AUTH_REQUEST_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const createTimeoutError = () => {
    const timeoutError = new Error('Auth request timed out');
    timeoutError.code = 'AUTH_REQUEST_TIMEOUT';
    return timeoutError;
};

const postAuthCode = async (code, redirectUri) => {
    const responsePromise = axios.post('/api/shop/auth/discord', {
        code,
        redirect_uri: redirectUri
    });

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(createTimeoutError()), AUTH_REQUEST_TIMEOUT_MS);
    });

    return Promise.race([responsePromise, timeoutPromise]);
};

const normalizeRetryAfterToMs = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1000) return Math.round(n);
    return Math.round(n * 1000);
};

const getRetryDelayMs = (error, attempt) => {
    const headerDelay = normalizeRetryAfterToMs(error?.response?.headers?.['retry-after']);
    const bodyDelay = normalizeRetryAfterToMs(
        error?.response?.data?.retry_after ?? error?.response?.data?.retryAfterSeconds
    );
    const backoffDelay = Math.min(
        MAX_RETRY_DELAY_MS,
        Math.round(BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)))
    );
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(headerDelay, bodyDelay, backoffDelay));
};

const isRateLimitedError = (error) => {
    const data = error?.response?.data || {};
    const statusCode = error?.response?.status;
    return data?.code === 'DISCORD_RATE_LIMIT' || statusCode === 503 || statusCode === 429;
};

const AuthCallback = () => {
    const { loginDiscord } = useAuth();
    const inFlight = useRef(false);
    const [nonce, setNonce] = useState(0);
    const [status, setStatus] = useState('Processing Discord login...');
    const [debugInfo, setDebugInfo] = useState('');
    const [canRetry, setCanRetry] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const handleAuth = async () => {
            const params = new URLSearchParams(window.location.search);
            const code = params.get('code');

            if (!code) {
                setStatus('Error: no authorization code found.');
                setCanRetry(false);
                return;
            }

            if (inFlight.current) return;
            inFlight.current = true;

            try {
                const redirectUri = `${window.location.origin}/auth/discord/callback`;
                setDebugInfo('');
                setCanRetry(false);

                for (let attempt = 1; attempt <= MAX_AUTH_RETRIES; attempt += 1) {
                    if (cancelled) return;
                    try {
                        setStatus(
                            attempt === 1
                                ? 'Verifying with server...'
                                : `Retrying Discord login (${attempt}/${MAX_AUTH_RETRIES})...`
                        );

                        const response = await postAuthCode(code, redirectUri);

                        const userData = response.data?.user;
                        const token = response.data?.token;
                        if (!userData || !token) {
                            setStatus('Login failed');
                            setDebugInfo('Missing user/token from server response.');
                            setCanRetry(true);
                            return;
                        }

                        loginDiscord(userData, token);
                        setStatus('Success! Redirecting...');
                        setTimeout(() => {
                            if (!cancelled) window.location.href = '/';
                        }, 400);
                        return;
                    } catch (error) {
                        const timeout = error?.code === 'ECONNABORTED' || error?.code === 'AUTH_REQUEST_TIMEOUT';
                        const rateLimit = isRateLimitedError(error);
                        const shouldRetry = attempt < MAX_AUTH_RETRIES && timeout;

                        if (shouldRetry) {
                            const delayMs = getRetryDelayMs(error, attempt);
                            setStatus(
                                `Discord is busy, retrying in ${Math.ceil(delayMs / 1000)}s... (${attempt}/${MAX_AUTH_RETRIES})`
                            );
                            await sleep(delayMs);
                            continue;
                        }

                        const data = error.response?.data || {};
                        const statusCode = error.response?.status;

                        if (rateLimit) {
                            const retryAfterSeconds = Number(data?.retryAfterSeconds) || 0;
                            setStatus('Discord is temporarily rate limited');
                            setDebugInfo(
                                `${data?.error || 'Discord temporary block.'}\n\n` +
                                (retryAfterSeconds > 0
                                    ? `Suggested wait: about ${retryAfterSeconds}s before retry.\n\n`
                                    : '') +
                                'Please wait a bit, then press Retry Login once.'
                            );
                            setCanRetry(true);
                            return;
                        }
                        if (timeout) {
                            setStatus('Discord login timeout');
                            setDebugInfo('Server took too long to reply. Please press Retry Login.');
                            setCanRetry(true);
                            return;
                        }

                        setStatus('Discord login failed');
                        setDebugInfo(
                            `Error: ${data?.error || error.message}\n\n` +
                            `HTTP: ${statusCode || 'unknown'}`
                        );
                        setCanRetry(true);
                        return;
                    }
                }

            } catch (error) {
                const data = error.response?.data || {};
                const statusCode = error.response?.status;
                setStatus('Discord login failed');
                setDebugInfo(
                    `Error: ${data?.error || error.message}\n\n` +
                    `HTTP: ${statusCode || 'unknown'}`
                );
                setCanRetry(true);
            } finally {
                inFlight.current = false;
            }
        };

        handleAuth();
        return () => {
            cancelled = true;
        };
    }, [loginDiscord, nonce]);

    const handleRetry = () => {
        if (inFlight.current) return;
        setStatus('Retrying Discord login...');
        setDebugInfo('');
        setCanRetry(false);
        setNonce((x) => x + 1);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-4">
            <h2 className="text-2xl font-bold mb-4">{status}</h2>
            {debugInfo && (
                <div className="bg-red-900 p-4 rounded border border-red-500 max-w-2xl w-full overflow-auto">
                    <h3 className="font-bold text-red-300 mb-2">Error Log:</h3>
                    <pre className="text-sm font-mono whitespace-pre-wrap">{debugInfo}</pre>
                    <div className="mt-4 flex gap-2">
                        {canRetry && (
                            <button
                                onClick={handleRetry}
                                className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded"
                            >
                                Retry Login
                            </button>
                        )}
                        <button
                            onClick={() => { window.location.href = '/'; }}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AuthCallback;
