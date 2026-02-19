import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || '';

const PaymentPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const total = params.get('total');
  const paidFromUrl = params.get('paid') === '1';
  const [ltcData, setLtcData] = useState(null);
  const [ltcLoading, setLtcLoading] = useState(false);
  const [paypalLoading, setPaypalLoading] = useState(false);
  const [ticketLoading, setTicketLoading] = useState(null);
  const [ticketData, setTicketData] = useState(null);
  const [paid, setPaid] = useState(paidFromUrl);

  useEffect(() => {
    if (paidFromUrl) setPaid(true);
  }, [paidFromUrl]);

  if (!orderId || !total) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white p-4">
        <p>Invalid payment link. <a href="/" className="text-blue-400 underline">Go back</a></p>
      </div>
    );
  }

  const ticketUrl = ticketData?.channelId ? `https://discord.com/channels/${GUILD_ID}/${ticketData.channelId}` : null;
  const totalNum = parseFloat(total);

  const handlePayPal = async () => {
    setPaypalLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, totalAmount: totalNum, method: 'paypal' });
      if (res.data.approvalLink) {
        window.location.href = res.data.approvalLink;
      } else {
        alert('PayPal not available.');
      }
    } catch {
      alert('PayPal not available.');
    } finally {
      setPaypalLoading(false);
    }
  };

  const handleLTC = async () => {
    setLtcLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, totalAmount: totalNum, method: 'ltc' });
      if (res.data.payAddress) setLtcData(res.data);
      else alert('LTC payment not available.');
    } catch {
      alert('LTC payment not available.');
    } finally {
      setLtcLoading(false);
    }
  };

  // Chỉ nút CashApp/Robux mới tạo ticket
  const handleCashAppRobux = async () => {
    setTicketLoading('ticket');
    try {
      const res = await axios.post('/api/shop/create-ticket', { orderId });
      const data = res.data;
      if (data.channelId) {
        setTicketData({ channelId: data.channelId });
        const linkMethod = localStorage.getItem('discordLinkMethod') || 'web';
        const ticketUrl = linkMethod === 'app'
          ? `discord://discord.com/channels/${GUILD_ID}/${data.channelId}`
          : `https://discord.com/channels/${GUILD_ID}/${data.channelId}`;
        window.open(ticketUrl, '_blank');
      } else {
        alert('Could not create ticket. Try again.');
      }
    } catch {
      alert('Could not create ticket. Try again.');
    } finally {
      setTicketLoading(null);
    }
  };

  // PayPal F&F: show email + create ticket paypal_1, paypal_2... + redirect to ticket
  const [paypalFFData, setPaypalFFData] = useState(null);
  const [paypalFFLoading, setPaypalFFLoading] = useState(false);
  const handlePayPalFF = async () => {
    setPaypalFFLoading(true);
    try {
      const res = await axios.post('/api/shop/create-ticket-paypal-ff', { orderId });
      const { channelId, email } = res.data || {};
      setPaypalFFData({ channelId, email: email || '' });
      if (channelId) {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const useApp = isMobile || (localStorage.getItem('discordLinkMethod') === 'app');
        const ticketUrl = useApp
          ? `discord://discord.com/channels/${GUILD_ID}/${channelId}`
          : `https://discord.com/channels/${GUILD_ID}/${channelId}`;
        window.open(ticketUrl, '_blank');
      }
    } catch {
      setPaypalFFData({ channelId: null, email: '' });
    } finally {
      setPaypalFFLoading(false);
    }
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-[#1c1c1e] rounded-2xl p-8 max-w-md w-full border border-[#2c2c2e] text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Received!</h2>
          <p className="text-gray-400 mb-6">Order {orderId} has been paid.</p>
          <a href="/" className="block mt-3 text-gray-500 hover:text-white text-sm">Back to shop</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-black flex items-center justify-center p-4">
      <div className="bg-[#1c1c1e] rounded-2xl p-6 max-w-md w-full border border-[#2c2c2e] overflow-hidden">
        <h2 className="text-xl font-bold text-white mb-1">Pay for Order {orderId}</h2>
        <p className="text-gray-400 text-sm mb-6">Total: <span className="text-white font-bold">${totalNum.toFixed(2)}</span></p>

        <button
          onClick={handlePayPal}
          disabled={paypalLoading}
          className="w-full py-3 min-h-[44px] bg-[#0070BA] hover:bg-[#005ea6] active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition mb-4 touch-manipulation"
        >
          {paypalLoading ? 'Loading...' : 'Pay with PayPal or Card'}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-[#2c2c2e]"/>
          <span className="text-gray-600 text-xs">or</span>
          <div className="flex-1 h-px bg-[#2c2c2e]"/>
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
            <p className="text-white font-mono font-bold break-all">{paypalFFData.email || '(PAYPAL_EMAIL not configured)'}</p>
            <p className="text-gray-500 text-xs mt-2">Opening your ticket — upload payment screenshot there.</p>
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
          <div className="flex-1 h-px bg-[#2c2c2e]"/>
          <span className="text-gray-600 text-xs">or</span>
          <div className="flex-1 h-px bg-[#2c2c2e]"/>
        </div>

        {!ltcData ? (
          <button onClick={handleLTC} disabled={ltcLoading} className="w-full py-3 min-h-[44px] bg-[#333] hover:bg-[#444] active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition touch-manipulation">
            {ltcLoading ? 'Loading...' : 'Pay with LTC (Litecoin)'}
          </button>
        ) : (
          <div className="bg-[#0a0a0c] rounded-xl p-4 border border-[#2c2c2e]">
            <button onClick={() => setLtcData(null)} className="text-gray-400 hover:text-white text-xs mb-3 flex items-center gap-1">
              ← Back
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
