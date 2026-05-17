import axios from 'axios';
import crypto from 'node:crypto';

const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_ME_URL = 'https://discord.com/api/users/@me';
const REQUEST_TIMEOUT_MS = 15000;

const normalizeEnvValue = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith("'") && text.endsWith("'"))
    ) {
        return text.slice(1, -1).trim();
    }
    return text;
};

const getEnv = (name) => normalizeEnvValue(process.env[name]);

export default async function handler(req, res) {
    console.log('[DISCORD-EXCHANGE] Request received', {
        method: req.method,
        hasCode: Boolean(req.body?.code),
        redirectUri: req.body?.redirect_uri ? '[SET]' : '[EMPTY]'
    });

    if (req.method !== 'POST') {
        console.log('[DISCORD-EXCHANGE] Method not allowed', { method: req.method });
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const discordClientId = getEnv('DISCORD_CLIENT_ID');
    const discordClientSecret = getEnv('DISCORD_CLIENT_SECRET');
    const redirectUri = getEnv('DISCORD_REDIRECT_URI') || String(req.body?.redirect_uri || '').trim();

    console.log('[DISCORD-EXCHANGE] Config check', {
        hasClientId: Boolean(discordClientId),
        hasClientSecret: Boolean(discordClientSecret),
        redirectUri: redirectUri ? '[SET]' : '[EMPTY]'
    });

    if (!discordClientId || !discordClientSecret) {
        console.error('[DISCORD-EXCHANGE] Missing Discord credentials');
        return res.status(500).json({ error: 'Discord credentials not configured on Vercel' });
    }

    const code = String(req.body?.code || '').trim();
    if (!code) {
        console.warn('[DISCORD-EXCHANGE] Missing code');
        return res.status(400).json({ error: 'Missing authorization code' });
    }

    let step = 'oauth_token';
    try {
        console.log('[DISCORD-EXCHANGE] Step 1: Exchanging code for token');
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

        console.log('[DISCORD-EXCHANGE] Token response received', {
            hasAccessToken: Boolean(tokenResponse.data?.access_token),
            expiresIn: tokenResponse.data?.expires_in
        });

        const accessToken = tokenResponse.data?.access_token;
        const refreshToken = tokenResponse.data?.refresh_token;
        const expiresIn = tokenResponse.data?.expires_in;
        const scope = tokenResponse.data?.scope || '';

        if (!accessToken) {
            console.error('[DISCORD-EXCHANGE] Empty access token');
            return res.status(500).json({ error: 'Discord token exchange failed - empty access token' });
        }

        step = 'oauth_user';
        console.log('[DISCORD-EXCHANGE] Step 2: Fetching user info');
        const userResponse = await axios.get(DISCORD_ME_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: REQUEST_TIMEOUT_MS
        });

        const discordUser = userResponse.data || {};
        console.log('[DISCORD-EXCHANGE] User info received', {
            id: discordUser?.id,
            username: discordUser?.username
        });

        if (!discordUser?.id || !discordUser?.username) {
            console.error('[DISCORD-EXCHANGE] Invalid user payload');
            return res.status(500).json({ error: 'Discord user payload is invalid' });
        }

        // Generate JWT token using backend if available, otherwise create local JWT
        const backendBridgeUrl = getEnv('BACKEND_AUTH_BRIDGE_URL');
        const bridgeSecret = getEnv('DISCORD_AUTH_BRIDGE_SECRET');

        if (backendBridgeUrl && bridgeSecret) {
            console.log('[DISCORD-EXCHANGE] Step 3: Calling backend bridge');
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

            try {
                const bridgeResponse = await axios.post(backendBridgeUrl, bridgeBody, {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-bridge-timestamp': timestamp,
                        'x-bridge-signature': signature
                    },
                    timeout: REQUEST_TIMEOUT_MS
                });

                console.log('[DISCORD-EXCHANGE] Bridge call successful');
                return res.status(bridgeResponse.status).json(bridgeResponse.data);
            } catch (bridgeError) {
                console.error('[DISCORD-EXCHANGE] Bridge call failed', {
                    status: bridgeError?.response?.status,
                    error: bridgeError?.message
                });
                // Fall through to local JWT generation
            }
        }

        // Fallback: Create JWT locally (requires JWT_SECRET)
        console.log('[DISCORD-EXCHANGE] Using local JWT fallback');
        const jwtSecret = getEnv('JWT_SECRET');
        if (!jwtSecret) {
            console.error('[DISCORD-EXCHANGE] No JWT_SECRET configured');
            return res.status(500).json({ error: 'JWT_SECRET not configured on Vercel' });
        }

        const jwt = require('node:crypto').createHmac('sha256', jwtSecret)
            .update(JSON.stringify({ discordId: discordUser.id, type: 'user' }))
            .digest('hex');

        // Simple JWT-like token (for compatibility with existing system)
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({
            discordId: discordUser.id,
            type: 'user',
            exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
        })).toString('base64url');
        const signature2 = crypto
            .createHmac('sha256', jwtSecret)
            .update(`${header}.${payload}`)
            .digest('base64url');

        const token = `${header}.${payload}.${signature2}`;

        console.log('[DISCORD-EXCHANGE] Local JWT created', {
            discordId: discordUser.id,
            username: discordUser.username
        });

        return res.json({
            user: {
                discordId: discordUser.id,
                discordUsername: discordUser.username,
                avatar: discordUser.avatar || null
            },
            token
        });

    } catch (error) {
        const status = Number(error?.response?.status) || 0;
        const data = error?.response?.data;
        const message = data?.error_description || data?.message || data?.error || error?.message || '';

        console.error('[DISCORD-EXCHANGE] Error', {
            step,
            status,
            message,
            data
        });

        if (status === 400 && message.includes('invalid')) {
            return res.status(400).json({
                error: 'Authorization code is invalid or expired. Please login again.',
                code: 'INVALID_CODE'
            });
        }

        if (status === 429) {
            const retryAfter = Number(error?.response?.headers?.['retry-after']) || 30;
            return res.status(503).json({
                error: 'Discord is temporarily rate limited. Please try again later.',
                code: 'DISCORD_RATE_LIMIT',
                retryAfterSeconds: retryAfter
            });
        }

        return res.status(500).json({
            error: 'Discord authentication failed. ' + (message || 'Please try again.')
        });
    }
}
