import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import axios from 'axios';

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || 'AVPlx8eDkocDaO0abVXu79lnxaeGUYdiECWoGhNhS4PAPPpugoCUpkBd8apSRez0R3yVp_9npfJ4tofe';
const GUILD_ID = import.meta.env.VITE_DISCORD_GUILD_ID || '1398984938111369256';

const PaymentPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const orderId = params.get('orderId');
  const total = params.get('total');
  const channelId = params.get('channelId');
  const [ltcData, setLtcData] = useState(null);
  const [ltcLoading, setLtcLoading] = useState(false);
  const [paid, setPaid] = useState(false);

  if (!orderId || !total) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        <p>Invalid payment link. <a href="/" className="text-blue-400 underline">Go back</a></p>
      </div>
    );
  }

  const ticketUrl = channelId ? `discord://discord.com/channels/${GUILD_ID}/${channelId}` : null;

  const handleLTC = async () => {
    setLtcLoading(true);
    try {
      const res = await axios.post('/api/shop/create-payment', { orderId, totalAmount: parseFloat(total), method: 'ltc' });
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
            <a href={ticketUrl} className="block w-full py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition">
              Open Discord Ticket
            </a>
          )}
          <a href="/" className="block mt-3 text-gray-500 hover:text-white text-sm">Back to shop</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="bg-[#1c1c1e] rounded-2xl p-6 max-w-md w-full border border-[#2c2c2e]">
        <h2 className="text-xl font-bold text-white mb-1">Pay for Order {orderId}</h2>
        <p className="text-gray-400 text-sm mb-6">Total: <span className="text-white font-bold">${parseFloat(total).toFixed(2)}</span></p>

        {PAYPAL_CLIENT_ID && (
          <div className="mb-4">
            <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: 'USD' }}>
              <PayPalButtons
                style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
                createOrder={async () => {
                  const res = await axios.post('/api/shop/create-payment', { orderId, totalAmount: parseFloat(total), method: 'paypal' });
                  const match = res.data.approvalLink?.match(/token=([^&]+)/);
                  return match?.[1] || '';
                }}
                onApprove={async (data) => {
                  try {
                    await axios.post('/api/shop/paypal/capture-ajax', { paypalOrderId: data.orderID, orderId });
                    setPaid(true);
                  } catch {
                    alert('Payment verification failed. Contact support.');
                  }
                }}
                onError={() => alert('PayPal error. Try again.')}
              />
            </PayPalScriptProvider>
          </div>
        )}

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[#2c2c2e]"/>
          <span className="text-gray-600 text-xs">or</span>
          <div className="flex-1 h-px bg-[#2c2c2e]"/>
        </div>

        {!ltcData ? (
          <button onClick={handleLTC} disabled={ltcLoading} className="w-full py-3 bg-[#333] hover:bg-[#444] disabled:opacity-50 text-white font-bold rounded-xl transition">
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
          <a href={ticketUrl} className="block w-full py-3 mt-4 text-center bg-[#5865F2] hover:bg-[#4752C4] text-white font-bold rounded-xl transition">
            Open Discord Ticket
          </a>
        )}

        <a href="/" className="block mt-3 text-center text-gray-500 hover:text-white text-sm">Back to shop</a>
      </div>
    </div>
  );
};

export default PaymentPage;
