const crypto = require('crypto');

const ENCRYPTION_PREFIX = 'enc:v1:';

const getRawKeyBuffer = () => {
    const raw = String(process.env.TOKEN_ENCRYPTION_KEY || '').trim();
    if (!raw) return null;

    try {
        const maybeBase64 = Buffer.from(raw, 'base64');
        if (maybeBase64.length === 32 && maybeBase64.toString('base64').replace(/=+$/, '') === raw.replace(/=+$/, '')) {
            return maybeBase64;
        }
    } catch {
        // Ignore parse error and fall back to hash-based derivation.
    }

    try {
        const maybeHex = Buffer.from(raw, 'hex');
        if (maybeHex.length === 32 && maybeHex.toString('hex').toLowerCase() === raw.toLowerCase()) {
            return maybeHex;
        }
    } catch {
        // Ignore parse error and fall back to hash-based derivation.
    }

    return crypto.createHash('sha256').update(raw).digest();
};

const encryptSecret = (plainText) => {
    const token = String(plainText || '').trim();
    if (!token) return '';
    if (token.startsWith(ENCRYPTION_PREFIX)) return token;

    const key = getRawKeyBuffer();
    if (!key) return token;

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
};

const decryptSecret = (value) => {
    const token = String(value || '').trim();
    if (!token) return '';
    if (!token.startsWith(ENCRYPTION_PREFIX)) return token;

    const key = getRawKeyBuffer();
    if (!key) return token;

    try {
        const payload = token.slice(ENCRYPTION_PREFIX.length);
        const [ivBase64, authTagBase64, cipherBase64] = payload.split(':');
        if (!ivBase64 || !authTagBase64 || !cipherBase64) return '';

        const iv = Buffer.from(ivBase64, 'base64');
        const authTag = Buffer.from(authTagBase64, 'base64');
        const encrypted = Buffer.from(cipherBase64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return plain.toString('utf8');
    } catch {
        return '';
    }
};

module.exports = {
    encryptSecret,
    decryptSecret
};
