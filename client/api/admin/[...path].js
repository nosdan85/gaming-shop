import { proxyToBackend } from '../_proxy.js';

export default async function handler(req, res) {
    return proxyToBackend(req, res, '/api/admin');
}
