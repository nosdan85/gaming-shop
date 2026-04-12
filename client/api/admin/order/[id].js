import { proxyToBackendPath } from '../../_proxy.js';

const getId = (value) => {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
};

export default async function handler(req, res) {
    const id = getId(req.query?.id);
    if (!id) {
        return res.status(400).json({ error: 'Missing admin order id' });
    }

    return proxyToBackendPath(req, res, `/api/admin/order/${encodeURIComponent(id)}`);
}
