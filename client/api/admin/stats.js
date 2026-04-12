import { proxyToBackendPath } from '../_proxy.js';

export default async function handler(req, res) {
    return proxyToBackendPath(req, res, '/api/admin/stats');
}
