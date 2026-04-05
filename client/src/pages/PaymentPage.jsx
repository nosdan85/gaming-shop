import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || '';
const VALID_GUILD = Boolean(GUILD_ID && String(GUILD_ID).trim().length > 0);

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
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(null);
  const [paid, setPaid] = useState(paidFromUrl);
  const [orderInfo, setOrderInfo] = useState(null);
  const [orderInfoLoading, setOrderInfoLoading] = useState(true);
  const [orderInfoError, setOrderInfoError] = useState('');
  const [paypalFFData, setPaypalFFData] = useState(null);
  const [paypalFFLoading, setPaypalFFLoading] = useState(false);
  const [paypalTicketLoading, setPaypalTicketLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (paidFromUrl) setPaid(true);
  }, [paidFromUrl]);

  useEffect(() => {
    if (!orderId) {
      setOrderInfoLoading(false);
      setOrderInfoError('Invalid payment link.');
      return;
    }

    setOrderInfoLoading(true);
    setOrderInfoError('');
    axios.get(`/api/shop/order-payment-info?orderId=${encodeURIComponent(orderId)}`)
      .then((res) => {
        setOrderInfo(res.data);
        if (res.data?.isPaid) setPaid(true);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          setOrderInfoError('Session expired. Please login Discord again.');
        } else if (err.response?.status === 403) {
          setOrderInfoError('You do not have access to this order.');
        } else if (err.response?.status === 404) {
          setOrderInfoError('Order not found.');
        } else {
          setOrderInfoError(err.response?.data?.error || 'Failed to load order.');
        }
      })
      .finally(() => setOrderInfoLoading(false));
  }, [orderId]);

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
        <p>Loading order...</p>
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

  const handlePayPal = async () => {
    setPaypalLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, method: 'paypal' });
      if (res.data.approvalLink) {
        window.location.href = res.data.approvalLink;
      } else {
        alert('PayPal is not available right now.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'PayPal is not available right now.');
    } finally {
      setPaypalLoading(false);
    }
  };

  const handleLTC = async () => {
    setLtcLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, method: 'ltc' });
      if (res.data.payAddress) setLtcData(res.data);
      else alert('LTC payment not available.');
    } catch (err) {
      alert(err.response?.data?.error || 'LTC payment not available.');
    } finally {
      setLtcLoading(false);
    }
  };

  const handleCashAppRobux = async () => {
    setTicketLoading('ticket');
    try {
      const res = await axios.post('/api/shop/create-ticket', { orderId });
      const data = res.data;
      if (data.channelId) {
        openTicketChannel(data.channelId);
      } else {
        alert('Could not create ticket. Try again.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Could not create ticket. Try again.');
    } finally {
      setTicketLoading(null);
    }
  };

  const handlePayPalFF = async () => {
    setPaypalFFLoading(true);
    try {
      const res = await axios.get('/api/shop/paypal-email');
      setPaypalFFData({ channelId: null, email: res.data?.email || '' });
    } catch {
      setPaypalFFData({ channelId: null, email: '' });
    } finally {
      setPaypalFFLoading(false);
    }
  };

  const handleOpenPayPalTicket = async () => {
    setPaypalTicketLoading(true);
    try {
      const res = await axios.post('/api/shop/create-ticket-paypal-ff', { orderId });
      const { channelId, email } = res.data || {};
      setPaypalFFData((prev) => ({ ...prev, channelId: channelId || null, email: email || prev?.email || '' }));
      if (channelId) openTicketChannel(channelId);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not create ticket. Try again.');
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
        <p className="text-gray-400 text-sm mb-6">Total: <span className="text-white font-bold">${totalNum.toFixed(2)}</span></p>

        <button
          onClick={handlePayPal}
          disabled={paypalLoading}
          className="w-full py-3 min-h-[44px] bg-[#0070BA] hover:bg-[#005ea6] active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition mb-4 touch-manipulation"
        >
          {paypalLoading ? 'Loading...' : 'Pay with PayPal or Card'}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#2c2c2e]" />
          <span className="text-gray-600 text-xs">or</span>
          <div className="flex-1 h-px bg-[#2c2c2e]" />
        </div>

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
              disabled={paypalTicketLoading}
              className="w-full mt-3 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] disabled:opacity-50 text-white font-bold rounded-xl transition text-sm"
            >
              {paypalTicketLoading ? 'Creating...' : 'Open Ticket'}
            </button>
          </div>
        )}

        <button
          onClick={handleCashAppRobux}
          disabled={ticketLoading !== null}
          className="w-full py-3 min-h-[44px] bg-[#00D632] hover:bg-[#00b329] active:scale-[0.98] disabled:opacity-50 text-black font-bold rounded-xl transition mb-4 touch-manipulation"
        >
          {ticketLoading === 'ticket' ? 'Loading...' : 'Pay with CashApp or Robux'}
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
            <p className="text-gray-400 text-xs mb-1">Send exactly:</p>
            <p className="text-white font-mono font-bold text-lg mb-2">{ltcData.payAmount} {ltcData.payCurrency?.toUpperCase()}</p>
            <p className="text-gray-400 text-xs mb-1">To address:</p>
            <p className="text-white font-mono text-xs break-all bg-[#1a1a1c] p-2 rounded mb-2">{ltcData.payAddress}</p>
            <p className="text-yellow-400 text-[10px]">Payment confirms automatically.</p>
          </div>
        )}

        <a href="/" className="block mt-6 text-center text-gray-500 hover:text-white text-sm">Back to shop</a>
      </div>
    </div>
  );
};

export default PaymentPage;
