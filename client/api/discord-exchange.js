import axios from 'axios';
import crypto from 'node:crypto';

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_RETRY_AFTER_SECONDS = 30;

const getErrorMessage = (data) => {
    if (!data) return '';
    if (typeof data === 'string') return data.slice(0, 200);
    return data.error_description || data.message || data.error || '';
};

const normalizeRetryAfterToSeconds = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 1000) return Math.ceil(n / 1000);
    return Math.ceil(n);
};

const getRetryAfterSeconds = (error) => {
    const headerSeconds = normalizeRetryAfterToSeconds(error?.response?.headers?.['retry-after']);
    const bodySeconds = normalizeRetryAfterToSeconds(error?.response?.data?.retry_after);
    return Math.max(headerSeconds, bodySeconds, DEFAULT_RETRY_AFTER_SECONDS);
};

const isDiscordTemporaryBlock = (status, data) => {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status !== 403) return false;
    const text = typeof data === 'string' ? data.toLowerCase() : JSON.stringify(data || {}).toLowerCase();
    return text.includes('cloudflare') || text.includes('1015') || text.includes('temporarily blocked');
};

const getEnv = (name) => String(process.env[name] || '').trim();

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const discordClientId = getEnv('DISCORD_CLIENT_ID');
    const discordClientSecret = getEnv('DISCORD_CLIENT_SECRET');
    const defaultRedirectUri = getEnv('DISCORD_REDIRECT_URI');
    const bridgeSecret = getEnv('DISCORD_AUTH_BRIDGE_SECRET');
    const backendBridgeUrl = getEnv('BACKEND_AUTH_BRIDGE_URL');

    if (!discordClientId || !discordClientSecret || !bridgeSecret || !backendBridgeUrl) {
        return res.status(500).json({ error: 'Discord exchange bridge is not configured on Vercel' });
    }

    const code = String(req.body?.code || '').trim();
    const redirectUri = String(req.body?.redirect_uri || defaultRedirectUri).trim();
    if (!code) {
        return res.status(400).json({ error: 'Missing authorization code' });
    }
    if (!redirectUri) {
        return res.status(400).json({ error: 'Missing redirect URI' });
    }

    let step = 'oauth_token';
    try {
        const tokenResponse = await axios.post(
            DISCORD_TOKEN_URL,
            new URLSearchParams({
                client_id: discordClientId,
                client_secret: discordClientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri
            }).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: REQUEST_TIMEOUT_MS
            }
        );

        const accessToken = tokenResponse.data?.access_token;
        const refreshToken = tokenResponse.data?.refresh_token;
        const expiresIn = tokenResponse.data?.expires_in;
        const scope = tokenResponse.data?.scope || '';
        if (!accessToken) {
            return res.status(500).json({ error: 'Discord token exchange returned empty access token' });
        }

        step = 'oauth_user';
        const userResponse = await axios.get(DISCORD_ME_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: REQUEST_TIMEOUT_MS
        });
        const discordUser = userResponse.data || {};
        if (!discordUser?.id || !discordUser?.username) {
            return res.status(500).json({ error: 'Discord user payload is invalid' });
        }

        const bridgePayload = {
            user: {
                id: discordUser.id,
                username: discordUser.username,
                global_name: discordUser.global_name || null,
                avatar: discordUser.avatar || null
            },
            access_token: accessToken,
            refresh_token: refreshToken || '',
            expires_in: Number(expiresIn) || 0,
            scope
        };

        const bridgeBody = JSON.stringify(bridgePayload);
        const timestamp = String(Date.now());
        const signature = crypto
            .createHmac('sha256', bridgeSecret)
            .update(`${timestamp}.${bridgeBody}`)
            .digest('hex');

        step = 'bridge_auth';
        const bridgeResponse = await axios.post(backendBridgeUrl, bridgeBody, {
            headers: {
                'Content-Type': 'application/json',
                'x-bridge-timestamp': timestamp,
                'x-bridge-signature': signature
            },
            timeout: REQUEST_TIMEOUT_MS
        });

        return res.status(bridgeResponse.status).json(bridgeResponse.data);
    } catch (error) {
        const status = Number(error?.response?.status) || 0;
        const data = error?.response?.data;
        const message = getErrorMessage(data);

        if (step !== 'bridge_auth' && isDiscordTemporaryBlock(status, data)) {
            return res.status(503).json({
                error: 'Discord temporarily limiting requests. Please try again in a few minutes.',
                code: 'DISCORD_RATE_LIMIT',
                retryAfterSeconds: getRetryAfterSeconds(error),
                step,
                providerStatus: status || 503
            });
        }

        if (step === 'bridge_auth' && status >= 400 && status < 600) {
            const body = (data && typeof data === 'object')
                ? data
                : { error: message || 'Bridge authentication failed' };
            return res.status(status).json(body);
        }

        if (status >= 400 && status < 500) {
            return res.status(400).json({
                error: message || 'Discord authentication failed. Check app credentials and redirect URI.'
            });
        }

        console.error('discord-exchange error:', {
            step,
            status,
            message: error?.message,
            providerMessage: message
        });
        return res.status(500).json({ error: 'Authentication failed' });
    }
}
