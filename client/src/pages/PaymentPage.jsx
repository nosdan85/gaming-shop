import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { COUNTRY_TIMEZONES, getTimezoneByCode, groupSlotsByDate } from '../utils/timezones';

const GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || '';
const VALID_GUILD = Boolean(GUILD_ID && String(GUILD_ID).trim().length > 0);
const REQUEST_TIMEOUT_MS = 15000;
const TICKET_REQUEST_TIMEOUT_MS = 30000;
const DEFAULT_RETRY_AFTER_MS = 5000;
const DEFAULT_PAYPAL_EMAIL = 'nguyenquanghuy111106@gmail.com';
const DEFAULT_CASHAPP_HANDLE = '$yoko276';

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

const formatOrderItemNote = (items) => {
  const names = Array.isArray(items)
    ? items
      .map((item) => String(item?.name || '').trim())
      .filter(Boolean)
    : [];
  return names.join(', ') || 'Item';
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
  const [cashAppData, setCashAppData] = useState(null);
  const [paypalFFLoading, setPaypalFFLoading] = useState(false);
  const [paypalTicketLoading, setPaypalTicketLoading] = useState(false);
  const [paypalEmailCopied, setPaypalEmailCopied] = useState(false);
  const [paypalItemCopied, setPaypalItemCopied] = useState(false);
  const [cashAppTagCopied, setCashAppTagCopied] = useState(false);
  const [cashAppItemCopied, setCashAppItemCopied] = useState(false);
  const [ltcAddressCopied, setLtcAddressCopied] = useState(false);
  const [ltcTicketLoading, setLtcTicketLoading] = useState(false);
  const [ticketRetryInSeconds, setTicketRetryInSeconds] = useState(0);
  const [paypalTicketRetryInSeconds, setPaypalTicketRetryInSeconds] = useState(0);
  const [ltcTicketRetryInSeconds, setLtcTicketRetryInSeconds] = useState(0);
  const [robloxUsername, setRobloxUsername] = useState('');
  const [robloxResult, setRobloxResult] = useState(null);
  const [robloxLoading, setRobloxLoading] = useState(false);
  const [customerCountry, setCustomerCountry] = useState('US');
  const customerTimezone = getTimezoneByCode(customerCountry);
  const [deliverySlots, setDeliverySlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [confirmCoupon, setConfirmCoupon] = useState('');
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

  const getOAuthUrl = () => {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '';
    const rawRedirectUri = import.meta.env.VITE_DISCORD_REDIRECT_URI;
    const redirectUri = typeof rawRedirectUri === 'string' && rawRedirectUri.trim()
      ? rawRedirectUri.trim()
      : `${window.location.origin}/auth/discord/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds.join'
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  };

  const handleDiscordLogin = () => {
    localStorage.setItem('discordLinkMethod', 'web');
    window.location.href = getOAuthUrl();
  };

  const loadDeliverySlots = useCallback(async (tzOverride) => {
    setSlotsLoading(true);
    try {
      const tz = tzOverride || getTimezoneByCode(customerCountry);
      const { data } = await axios.get(`/api/shop/delivery-slots?timezone=${encodeURIComponent(tz)}`);
      setDeliverySlots(Array.isArray(data?.slots) ? data.slots : []);
    } catch {
      setDeliverySlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [customerCountry]);

  useEffect(() => {
    if (paid) loadDeliverySlots();
  }, [paid, loadDeliverySlots]);

  const handleSearchRoblox = async () => {
    setRobloxLoading(true);
    setRobloxResult(null);
    try {
      const { data } = await axios.get(`/api/shop/roblox/search?username=${encodeURIComponent(robloxUsername)}`);
      setRobloxResult(data);
    } catch (err) {
      alert(err.response?.data?.error || 'Roblox user not found.');
    } finally {
      setRobloxLoading(false);
    }
  };

  const handleConfirmRoblox = async () => {
    if (!robloxResult) return;
    try {
      await axios.post(`/api/shop/orders/${encodeURIComponent(orderId)}/link-roblox`, robloxResult);
      await fetchOrderInfo({ showLoader: true });
      alert('Roblox account linked.');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not link Roblox.');
    }
  };

  const handleSelectSlot = async (slotId) => {
    try {
      await axios.post(`/api/shop/orders/${encodeURIComponent(orderId)}/delivery-slot`, {
        slotId,
        customerTimezone
      });
      await fetchOrderInfo({ showLoader: true });
      alert('Delivery time selected.');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not select delivery time.');
    }
  };

  const handleConfirmDelivery = async () => {
    if (!window.confirm('Only confirm if you are 100% sure you received your items. Continue?')) return;
    setConfirmingDelivery(true);
    try {
      const { data } = await axios.post(`/api/shop/orders/${encodeURIComponent(orderId)}/confirm-delivery`);
      setConfirmCoupon(data?.couponCode || '');
      await fetchOrderInfo({ showLoader: true });
    } catch (err) {
      alert(err.response?.data?.error || 'Could not confirm delivery.');
    } finally {
      setConfirmingDelivery(false);
    }
  };

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
      <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center text-[var(--color-text-primary)] p-4">
        <p>Invalid payment link. <a href="/" className="text-[var(--color-accent)] underline">Go back</a></p>
      </div>
    );
  }

  if (orderInfoLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center text-[var(--color-text-primary)] p-4">
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
      <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center text-[var(--color-text-primary)] p-4">
        <div className="max-w-md w-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-6 text-center">
          <h2 className="text-xl font-gothic mb-3">Cannot open payment page</h2>
          <p className="text-[var(--color-text-secondary)] text-sm font-serif">{orderInfoError || 'Unknown error'}</p>
          <a href="/" className="inline-block mt-5 text-[var(--color-accent)] underline">Back to shop</a>
        </div>
      </div>
    );
  }

  const totalNum = Number(orderInfo.totalAmount || 0);
  const subtotalNum = Number(orderInfo.subtotalAmount || totalNum || 0);
  const discountAmountNum = Number(orderInfo.discountAmount || 0);
  const discountPercentNum = Number(orderInfo.discountPercent || 0);
  const orderItemNote = formatOrderItemNote(orderInfo?.items);
  const cashAppAmountNum = Math.max(0, Number((totalNum * 1.1).toFixed(2)));

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

  const handleCashApp = () => {
    setCashAppData({
      channelId: orderInfo?.channelId || null,
      handle: DEFAULT_CASHAPP_HANDLE,
    });
  };

  const handleOpenCashAppTicket = async () => {
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
        setCashAppData((prev) => ({
          ...(prev || { handle: DEFAULT_CASHAPP_HANDLE }),
          channelId: data.channelId
        }));
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
      const res = await axios.post(
        '/api/shop/create-payment',
        { orderId, method: 'paypal_ff' },
        { timeout: REQUEST_TIMEOUT_MS }
      );
      setPaypalFFData({
        channelId: orderInfo?.paypalTicketChannelId || null,
        email: res.data?.email || DEFAULT_PAYPAL_EMAIL,
        memoExpected: res.data?.memoExpected || orderInfo?.memoExpected || ''
      });
    } catch {
      setPaypalFFData({
        channelId: orderInfo?.paypalTicketChannelId || null,
        email: DEFAULT_PAYPAL_EMAIL,
        memoExpected: orderInfo?.memoExpected || ''
      });
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
      const { channelId, email, memoExpected } = res.data || {};
      if (res.data?.mode === 'panel' && res.data?.panelUrl) {
        window.open(res.data.panelUrl, '_blank');
        alert(`Discord ticket panel opened. Please click "Create Ticket" and include Order ID: ${res.data.orderId || orderId}`);
      }
      setPaypalFFData((prev) => ({
        ...prev,
        channelId: channelId || null,
        email: email || prev?.email || DEFAULT_PAYPAL_EMAIL,
        memoExpected: memoExpected || prev?.memoExpected || orderInfo?.memoExpected || ''
      }));
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

  const copyTextValue = async (value, setCopiedState) => {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2000);
    } catch {
      // Ignore clipboard errors.
    }
  };

  const copyPayPalEmail = () => copyTextValue(paypalFFData?.email, setPaypalEmailCopied);
  const paypalMemoExpected = paypalFFData?.memoExpected
    || orderInfo?.memoExpected
    || `NOSMARKET ${String(orderId || '').toUpperCase()} - ${orderItemNote}`;
  const copyPayPalItemName = () => copyTextValue(paypalMemoExpected, setPaypalItemCopied);
  const copyCashAppTag = () => copyTextValue(cashAppData?.handle || DEFAULT_CASHAPP_HANDLE, setCashAppTagCopied);
  const copyCashAppItemName = () => copyTextValue(orderItemNote, setCashAppItemCopied);

  const copyLtcAddress = () => {
    if (!ltcData?.payAddress) return;
    copyTextValue(ltcData.payAddress, setLtcAddressCopied);
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
    const groupedSlots = groupSlotsByDate(deliverySlots, customerTimezone);
    const hasDiscord = Boolean(orderInfo?.discordId);
    const hasRoblox = Boolean(orderInfo?.robloxUsername);
    const hasSlot = Boolean(orderInfo?.deliveryCustomerStartText);
    const stepDone = (done) => done;

    return (
      <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center p-4">
        <div className="bg-[var(--color-bg-secondary)] rounded-[8px] p-6 max-w-2xl w-full border border-[var(--color-border)]">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-gothic text-[var(--color-text-primary)] mb-2">Payment Received!</h2>
          <p className="text-[var(--color-text-secondary)] font-serif mb-6">Complete the steps below to create your delivery ticket.</p>

          <div className="space-y-4 text-left">
            {/* Step 1: Discord */}
            <div className="rounded-[8px] border bg-[var(--color-bg-main)] p-4">
              <p className="font-gothic text-[var(--color-text-primary)] flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-[var(--color-accent)] text-white">1</span>
                Discord account {stepDone(hasDiscord) && <span className="text-[var(--color-success)] text-sm ml-1">✓</span>}
              </p>
              {orderInfo?.discordId ? (
                <p className="text-sm text-[var(--color-success)] mt-1">Linked: {orderInfo.discordUsername || orderInfo.discordId}</p>
              ) : (
                <button onClick={handleDiscordLogin} className="btn-press mt-3 w-full py-2.5 rounded-[8px] bg-[#5865F2] text-white font-gothic">Login Discord</button>
              )}
            </div>

            {/* Step 2: Timezone + Slot */}
            <div className="rounded-[8px] border bg-[var(--color-bg-main)] p-4">
              <p className="font-gothic text-[var(--color-text-primary)] flex items-center gap-2 mb-3">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-[var(--color-accent)] text-white">2</span>
                Delivery time {stepDone(hasSlot) && <span className="text-[var(--color-success)] text-sm ml-1">✓</span>}
              </p>

              {orderInfo?.deliveryCustomerStartText ? (
                <p className="text-sm text-[var(--color-success)]">
                  {orderInfo.deliveryCustomerStartText} – {orderInfo.deliveryCustomerEndText}
                  <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5">
                    Owner: {orderInfo.deliveryOwnerStartText} – {orderInfo.deliveryOwnerEndText} ({orderInfo.deliveryOwnerTimezone})
                  </span>
                </p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Your country</label>
                    <select
                      value={customerCountry}
                      onChange={(e) => {
                        const code = e.target.value;
                        setCustomerCountry(code);
                        loadDeliverySlots(getTimezoneByCode(code));
                      }}
                      className="w-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                    >
                      {COUNTRY_TIMEZONES.map((c) => (
                        <option key={c.code} value={c.code}>{c.flag} {c.country}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => loadDeliverySlots()}
                    disabled={slotsLoading}
                    className="btn-press w-full py-2 rounded-[8px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] font-gothic text-sm"
                  >
                    {slotsLoading ? 'Loading...' : 'Refresh delivery slots'}
                  </button>

                  {Object.entries(groupedSlots).map(([dateLabel, slots]) => (
                    <div key={dateLabel}>
                      <p className="text-xs text-[var(--color-text-secondary)] font-gothic uppercase mb-1 mt-2">{dateLabel}</p>
                      <div className="space-y-1.5">
                        {slots.map((slot) => (
                          <button
                            key={slot.id}
                            onClick={() => handleSelectSlot(slot.id)}
                            className="btn-press w-full text-left rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 text-sm"
                          >
                            <span className="block text-[var(--color-text-primary)]">
                              {slot.customerStartText} – {slot.customerEndText}
                            </span>
                            <span className="block text-[var(--color-text-secondary)] text-xs">
                              Owner: {slot.ownerStartText} – {slot.ownerEndText} ({slot.ownerTimezone})
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  {!slotsLoading && deliverySlots.length === 0 && (
                    <p className="text-xs text-[var(--color-text-secondary)]">No delivery slots are available yet.</p>
                  )}
                </div>
              )}
            </div>

            {/* Step 3: Roblox */}
            <div className="rounded-[8px] border bg-[var(--color-bg-main)] p-4">
              <p className="font-gothic text-[var(--color-text-primary)] flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-[var(--color-accent)] text-white">3</span>
                Roblox account {stepDone(hasRoblox) && <span className="text-[var(--color-success)] text-sm ml-1">✓</span>}
              </p>
              {orderInfo?.robloxUsername ? (
                <p className="text-sm text-[var(--color-success)] mt-1">Linked: {orderInfo.robloxUsername} ({orderInfo.robloxUserId})</p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={robloxUsername}
                      onChange={(e) => setRobloxUsername(e.target.value)}
                      placeholder="Roblox username"
                      className="flex-1 bg-transparent border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm"
                    />
                    <button onClick={handleSearchRoblox} disabled={robloxLoading}
                      className="btn-press px-4 rounded-[8px] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] font-gothic text-sm">
                      {robloxLoading ? '...' : 'Search'}
                    </button>
                  </div>
                  {robloxResult && (
                    <div className="rounded-[8px] border border-[var(--color-border)] p-3 text-sm">
                      <p>{robloxResult.robloxUsername} ({robloxResult.robloxUserId})</p>
                      <p className="text-[var(--color-text-secondary)]">{robloxResult.robloxDisplayName}</p>
                      <button onClick={handleConfirmRoblox}
                        className="btn-press mt-2 w-full py-2 rounded-[8px] bg-[var(--color-accent)] text-white font-gothic">
                        This is my account
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 4: Ticket */}
            <button
              onClick={handleOpenCashAppTicket}
              disabled={!hasDiscord || !hasSlot}
              className="btn-press w-full py-3 rounded-[8px] bg-[var(--color-accent)] text-white font-gothic disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {orderInfo?.channelId ? 'Open Ticket' : 'Create Ticket'}
            </button>

            {/* Confirmation block */}
            {orderInfo?.confirmationRequestedAt && !orderInfo?.confirmedAt && (
              <div className="rounded-[8px] border border-[rgba(207,45,86,0.5)] bg-[rgba(207,45,86,0.12)] p-4 text-center">
                <p className="text-[var(--color-error)] text-xl font-gothic font-bold">Only press confirm if you are sure you received your items.</p>
                <button onClick={handleConfirmDelivery} disabled={confirmingDelivery}
                  className="btn-press mt-3 w-full py-3 rounded-[8px] bg-[var(--color-error)] text-white font-gothic">
                  {confirmingDelivery ? 'Confirming...' : 'Confirm Delivery'}
                </button>
              </div>
            )}

            {(confirmCoupon || orderInfo?.confirmationDiscountCode) && (
              <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-4 text-center">
                <p className="text-[var(--color-success)] font-gothic">Your 5% next-order coupon:</p>
                <code className="block mt-2 text-lg">{confirmCoupon || orderInfo.confirmationDiscountCode}</code>
              </div>
            )}
          </div>

          <a href="/" className="block mt-6 text-center text-[var(--color-text-secondary)] hover:text-[var(--color-error)] text-sm">Back to shop</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-[var(--color-bg-main)] flex items-center justify-center p-4">
      <div className="bg-[var(--color-bg-secondary)] rounded-[8px] p-6 max-w-md w-full border border-[var(--color-border)] overflow-hidden">
        <h2 className="text-xl font-gothic text-[var(--color-text-primary)] mb-1">Complete Payment</h2>
        {discountAmountNum > 0 ? (
          <div className="mb-6 text-sm">
            <p className="text-[var(--color-text-secondary)]">Subtotal: <span className="text-[var(--color-text-primary)] font-gothic">${subtotalNum.toFixed(2)}</span></p>
            <p className="text-[var(--color-text-secondary)]">
              Discount ({discountPercentNum}%):
              <span className="text-[var(--color-success)] font-gothic"> -${discountAmountNum.toFixed(2)}</span>
            </p>
            <p className="text-[var(--color-text-secondary)]">Total: <span className="text-[var(--color-text-primary)] font-gothic">${totalNum.toFixed(2)}</span></p>
          </div>
        ) : (
          <p className="text-[var(--color-text-secondary)] text-sm mb-6">Total: <span className="text-[var(--color-text-primary)] font-gothic">${totalNum.toFixed(2)}</span></p>
        )}

        {orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'creating' && !orderInfo?.channelId && (
          <div className="mb-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] px-4 py-3 text-sm text-[var(--color-gold)]">
            Creating your Discord ticket. Please do not tap repeatedly.
            {ticketRetryInSeconds > 0 ? ` Retry in ${ticketRetryInSeconds}s.` : ''}
          </div>
        )}

        {orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'failed' && orderInfo?.ticketError && (
          <div className="mb-4 rounded-[8px] border border-[rgba(207,45,86,0.3)] bg-[rgba(207,45,86,0.1)] px-4 py-3 text-sm text-[var(--color-error)]">
            {orderInfo.ticketError}
          </div>
        )}

        <button
          onClick={handlePayPalFF}
          disabled={paypalFFLoading}
          className={`btn-press w-full py-3 min-h-[44px] active:scale-[0.98] disabled:opacity-50 rounded-[8px] font-gothic transition mb-2 touch-manipulation ${
            paypalFFData !== null
              ? 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white border border-transparent'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:text-[var(--color-accent)]'
          }`}
        >
          {paypalFFLoading ? 'Loading...' : 'Pay with PayPal (Friends & Family)'}
        </button>

        {paypalFFData !== null && (
          <div className="bg-[var(--color-bg-main)] rounded-[8px] p-4 border border-[var(--color-border)] mb-4 text-sm text-[var(--color-text-primary)]">
            <p className="text-[var(--color-text-primary)] font-gothic mb-2">💳 PayPal Payment Guide</p>
            <p><span className="font-semibold">Method:</span> <span className="font-bold">Friends and Family</span></p>
            <p className="mt-1">
              <span className="font-semibold">Send ${totalNum.toFixed(2)} to:</span>
            </p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 break-all flex-1">
                {paypalFFData.email || DEFAULT_PAYPAL_EMAIL}
              </code>
              <button
                onClick={copyPayPalEmail}
                className="btn-press flex-shrink-0 px-3 py-1 border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-xs font-gothic rounded-pill transition"
              >
                {paypalEmailCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-3"><span className="font-bold">1.</span> Choose <span className="font-bold">Friends and Family</span></p>
            <p className="mt-1"><span className="font-bold">2.</span> Write this exact note:</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 break-all flex-1">
                {paypalMemoExpected}
              </code>
              <button
                onClick={copyPayPalItemName}
                className="btn-press flex-shrink-0 px-3 py-1 border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-xs font-gothic rounded-pill transition"
              >
                {paypalItemCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-3"><span className="font-bold">3.</span> Send the <span className="font-bold">payment screenshot</span> in the ticket</p>
            <button
              onClick={handleOpenPayPalTicket}
              disabled={paypalTicketLoading || paypalTicketRetryInSeconds > 0}
              className="btn-press w-full mt-3 py-2.5 bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:text-[var(--color-accent)] disabled:opacity-50 font-gothic rounded-[8px] transition text-sm"
            >
              {paypalTicketLoading
                ? 'Creating...'
                : paypalTicketRetryInSeconds > 0
                  ? `Retry in ${paypalTicketRetryInSeconds}s`
                  : (paypalFFData?.channelId || orderInfo?.paypalTicketChannelId)
                    ? 'Open PayPal Ticket'
                    : 'Create PayPal Ticket'}
            </button>
          </div>
        )}

        <button
          onClick={handleCashApp}
          className={`btn-press w-full py-3 min-h-[44px] active:scale-[0.98] rounded-[8px] font-gothic transition mb-2 touch-manipulation ${
            cashAppData !== null
              ? 'bg-[var(--color-success)] text-white border border-transparent'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:text-[var(--color-success)]'
          }`}
        >
          Pay with Cash App
        </button>
        {cashAppData !== null && (
          <div className="bg-[var(--color-bg-main)] rounded-[8px] p-4 border border-[var(--color-border)] mb-4 text-sm text-[var(--color-text-primary)]">
            <p className="text-[var(--color-text-primary)] font-gothic mb-2">💸 Cash App Payment Guide</p>
            <p><span className="font-semibold">Send ${cashAppAmountNum.toFixed(2)} to:</span></p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 break-all flex-1">
                {cashAppData?.handle || DEFAULT_CASHAPP_HANDLE}
              </code>
              <button
                onClick={copyCashAppTag}
                className="btn-press flex-shrink-0 px-3 py-1 border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-xs font-gothic rounded-pill transition"
              >
                {cashAppTagCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-3"><span className="font-bold">1.</span> Send the payment to <span className="font-bold">{cashAppData?.handle || DEFAULT_CASHAPP_HANDLE}</span></p>
            <p className="mt-1"><span className="font-bold">2.</span> Write item name in the note:</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[8px] px-2 py-1 break-all flex-1">
                {orderItemNote}
              </code>
              <button
                onClick={copyCashAppItemName}
                className="btn-press flex-shrink-0 px-3 py-1 border border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-xs font-gothic rounded-pill transition"
              >
                {cashAppItemCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="mt-3"><span className="font-bold">3.</span> Send the <span className="font-bold">payment screenshot</span> in the ticket</p>
            <p className="mt-3 text-[var(--color-gold)] text-xs">Note: Cash App payments include an additional <span className="font-bold">10% conversion fee</span>.</p>
            <button
              onClick={handleOpenCashAppTicket}
              disabled={
                ticketLoading !== null
                || ticketRetryInSeconds > 0
                || (orderInfo?.ticketMode === 'bot' && orderInfo?.ticketStatus === 'creating' && !orderInfo?.channelId)
              }
              className="btn-press w-full mt-3 py-2.5 bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:text-[var(--color-accent)] disabled:opacity-50 font-gothic rounded-[8px] transition text-sm"
            >
              {ticketLoading === 'ticket'
                ? 'Creating...'
                : ticketRetryInSeconds > 0
                  ? `Retry in ${ticketRetryInSeconds}s`
                  : orderInfo?.channelId
                    ? 'Open CashApp Ticket'
                    : 'Create CashApp Ticket'}
            </button>
          </div>
        )}

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[var(--color-border)]" />
          <span className="text-[var(--color-text-secondary)] text-xs">or</span>
          <div className="flex-1 h-px bg-[var(--color-border)]" />
        </div>

        <button
          onClick={ltcData ? () => setLtcData(null) : handleLTC}
          disabled={ltcLoading}
          className={`btn-press w-full py-3 min-h-[44px] active:scale-[0.98] disabled:opacity-50 rounded-[8px] font-gothic transition touch-manipulation ${
            ltcData !== null
              ? 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white border border-transparent'
              : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:text-[var(--color-error)]'
          }`}
        >
          {ltcLoading ? 'Loading...' : 'Pay with LTC (Litecoin)'}
        </button>

        {ltcData !== null && (
          <div className="bg-[var(--color-bg-main)] rounded-[8px] p-4 border border-[var(--color-border)]">
            <button onClick={() => setLtcData(null)} className="btn-press text-[var(--color-text-secondary)] hover:text-[var(--color-error)] font-gothic text-xs mb-3 flex items-center gap-1">
              &larr; Back
            </button>
            <p className="text-[var(--color-text-secondary)] text-xs mb-2">
              Send equivalent of <span className="text-[var(--color-text-primary)] font-gothic">${totalNum.toFixed(2)}</span> in LTC
            </p>
            <p className="text-[var(--color-text-secondary)] text-xs mb-1">To address:</p>
            <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-[8px] p-2 mb-2">
              <p className="text-[var(--color-text-primary)] font-mono text-xs break-all">{ltcData.payAddress}</p>
            </div>
            <button
              onClick={copyLtcAddress}
              className="btn-press w-full mb-3 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-xs font-gothic rounded-[8px] transition"
            >
              {ltcAddressCopied ? 'Address Copied!' : 'Copy LTC Address'}
            </button>
            <img
              src={ltcData.qrImageUrl || '/pictures/payments/ltc.png'}
              alt="LTC QR"
              className="w-full rounded-[8px] border border-[var(--color-border)] mb-3"
            />
            <p className="text-[var(--color-text-secondary)] text-xs mb-3">Send payment, then open ticket and upload proof screenshot.</p>
            <button
              onClick={handleOpenLtcTicket}
              disabled={ltcTicketLoading || ltcTicketRetryInSeconds > 0}
              className="btn-press w-full py-2.5 bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border)] hover:text-[var(--color-accent)] disabled:opacity-50 font-gothic rounded-[8px] transition text-sm"
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

        <a href="/" className="block mt-6 text-center text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] font-gothic text-sm">Back to shop</a>
      </div>
    </div>
  );
};

export default PaymentPage;
