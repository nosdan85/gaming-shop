import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || '';
const VALID_GUILD = Boolean(GUILD_ID && String(GUILD_ID).trim().length > 0);
const REQUEST_TIMEOUT_MS = 15000;
const TICKET_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_AFTER_MS = 5000;

const normalizeRetryAfterMs = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1000) return Math.round(n);
  return Math.round(n * 1000);
};

const getRetryAfterMsFromError = (err) => {
  const data = err?.response?.data || {};
  const fromBody = Math.max(
    normalizeRetryAfterMs(data?.retryAfterMs),
    normalizeRetryAfterMs(data?.retryAfterSeconds)
  );
  const fromHeader = normalizeRetryAfterMs(err?.response?.headers?.['retry-after']);
  return Math.max(fromBody, fromHeader, 0);
};

const getHttpErrorMessage = (err, fallback) => {
  if (err?.code === 'ECONNABORTED') return 'Request timeout. Please try again.';
  const data = err?.response?.data || {};
  if (
    data?.code === 'TICKET_CREATION_IN_PROGRESS'
    || data?.code === 'PAYPAL_TICKET_CREATION_IN_PROGRESS'
    || data?.code === 'LTC_TICKET_CREATION_IN_PROGRESS'
  ) {
    const retryAfterSeconds = Math.max(
      Number(data?.retryAfterSeconds) || 0,
      Math.ceil(normalizeRetryAfterMs(data?.retryAfterMs) / 1000)
    );
    if (retryAfterSeconds > 0) {
      return `Ticket is already being created. Please wait about ${retryAfterSeconds}s.`;
    }
    return 'Ticket is already being created. Please wait a moment.';
  }
  if (data?.code === 'DISCORD_RATE_LIMITED') {
    const retryAfterSeconds = Math.max(
      Number(data?.retryAfterSeconds) || 0,
      Math.ceil(normalizeRetryAfterMs(data?.retryAfterMs) / 1000)
    );
    if (retryAfterSeconds > 0) {
      return `Discord is temporarily rate limited. Please retry in about ${retryAfterSeconds}s.`;
    }
    return 'Discord is temporarily rate limited. Please retry shortly.';
  }
  return data?.error || fallback;
};

const openTicketChannel = (channelId) => {
  if (!channelId || !VALID_GUILD) return;
  const httpsUrl = `https://discord.com/channels/${GUILD_ID}/${channelId}`;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const linkMethod = localStorage.getItem('discordLinkMethod') || 'web';
  if (isMobile || linkMethod === 'app') {
    const appUrl = `discord://-/channels/${GUILD_ID}/${channelId}`;
    window.location.href = appUrl;
    setTimeout(() => window.open(httpsUrl, '_blank'), 1200);
  } else {
    window.open(httpsUrl, '_blank');
  }
};

const PaymentPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const paidFromUrl = params.get('paid') === '1';
  const [ltcData, setLtcData] = useState(null);
  const [ltcLoading, setLtcLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(null);
  const [paid, setPaid] = useState(paidFromUrl);
  const [orderInfo, setOrderInfo] = useState(null);
  const [orderInfoLoading, setOrderInfoLoading] = useState(true);
  const [orderInfoError, setOrderInfoError] = useState('');
  const [paypalFFData, setPaypalFFData] = useState(null);
  const [paypalFFLoading, setPaypalFFLoading] = useState(false);
  const [paypalTicketLoading, setPaypalTicketLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ltcAddressCopied, setLtcAddressCopied] = useState(false);
  const [ltcTicketLoading, setLtcTicketLoading] = useState(false);
  const [ticketRetryInSeconds, setTicketRetryInSeconds] = useState(0);
  const [paypalTicketRetryInSeconds, setPaypalTicketRetryInSeconds] = useState(0);
  const [ltcTicketRetryInSeconds, setLtcTicketRetryInSeconds] = useState(0);
  const autoOpenedChannelRef = useRef('');

  useEffect(() => {
    if (paidFromUrl) setPaid(true);
  }, [paidFromUrl]);

  const fetchOrderInfo = useCallback(async ({ showLoader = false } = {}) => {
    if (!orderId) return null;
    if (showLoader) {
      setOrderInfoLoading(true);
      setOrderInfoError('');
    }

    try {
      const res = await axios.get(`/api/shop/order-payment-info?orderId=${encodeURIComponent(orderId)}`, {
        timeout: REQUEST_TIMEOUT_MS
      });
      const next = res.data || {};
      setOrderInfo(next);

      if (next?.isPaid) setPaid(true);
      if (next?.channelId && autoOpenedChannelRef.current !== next.channelId) {
        autoOpenedChannelRef.current = next.channelId;
        openTicketChannel(next.channelId);
      }

      if (next?.ticketStatus === 'creating') {
        setTicketRetryInSeconds((prev) => Math.max(prev, Number(next?.ticketRetryAfterSeconds) || 0));
      } else {
        setTicketRetryInSeconds(0);
      }

      if (next?.paypalTicketStatus === 'creating') {
        setPaypalTicketRetryInSeconds((prev) => Math.max(prev, Number(next?.paypalTicketRetryAfterSeconds) || 0));
      } else {
        setPaypalTicketRetryInSeconds(0);
      }

      if (next?.ltcTicketStatus === 'creating') {
        setLtcTicketRetryInSeconds((prev) => Math.max(prev, Number(next?.ltcTicketRetryAfterSeconds) || 0));
      } else {
        setLtcTicketRetryInSeconds(0);
      }

      return next;
    } catch (err) {
      if (showLoader) {
        if (err.response?.status === 401) {
          setOrderInfoError('Session expired. Please login Discord again.');
        } else if (err.response?.status === 403) {
          setOrderInfoError('You do not have access to this order.');
        } else if (err.response?.status === 404) {
          setOrderInfoError('Order not found.');
        } else {
          setOrderInfoError(err.response?.data?.error || 'Failed to load order.');
        }
      }
      throw err;
    } finally {
      if (showLoader) {
        setOrderInfoLoading(false);
      }
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setOrderInfoLoading(false);
      setOrderInfoError('Invalid payment link.');
      return;
    }

    fetchOrderInfo({ showLoader: true }).catch(() => {});
  }, [orderId, fetchOrderInfo]);

  useEffect(() => {
    if (ticketRetryInSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setTicketRetryInSeconds((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [ticketRetryInSeconds]);

  useEffect(() => {
    if (paypalTicketRetryInSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setPaypalTicketRetryInSeconds((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [paypalTicketRetryInSeconds]);

  useEffect(() => {
    if (ltcTicketRetryInSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setLtcTicketRetryInSeconds((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [ltcTicketRetryInSeconds]);

  const ticketMode = orderInfo?.ticketMode;
  const ticketStatus = orderInfo?.ticketStatus;
  const orderChannelId = orderInfo?.channelId;

  useEffect(() => {
    if (!orderId || paid) return undefined;
    if (ticketMode !== 'bot') return undefined;
    if (orderChannelId || ticketStatus !== 'creating') return undefined;

    let cancelled = false;
    let timeoutId = null;
    let attempts = 0;

    const pollOrderInfo = async () => {
      attempts += 1;
      try {
        const next = await fetchOrderInfo();
        if (cancelled) return;

        const shouldContinue = attempts < 12 && next?.ticketStatus === 'creating' && !next?.channelId;
        if (shouldContinue) {
          timeoutId = setTimeout(pollOrderInfo, 2000);
        }
      } catch {
        if (cancelled) return;
        if (attempts < 12) {
          timeoutId = setTimeout(pollOrderInfo, 3000);
        }
      }
    };

    timeoutId = setTimeout(pollOrderInfo, 2000);
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [orderId, paid, ticketMode, ticketStatus, orderChannelId, fetchOrderInfo]);

  if (!orderId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white p-4">
        <p>Invalid payment link. <a href="/" className="text-blue-400 underline">Go back</a></p>
      </div>
    );
  }

  if (orderInfoLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white p-4">
        <div className="products-loader" role="status" aria-live="polite">
          <div className="products-loader-track">
            <span className="products-loader-dog" aria-hidden="true">🐕</span>
          </div>
          <p className="products-loader-text">Loading order...</p>
        </div>
      </div>
    );
  }

  if (orderInfoError || !orderInfo) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-[#1c1c1e] border border-[#2c2c2e] rounded-2xl p-6 text-center">
          <h2 className="text-xl font-bold mb-3">Cannot open payment page</h2>
          <p className="text-gray-400 text-sm">{orderInfoError || 'Unknown error'}</p>
          <a href="/" className="inline-block mt-5 text-blue-400 underline">Back to shop</a>
        </div>
      </div>
    );
  }

  const totalNum = Number(orderInfo.totalAmount || 0);
  const subtotalNum = Number(orderInfo.subtotalAmount || totalNum || 0);
  const discountAmountNum = Number(orderInfo.discountAmount || 0);
  const discountPercentNum = Number(orderInfo.discountPercent || 0);

  const handleLTC = async () => {
    setLtcLoading(true);
    try {
      const res = await axios.post(
        '/api/shop/create-payment',
        { orderId, method: 'ltc' },
        { timeout: REQUEST_TIMEOUT_MS }
      );
      if (res.data.payAddress) {
        setLtcData((prev) => ({ ...(prev || {}), ...res.data }));
      } else {
        alert('LTC payment not available.');
      }
    } catch (err) {
      alert(getHttpErrorMessage(err, 'LTC payment not available.'));
    } finally {
      setLtcLoading(false);
    }
  };

  const handleCashApp = async () => {
    if (orderInfo?.channelId) {
      openTicketChannel(orderInfo.channelId);
      return;
    }
    if (ticketRetryInSeconds > 0) {
      alert(`Please wait about ${ticketRetryInSeconds}s before retrying ticket creation.`);
      return;
    }
    if (orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'creating') {
      const waitText = ticketRetryInSeconds > 0 ? ` (${ticketRetryInSeconds}s)` : '';
      alert(`Discord ticket is still being created${waitText}.`);
      return;
    }

    setTicketLoading('ticket');
    try {
      const res = await axios.post(
        '/api/shop/create-ticket',
        { orderId },
        { timeout: TICKET_REQUEST_TIMEOUT_MS }
      );
      const data = res.data;
      if (data.channelId) {
        setOrderInfo((prev) => (prev ? {
          ...prev,
          channelId: data.channelId,
          ticketStatus: 'created',
          ticketError: ''
        } : prev));
        setTicketRetryInSeconds(0);
        autoOpenedChannelRef.current = data.channelId;
        openTicketChannel(data.channelId);
        await fetchOrderInfo().catch(() => {});
      } else if (data.mode === 'panel' && data.panelUrl) {
        window.open(data.panelUrl, '_blank');
        alert(`Discord ticket panel opened. Please click "Create Ticket" in Discord and include Order ID: ${data.orderId || orderId}`);
      } else {
        alert('Could not create ticket. Try again.');
      }
    } catch (err) {
      const retryAfterMs = getRetryAfterMsFromError(err);
      if (retryAfterMs > 0) {
        setTicketRetryInSeconds(Math.ceil(retryAfterMs / 1000));
      }
      if ([409, 429].includes(Number(err?.response?.status))) {
        setOrderInfo((prev) => (prev ? { ...prev, ticketStatus: 'creating' } : prev));
        const nextPollDelay = Math.max(1500, retryAfterMs || DEFAULT_RETRY_AFTER_MS);
        setTimeout(() => {
          fetchOrderInfo().catch(() => {});
        }, nextPollDelay);
      }
      alert(getHttpErrorMessage(err, 'Could not create ticket. Try again.'));
    } finally {
      setTicketLoading(null);
    }
  };

  const handlePayPalFF = async () => {
    setPaypalFFLoading(true);
    try {
      const res = await axios.get('/api/shop/paypal-email', { timeout: REQUEST_TIMEOUT_MS });
      setPaypalFFData({ channelId: null, email: res.data?.email || '' });
    } catch {
      setPaypalFFData({ channelId: null, email: '' });
    } finally {
      setPaypalFFLoading(false);
    }
  };

  const handleOpenPayPalTicket = async () => {
    if (paypalTicketRetryInSeconds > 0) {
      alert(`Please wait about ${paypalTicketRetryInSeconds}s before retrying.`);
      return;
    }
    setPaypalTicketLoading(true);
    try {
      const res = await axios.post(
        '/api/shop/create-ticket-paypal-ff',
        { orderId },
        { timeout: TICKET_REQUEST_TIMEOUT_MS }
      );
      const { channelId, email } = res.data || {};
      if (res.data?.mode === 'panel' && res.data?.panelUrl) {
        window.open(res.data.panelUrl, '_blank');
        alert(`Discord ticket panel opened. Please click "Create Ticket" and include Order ID: ${res.data.orderId || orderId}`);
      }
      setPaypalFFData((prev) => ({ ...prev, channelId: channelId || null, email: email || prev?.email || '' }));
      setPaypalTicketRetryInSeconds(0);
      if (channelId) openTicketChannel(channelId);
      await fetchOrderInfo().catch(() => {});
    } catch (err) {
      const retryAfterMs = getRetryAfterMsFromError(err);
      if (retryAfterMs > 0) {
        setPaypalTicketRetryInSeconds(Math.ceil(retryAfterMs / 1000));
      }
      alert(getHttpErrorMessage(err, 'Could not create ticket. Try again.'));
    } finally {
      setPaypalTicketLoading(false);
    }
  };

  const copyEmail = () => {
    if (paypalFFData?.email) {
      navigator.clipboard.writeText(paypalFFData.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const copyLtcAddress = () => {
    if (!ltcData?.payAddress) return;
    navigator.clipboard.writeText(ltcData.payAddress);
    setLtcAddressCopied(true);
    setTimeout(() => setLtcAddressCopied(false), 2000);
  };

  const handleOpenLtcTicket = async () => {
    const existingChannelId = orderInfo?.ltcTicketChannelId || ltcData?.channelId;
    if (existingChannelId) {
      openTicketChannel(existingChannelId);
      return;
    }
    if (ltcTicketRetryInSeconds > 0) {
      alert(`Please wait about ${ltcTicketRetryInSeconds}s before retrying.`);
      return;
    }

    setLtcTicketLoading(true);
    try {
      const res = await axios.post(
        '/api/shop/create-ticket-ltc',
        { orderId },
        { timeout: TICKET_REQUEST_TIMEOUT_MS }
      );
      const channelId = res.data?.channelId || null;
      setLtcData((prev) => ({ ...(prev || {}), ...res.data, channelId }));
      setOrderInfo((prev) => (prev ? {
        ...prev,
        ltcTicketChannelId: channelId,
        ltcTicketStatus: channelId ? 'created' : (prev.ltcTicketStatus || 'pending'),
        ltcTicketError: ''
      } : prev));
      setLtcTicketRetryInSeconds(0);
      if (channelId) {
        openTicketChannel(channelId);
      }
      await fetchOrderInfo().catch(() => {});
    } catch (err) {
      const retryAfterMs = getRetryAfterMsFromError(err);
      if (retryAfterMs > 0) {
        setLtcTicketRetryInSeconds(Math.ceil(retryAfterMs / 1000));
      }
      alert(getHttpErrorMessage(err, 'Could not create LTC ticket. Try again.'));
    } finally {
      setLtcTicketLoading(false);
    }
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-[#1c1c1e] rounded-2xl p-8 max-w-md w-full border border-[#2c2c2e] text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Received!</h2>
          <p className="text-gray-400 mb-6">Your order has been paid.</p>
          <a href="/" className="block mt-3 text-gray-500 hover:text-white text-sm">Back to shop</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-black flex items-center justify-center p-4">
      <div className="bg-[#1c1c1e] rounded-2xl p-6 max-w-md w-full border border-[#2c2c2e] overflow-hidden">
        <h2 className="text-xl font-bold text-white mb-1">Complete Payment</h2>
        <p className="text-gray-400 text-sm mb-1">Order: <span className="text-white font-bold">{orderId}</span></p>
        {discountAmountNum > 0 ? (
          <div className="mb-6 text-sm">
            <p className="text-gray-400">Subtotal: <span className="text-white font-bold">${subtotalNum.toFixed(2)}</span></p>
            <p className="text-gray-400">
              Discount ({discountPercentNum}%):
              <span className="text-green-400 font-bold"> -${discountAmountNum.toFixed(2)}</span>
            </p>
            <p className="text-gray-400">Total: <span className="text-white font-bold">${totalNum.toFixed(2)}</span></p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm mb-6">Total: <span className="text-white font-bold">${totalNum.toFixed(2)}</span></p>
        )}

        {orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'creating' && !orderInfo?.channelId && (
          <div className="mb-4 rounded-xl border border-[#2c2c2e] bg-[#111114] px-4 py-3 text-sm text-yellow-300">
            Creating your Discord ticket. Please do not tap repeatedly.
            {ticketRetryInSeconds > 0 ? ` Retry in ${ticketRetryInSeconds}s.` : ''}
          </div>
        )}

        {orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'failed' && orderInfo?.ticketError && (
          <div className="mb-4 rounded-xl border border-[#4b1d1d] bg-[#241010] px-4 py-3 text-sm text-red-300">
            {orderInfo.ticketError}
          </div>
        )}

        <button
          onClick={handlePayPalFF}
          disabled={paypalFFLoading}
          className="w-full py-3 min-h-[44px] bg-[#003087] hover:bg-[#002766] active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition mb-2 touch-manipulation"
        >
          {paypalFFLoading ? 'Loading...' : 'Pay with PayPal (Friends & Family)'}
        </button>
        <p className="text-gray-500 text-xs mb-4">Send as F&F to avoid fees.</p>

        {paypalFFData !== null && (
          <div className="bg-[#0a0a0c] rounded-xl p-4 border border-[#2c2c2e] mb-4">
            <p className="text-gray-400 text-xs mb-1">Send ${totalNum.toFixed(2)} as Friends & Family to:</p>
            <div className="flex items-center gap-2 mt-1">
              <p className="text-white font-mono font-bold break-all flex-1">{paypalFFData.email || '(PAYPAL_EMAIL not configured)'}</p>
              <button
                onClick={copyEmail}
                disabled={!paypalFFData.email}
                className="flex-shrink-0 px-3 py-1.5 bg-[#2c2c2e] hover:bg-[#3f3f46] text-white text-xs font-medium rounded-lg transition"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-3">Upload payment screenshot in your ticket when done.</p>
            <button
              onClick={handleOpenPayPalTicket}
              disabled={paypalTicketLoading || paypalTicketRetryInSeconds > 0}
              className="w-full mt-3 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-bold rounded-xl transition text-sm"
            >
              {paypalTicketLoading
                ? 'Creating...'
                : paypalTicketRetryInSeconds > 0
                  ? `Retry in ${paypalTicketRetryInSeconds}s`
                  : 'Open Ticket'}
            </button>
          </div>
        )}

        <button
          onClick={handleCashApp}
          disabled={
            ticketLoading !== null
            || ticketRetryInSeconds > 0
            || (orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'creating' && !orderInfo?.channelId)
          }
          className="w-full py-3 min-h-[44px] bg-[#00D632] hover:bg-[#00b329] active:scale-[0.98] disabled:opacity-50 text-black font-bold rounded-xl transition mb-4 touch-manipulation"
        >
          {ticketLoading === 'ticket'
            ? 'Loading...'
            : ticketRetryInSeconds > 0
              ? `Retry in ${ticketRetryInSeconds}s`
            : (orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'creating' && !orderInfo?.channelId)
              ? 'Creating Discord Ticket...'
              : orderInfo?.channelId
                ? 'Open Discord Ticket'
                : 'Pay with CashApp'}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#2c2c2e]" />
          <span className="text-gray-600 text-xs">or</span>
          <div className="flex-1 h-px bg-[#2c2c2e]" />
        </div>

        {!ltcData ? (
          <button onClick={handleLTC} disabled={ltcLoading} className="w-full py-3 min-h-[44px] bg-[#333] hover:bg-[#444] active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition touch-manipulation">
            {ltcLoading ? 'Loading...' : 'Pay with LTC (Litecoin)'}
          </button>
        ) : (
          <div className="bg-[#0a0a0c] rounded-xl p-4 border border-[#2c2c2e]">
            <button onClick={() => setLtcData(null)} className="text-gray-400 hover:text-white text-xs mb-3 flex items-center gap-1">
              &larr; Back
            </button>
            <p className="text-gray-400 text-xs mb-1">To address:</p>
            <div className="bg-[#1a1a1c] rounded p-2 mb-2">
              <p className="text-white font-mono text-xs break-all">{ltcData.payAddress}</p>
            </div>
            <button
              onClick={copyLtcAddress}
              className="w-full mb-3 py-2 bg-[#2c2c2e] hover:bg-[#3f3f46] text-white text-xs font-medium rounded-lg transition"
            >
              {ltcAddressCopied ? 'Address Copied!' : 'Copy LTC Address'}
            </button>
            <img
              src={ltcData.qrImageUrl || '/pictures/payments/ltc.png'}
              alt="LTC QR"
              className="w-full rounded-xl border border-[#2c2c2e] mb-3"
            />
            <p className="text-gray-400 text-xs mb-3">Send payment, then open ticket and upload proof screenshot.</p>
            <button
              onClick={handleOpenLtcTicket}
              disabled={ltcTicketLoading || ltcTicketRetryInSeconds > 0}
              className="w-full py-2.5 bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-bold rounded-xl transition text-sm"
            >
              {ltcTicketLoading
                ? 'Creating...'
                : ltcTicketRetryInSeconds > 0
                  ? `Retry in ${ltcTicketRetryInSeconds}s`
                  : (orderInfo?.ltcTicketChannelId || ltcData?.channelId)
                    ? 'Open LTC Ticket'
                    : 'Create LTC Ticket'}
            </button>
          </div>
        )}

        <a href="/" className="block mt-6 text-center text-gray-500 hover:text-white text-sm">Back to shop</a>
      </div>
    </div>
  );
};

export default PaymentPage;
