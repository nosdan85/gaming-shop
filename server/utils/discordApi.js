/**
 * Discord API caller with retry for rate limits (429) and Cloudflare blocks (1015 → 403/503).
 * Render IPs can get temporarily blocked by Discord/Cloudflare.
 */
const axios = require('axios');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const isRetryable = (err) => {
  const status = err.response?.status;
  return status === 429 || (status >= 500 && status < 600) || status === 403;
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
      const delay = BASE_DELAY_MS * Math.pow(2, retries);
      console.warn(`Discord API ${err.response?.status || 'error'}, retry ${retries + 1}/${MAX_RETRIES} in ${delay}ms`);
      await sleep(delay);
      return discordRequest(config, retries + 1);
    }
    throw err;
  }
};

module.exports = { discordRequest };
