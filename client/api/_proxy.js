const getBackendBaseUrl = () => {
    const value = String(
        process.env.BACKEND_URL
        || process.env.API_PROXY_TARGET
        || process.env.VITE_API_URL
        || ''
    ).trim();

    return value.replace(/\/+$/, '');
};

const getForwardHeaders = (req, hasBody) => {
    const headers = {};

    if (req.headers.authorization) {
        headers.authorization = req.headers.authorization;
    }
    if (req.headers.accept) {
        headers.accept = req.headers.accept;
    }
    if (req.headers['content-type']) {
        headers['content-type'] = req.headers['content-type'];
    } else if (hasBody) {
        headers['content-type'] = 'application/json';
    }

    return headers;
};

const getRequestBody = (req, hasBody) => {
    if (!hasBody) return undefined;
    if (req.body === undefined || req.body === null || req.body === '') return undefined;
    if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) return req.body;
    return JSON.stringify(req.body);
};

const sendProxyRequest = async (req, res, targetUrl, label) => {
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
        return res.status(500).json({ error: 'BACKEND_URL is not configured on Vercel' });
    }
    const method = String(req.method || 'GET').toUpperCase();
    const hasBody = !['GET', 'HEAD'].includes(method);

    try {
        const upstreamResponse = await fetch(targetUrl, {
            method,
            headers: getForwardHeaders(req, hasBody),
            body: getRequestBody(req, hasBody),
            redirect: 'manual'
        });

        const responseText = await upstreamResponse.text();
        const contentType = upstreamResponse.headers.get('content-type');
        const cacheControl = upstreamResponse.headers.get('cache-control');
        const location = upstreamResponse.headers.get('location');

        if (contentType) res.setHeader('content-type', contentType);
        if (cacheControl) res.setHeader('cache-control', cacheControl);
        if (location) res.setHeader('location', location);

        return res.status(upstreamResponse.status).send(responseText);
    } catch (error) {
        console.error(`API proxy error for ${label}:`, error?.message || error);
        return res.status(502).json({
            error: 'Backend API is temporarily unavailable'
        });
    }
};

export const proxyToBackendPath = async (req, res, targetPath) => {
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
        return res.status(500).json({ error: 'BACKEND_URL is not configured on Vercel' });
    }

    const incomingUrl = new URL(req.url, 'http://localhost');
    const normalizedPath = String(targetPath || '').startsWith('/')
        ? String(targetPath)
        : `/${String(targetPath || '')}`;
    const targetUrl = `${backendBaseUrl}${normalizedPath}${incomingUrl.search}`;
    return sendProxyRequest(req, res, targetUrl, normalizedPath);
};

export const proxyToBackendPrefix = async (req, res, prefix) => {
    const backendBaseUrl = getBackendBaseUrl();
    if (!backendBaseUrl) {
        return res.status(500).json({ error: 'BACKEND_URL is not configured on Vercel' });
    }

    const incomingUrl = new URL(req.url, 'http://localhost');
    const suffixPath = incomingUrl.pathname.startsWith(prefix)
        ? incomingUrl.pathname.slice(prefix.length)
        : '';
    const targetUrl = `${backendBaseUrl}${prefix}${suffixPath}${incomingUrl.search}`;
    return sendProxyRequest(req, res, targetUrl, prefix);
};
