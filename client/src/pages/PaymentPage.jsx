import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || '1398984938111369256';

const PaymentPage = () => {
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const total = params.get('total');
  const channelId = params.get('channelId');
  const paidFromUrl = params.get('paid') === '1';
  const [ltcData, setLtcData] = useState(null);
  const [ltcLoading, setLtcLoading] = useState(false);
  const [paypalLoading, setPaypalLoading] = useState(false);
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

  const ticketUrl = channelId ? `discord://discord.com/channels/${GUILD_ID}/${channelId}` : null;
  const totalNum = parseFloat(total);

  const handlePayPal = async () => {
    setPaypalLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, totalAmount: totalNum, method: 'paypal' });
      if (res.data.approvalLink) {
        window.location.href = res.data.approvalLink;
      } else {
        alert('PayPal not available. Please use Discord ticket.');
      }
    } catch {
      alert('PayPal not available. Please use Discord ticket.');
    } finally {
      setPaypalLoading(false);
    }
  };

  const handleLTC = async () => {
    setLtcLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, totalAmount: totalNum, method: 'ltc' });
      if (res.data.payAddress) setLtcData(res.data);
      else alert('LTC payment not available right now.');
    } catch {
      alert('LTC payment not available right now.');
    } finally {
      setLtcLoading(false);
    }
  };

  if (paid) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-[#1c1c1e] rounded-2xl p-8 max-w-md w-full border border-[#2c2c2e] text-center">
          <div className="text-4xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-white mb-2">Payment Received!</h2>
          <p className="text-gray-400 mb-6">Order {orderId} has been paid.</p>
          {ticketUrl && (
            <a href={ticketUrl} className="block w-full py-3 min-h-[44px] text-center bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition touch-manipulation">
              Open Discord Ticket
            </a>
          )}
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

        {/* Pay with PayPal or Card - redirect sang trang PayPal */}
        <button
          onClick={handlePayPal}
          disabled={paypalLoading}
          className="w-full py-3 min-h-[44px] bg-[#0070BA] hover:bg-[#005ea6] active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-xl transition mb-4 touch-manipulation"
        >
          {paypalLoading ? 'Loading...' : 'Pay with PayPal or Card'}
        </button>
        <p className="text-gray-500 text-xs mb-6">Opens PayPal to pay with account or debit/credit card</p>

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
              ← Back / Change payment method
            </button>
            <p className="text-gray-400 text-xs mb-1">Send exactly:</p>
            <p className="text-white font-mono font-bold text-lg mb-2">{ltcData.payAmount} {ltcData.payCurrency?.toUpperCase()}</p>
            <p className="text-gray-400 text-xs mb-1">To address:</p>
            <p className="text-white font-mono text-xs break-all bg-[#1a1a1c] p-2 rounded mb-2">{ltcData.payAddress}</p>
            <p className="text-yellow-400 text-[10px]">Payment confirms automatically once blockchain verifies.</p>
          </div>
        )}

        {ticketUrl && (
          <a href={ticketUrl} className="block w-full py-3 mt-6 text-center bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition">
            Open Discord Ticket
          </a>
        )}

        <a href="/" className="block mt-3 text-center text-gray-500 hover:text-white text-sm">Back to shop</a>
      </div>
    </div>
  );
};

export default PaymentPage;
