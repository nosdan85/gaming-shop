/**
 * Logging Service - Chi tiết cho việc debug
 */
const LOG_LEVELS = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3,
    TRACE: 4
};

const currentLevel = (() => {
    const env = String(process.env.LOG_LEVEL || 'info').toLowerCase().trim();
    switch (env) {
        case 'error': return LOG_LEVELS.ERROR;
        case 'warn': return LOG_LEVELS.WARN;
        case 'debug': return LOG_LEVELS.DEBUG;
        case 'trace': return LOG_LEVELS.TRACE;
        default: return LOG_LEVELS.INFO;
    }
})();

const isLevelEnabled = (level) => level <= currentLevel;

const formatTimestamp = () => {
    const now = new Date();
    return now.toISOString();
};

const formatRequestId = () => {
    return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeHeaders = (headers) => {
    const safe = {};
    const sensitive = ['authorization', 'cookie', 'x-auth-token', 'x-api-key', 'x-bridge-signature'];
    for (const [key, value] of Object.entries(headers || {})) {
        const lowerKey = String(key).toLowerCase();
        if (sensitive.some(s => lowerKey.includes(s))) {
            safe[key] = '[REDACTED]';
        } else {
            safe[key] = value;
        }
    }
    return safe;
};

const sanitizeBody = (body) => {
    if (!body) return null;
    const safe = {};
    const sensitive = ['password', 'token', 'secret', 'key', 'authorization', 'accessToken', 'refreshToken'];
    for (const [key, value] of Object.entries(body)) {
        const lowerKey = String(key).toLowerCase();
        if (sensitive.some(s => lowerKey.includes(s))) {
            safe[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
            safe[key] = sanitizeBody(value);
        } else {
            safe[key] = value;
        }
    }
    return safe;
};

const log = {
    error: (message, meta = {}) => {
        if (!isLevelEnabled(LOG_LEVELS.ERROR)) return;
        console.error(JSON.stringify({
            timestamp: formatTimestamp(),
            level: 'ERROR',
            message,
            ...meta
        }, null, 2));
    },

    warn: (message, meta = {}) => {
        if (!isLevelEnabled(LOG_LEVELS.WARN)) return;
        console.warn(JSON.stringify({
            timestamp: formatTimestamp(),
            level: 'WARN',
            message,
            ...meta
        }, null, 2));
    },

    info: (message, meta = {}) => {
        if (!isLevelEnabled(LOG_LEVELS.INFO)) return;
        console.log(JSON.stringify({
            timestamp: formatTimestamp(),
            level: 'INFO',
            message,
            ...meta
        }, null, 2));
    },

    debug: (message, meta = {}) => {
        if (!isLevelEnabled(LOG_LEVELS.DEBUG)) return;
        console.log(JSON.stringify({
            timestamp: formatTimestamp(),
            level: 'DEBUG',
            message,
            ...meta
        }, null, 2));
    },

    trace: (message, meta = {}) => {
        if (!isLevelEnabled(LOG_LEVELS.TRACE)) return;
        console.log(JSON.stringify({
            timestamp: formatTimestamp(),
            level: 'TRACE',
            message,
            ...meta
        }, null, 2));
    }
};

const createRequestLogger = () => {
    return (req, res, next) => {
        const requestId = formatRequestId();
        const startTime = Date.now();

        req.requestId = requestId;

        log.info('=== INCOMING REQUEST ===', {
            requestId,
            method: req.method,
            url: req.originalUrl || req.url,
            path: req.path,
            query: req.query,
            ip: req.ip || req.connection?.remoteAddress,
            userAgent: req.get('user-agent'),
            contentType: req.get('content-type'),
            contentLength: req.get('content-length'),
            headers: sanitizeHeaders(req.headers)
        });

        if (req.body && Object.keys(req.body).length > 0) {
            log.debug('Request Body', {
                requestId,
                body: sanitizeBody(req.body)
            });
        }

        const originalSend = res.send;
        const originalJson = res.json;

        res.send = function(body) {
            res.locals.responseBody = body;
            return originalSend.apply(this, arguments);
        };

        res.json = function(body) {
            res.locals.responseBody = body;
            return originalJson.apply(this, arguments);
        };

        res.on('finish', () => {
            const duration = Date.now() - startTime;
            const logData = {
                requestId,
                method: req.method,
                url: req.originalUrl || req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                contentLength: res.get('content-length') || res.locals.responseBody?.length || 0
            };

            if (res.statusCode >= 500) {
                log.error('=== REQUEST FAILED (5xx) ===', {
                    ...logData,
                    error: res.locals.error?.message || res.locals.error
                });
            } else if (res.statusCode >= 400) {
                log.warn('=== REQUEST FAILED (4xx) ===', logData);
            } else {
                log.info('=== REQUEST COMPLETED ===', logData);
            }
        });

        next();
    };
};

const createErrorLogger = () => {
    return (err, req, res, next) => {
        log.error('=== UNHANDLED ERROR ===', {
            requestId: req.requestId || 'no-request-id',
            method: req.method,
            url: req.originalUrl || req.url,
            error: {
                name: err?.name,
                message: err?.message,
                code: err?.code,
                stack: err?.stack
            },
            body: req.body ? sanitizeBody(req.body) : null,
            params: req.params,
            query: req.query
        });
        next(err);
    };
};

const logEndpointCall = (endpointName, params = {}) => {
    log.info(`[ENDPOINT] ${endpointName}`, {
        params,
        memoryUsage: process.memoryUsage ? {
            heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
            rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
        } : null,
        uptime: `${Math.round(process.uptime())}s`
    });
};

const logEndpointSuccess = (endpointName, result = {}, duration = null) => {
    const meta = { result };
    if (duration) meta.duration = `${duration}ms`;
    log.info(`[ENDPOINT SUCCESS] ${endpointName}`, meta);
};

const logEndpointError = (endpointName, error, duration = null) => {
    log.error(`[ENDPOINT ERROR] ${endpointName}`, {
        error: {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            stack: error?.stack
        },
        duration: duration ? `${duration}ms` : null
    });
};

const logDiscordAction = (action, details = {}) => {
    log.info(`[DISCORD] ${action}`, details);
};

const logPaymentAction = (action, details = {}) => {
    log.info(`[PAYMENT] ${action}`, {
        ...details,
        sanitized: true
    });
};

const logAuthAction = (action, details = {}) => {
    log.info(`[AUTH] ${action}`, {
        ...details,
        sanitized: true
    });
};

const logDbAction = (action, details = {}) => {
    log.debug(`[DB] ${action}`, details);
};

const logExternalApiCall = (service, endpoint, details = {}) => {
    log.debug(`[EXTERNAL API] ${service} ${endpoint}`, details);
};

const logEnvCheck = () => {
    log.info('=== ENVIRONMENT CHECK ===');

    const requiredVars = [
        'MONGO_URI', 'JWT_SECRET', 'JWT_ADMIN_SECRET', 'ADMIN_PASSWORD',
        'DISCORD_BOT_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET',
        'DISCORD_GUILD_ID', 'DISCORD_REDIRECT_URI'
    ];

    const optionalVars = [
        'PAYPAL_EMAIL', 'PAYPAL_PAYMENT_EMAIL', 'CASHAPP_HANDLE',
        'LTC_PAY_ADDRESS', 'SMTP_HOST', 'IMGBB_API_KEY',
        'WEBHOOK_BASE_URL', 'CLIENT_URL', 'BACKEND_URL'
    ];

    const results = {};

    for (const varName of requiredVars) {
        const value = process.env[varName];
        results[varName] = value ? '[SET]' : '[MISSING - REQUIRED]';
    }

    for (const varName of optionalVars) {
        const value = process.env[varName];
        results[varName] = value ? '[SET]' : '[NOT SET]';
    }

    log.info('Environment Variables Status', results);
};

module.exports = {
    log,
    createRequestLogger,
    createErrorLogger,
    logEndpointCall,
    logEndpointSuccess,
    logEndpointError,
    logDiscordAction,
    logPaymentAction,
    logAuthAction,
    logDbAction,
    logExternalApiCall,
    logEnvCheck,
    formatRequestId
};
