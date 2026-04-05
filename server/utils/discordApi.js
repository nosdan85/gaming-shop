/**
 * Discord API caller with bounded retry for temporary rate limits/Cloudflare blocks.
 * Never waits for extremely long Retry-After windows in request/response cycle.
 */
const axios = require('axios');

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 1500;
const DEFAULT_MAX_DELAY_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isTemporaryCloudflareBlock = (status, data) => {
  if (status !== 403) return false;
  const text = typeof data === 'string' ? data.toLowerCase() : JSON.stringify(data || {}).toLowerCase();
  return (
    text.includes('cloudflare')
    || text.includes('1015')
    || text.includes('temporarily blocked')
    || text.includes('temporarily unavailable')
  );
};

const isRetryable = (err) => {
  const status = err.response?.status;
  const data = err.response?.data;
  return status === 429 || (status >= 500 && status < 600) || isTemporaryCloudflareBlock(status, data);
};

const normalizeRetryAfterToMs = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Discord can return retry windows in seconds (decimal) or sometimes in ms.
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
};

const getRetryDelayMs = (err, retries, baseDelayMs, maxDelayMs) => {
  const headerDelayMs = normalizeRetryAfterToMs(err.response?.headers?.['retry-after']);
  const bodyDelayMs = normalizeRetryAfterToMs(err.response?.data?.retry_after);
  const backoffMs = Math.round(baseDelayMs * Math.pow(2, retries));
  const rawDelay = Math.max(headerDelayMs, bodyDelayMs, backoffMs);
  return Math.min(rawDelay, maxDelayMs);
};

const discordRequest = async (config, retries = 0, options = {}) => {
  const maxRetries = Number.isInteger(options.maxRetries) ? options.maxRetries : DEFAULT_MAX_RETRIES;
  const baseDelayMs = Number.isFinite(options.baseDelayMs) ? options.baseDelayMs : DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = Number.isFinite(options.maxDelayMs) ? options.maxDelayMs : DEFAULT_MAX_DELAY_MS;
  const noRetry = options.noRetry === true;

  try {
    const res = await axios({
      ...config,
      headers: {
        'User-Agent': 'GamingShop/1.0 (+https://github.com)',
        ...config.headers
      },
      timeout: 15000
    });
    return res;
  } catch (err) {
    if (noRetry) throw err;

    if (retries < maxRetries && isRetryable(err)) {
      const delay = getRetryDelayMs(err, retries, baseDelayMs, maxDelayMs);
      console.warn(
        `Discord API ${err.response?.status || 'error'}, retry ${retries + 1}/${maxRetries} in ${delay}ms`
      );
      await sleep(delay);
      return discordRequest(config, retries + 1, options);
    }
    throw err;
  }
};

module.exports = { discordRequest };
