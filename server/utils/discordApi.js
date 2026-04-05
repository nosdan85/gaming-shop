/**
 * Discord API caller with retry for rate limits (429) and Cloudflare blocks (1015 → 403/503).
 * Render IPs can get temporarily blocked by Discord/Cloudflare.
 */
const axios = require('axios');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isTemporaryCloudflareBlock = (status, data) => {
  if (status !== 403) return false;
  const text = typeof data === 'string' ? data.toLowerCase() : JSON.stringify(data || {}).toLowerCase();
  return (
    text.includes('cloudflare') ||
    text.includes('1015') ||
    text.includes('temporarily blocked') ||
    text.includes('temporarily unavailable')
  );
};

const isRetryable = (err) => {
  const status = err.response?.status;
  const data = err.response?.data;
  return status === 429 || (status >= 500 && status < 600) || isTemporaryCloudflareBlock(status, data);
};

const discordRequest = async (config, retries = 0) => {
  try {
    const res = await axios({
      ...config,
      headers: {
        'User-Agent': 'GamingShop/1.0 (+https://github.com)',
        ...config.headers,
      },
      timeout: 15000,
    });
    return res;
  } catch (err) {
    if (retries < MAX_RETRIES && isRetryable(err)) {
      const retryAfterHeader = Number(err.response?.headers?.['retry-after']);
      const headerDelayMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 0;
      const delay = headerDelayMs || BASE_DELAY_MS * Math.pow(2, retries);
      console.warn(`Discord API ${err.response?.status || 'error'}, retry ${retries + 1}/${MAX_RETRIES} in ${delay}ms`);
      await sleep(delay);
      return discordRequest(config, retries + 1);
    }
    throw err;
  }
};

module.exports = { discordRequest };
