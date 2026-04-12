import { useContext, useState, useEffect } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckBadgeIcon, UserCircleIcon, CurrencyDollarIcon, TicketIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { formatCardPrice } from '../utils/priceFormatting';

const BULK_DISCOUNT_THRESHOLD = 10;
const MIN_CHECKOUT_TOTAL = 1;
const CHECKOUT_TIMEOUT_MS = 20000;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getItemPricing = (item) => {
  const quantity = Number(item?.quantity) || 0;
  const regularUnitPrice = Number(item?.price) || 0;
  if (!Number.isFinite(regularUnitPrice) || regularUnitPrice <= 0 || quantity <= 0) {
    return {
      displayUnitPrice: '$0',
      bulkDisplayUnitPrice: '',
      bulkAppliedUnits: 0,
      lineTotal: 0
    };
  }

  const regularDisplayPrice = formatCardPrice(item?.originalPriceString, regularUnitPrice);
  const bulkUnitPrice = Number(item?.bulkPrice);
  const hasBulkPrice = Number.isFinite(bulkUnitPrice) && bulkUnitPrice > 0;
  if (!hasBulkPrice) {
    return {
      displayUnitPrice: regularDisplayPrice,
      bulkDisplayUnitPrice: '',
      bulkAppliedUnits: 0,
      lineTotal: roundMoney(regularUnitPrice * quantity)
    };
  }

  const regularUnitsLimit = Math.max(1, Math.floor(BULK_DISCOUNT_THRESHOLD / regularUnitPrice));
  const regularUnits = Math.min(quantity, regularUnitsLimit);
  const bulkAppliedUnits = Math.max(0, quantity - regularUnits);
  const regularPart = regularUnits * regularUnitPrice;
  const bulkPart = bulkAppliedUnits * bulkUnitPrice;
  const lineTotal = roundMoney(regularPart + bulkPart);
  const bulkDisplayUnitPrice = formatCardPrice(item?.bulkPriceString, bulkUnitPrice);

  return {
    displayUnitPrice: regularDisplayPrice,
    bulkDisplayUnitPrice,
    bulkAppliedUnits,
    lineTotal
  };
};

const CartModal = () => {
  const { cart, removeFromCart, isCartOpen, setIsCartOpen, user: contextUser, logoutDiscord, clearCart } = useContext(ShopContext);

  const [isProcessing, setIsProcessing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [localUser, setLocalUser] = useState(null);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) {
      try {
        setLocalUser(JSON.parse(stored));
      } catch (e) {
        console.error(e);
      }
    }
  }, [isCartOpen]);

  const user = contextUser || localUser;
  const cartRows = cart.map((item) => ({
    item,
    pricing: getItemPricing(item)
  }));
  const totalValue = roundMoney(cartRows.reduce((acc, row) => acc + row.pricing.lineTotal, 0));
  const total = totalValue.toFixed(2);
  const isBelowMinimumCheckout = totalValue <= MIN_CHECKOUT_TOTAL;

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
      scope: 'identify'
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  };

  const handleLinkWeb = () => {
    localStorage.setItem('discordLinkMethod', 'web');
    window.location.href = getOAuthUrl();
  };

  const handleLinkApp = () => {
    localStorage.setItem('discordLinkMethod', 'app');
    const oauthUrl = getOAuthUrl();
    const queryString = oauthUrl.split('?')[1] || '';
    const discordAppUrl = `discord://-/oauth2/authorize?${queryString}`;
    window.location.href = discordAppUrl;
  };

  const handleLogout = () => {
    logoutDiscord();
    setLocalUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('discordUser');
    localStorage.removeItem('discordLinkMethod');
  };

  const handleCheckout = async () => {
    if (!user || !user.discordId) return alert('Please link Discord first!');
    if (isBelowMinimumCheckout) return alert('Checkout total must be above $1.00.');

    setIsProcessing(true);
    try {
      const res = await axios.post(
        '/api/shop/checkout',
        { cartItems: cart },
        { timeout: CHECKOUT_TIMEOUT_MS }
      );
      const { orderId } = res.data || {};
      if (!orderId) {
        throw new Error('Invalid checkout response: missing orderId');
      }

      clearCart();
      setIsCartOpen(false);
      window.location.href = `/pay?orderId=${orderId}`;
    } catch (err) {
      if (err.code === 'ECONNABORTED') {
        alert('Checkout timeout. Please try again in a few seconds.');
      } else if (err.response?.data?.error_code === 'USER_NOT_IN_GUILD') {
        setInviteLink(err.response.data.invite_link);
        setShowJoinModal(true);
      } else if (err.response?.status === 401) {
        alert('Login expired. Please link Discord again.');
      } else {
        alert(`Checkout Failed: ${err.response?.data?.error || 'Unknown Error'}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl transition-opacity" onClick={() => setIsCartOpen(false)} />

      <div className="relative bg-[#09090b] w-full h-full md:h-[85vh] md:max-w-4xl md:rounded-[32px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-[#2c2c2e] animate-pop-in">
        <button onClick={() => setIsCartOpen(false)} className="md:hidden absolute top-4 right-4 z-50 p-2 bg-[#2c2c2e] rounded-full text-white">
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="w-full md:w-3/5 p-6 flex flex-col bg-[#000000] h-3/5 md:h-full border-b md:border-b-0 md:border-r border-[#2c2c2e]">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-white">Bag</h2>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[#86868b]">Your bag is empty.</div>
            ) : (
              cartRows.map(({ item, pricing }) => (
                <div key={item._id} className="flex gap-3 md:gap-4 p-3 md:p-4 rounded-2xl bg-[#1c1c1e]">
                  <img src={`/products/${item.image}`} className="w-16 h-16 object-contain bg-[#2c2c2e] rounded-lg" />
                  <div className="flex-1">
                    <h3 className="font-medium text-white text-sm md:text-base line-clamp-1">{item.name}</h3>
                    <div className="flex justify-between mt-2 items-center">
                      <div className="min-w-0">
                        <span className="text-gray-400 text-xs md:text-sm">{pricing.displayUnitPrice} | qty {item.quantity}</span>
                        {pricing.bulkAppliedUnits > 0 && (
                          <p className="text-[10px] text-green-400 mt-1">
                            Bulk applied for {pricing.bulkAppliedUnits} qty ({pricing.bulkDisplayUnitPrice})
                          </p>
                        )}
                        <p className="text-[10px] text-gray-500 mt-1">Line total: ${pricing.lineTotal.toFixed(2)}</p>
                      </div>
                      <button onClick={() => removeFromCart(item._id)} className="text-[#ff3b30] text-xs md:text-sm font-medium">Remove</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-4 mt-2 border-t border-[#2c2c2e] flex justify-between text-lg md:text-xl font-bold text-white">
            <span>Total</span>
            <span>${total}</span>
          </div>
        </div>

        <div className="w-full md:w-2/5 bg-[#1c1c1e] p-4 md:p-6 flex flex-col min-h-0 h-2/5 md:h-full relative overflow-y-auto">
          <button onClick={() => setIsCartOpen(false)} className="hidden md:block self-end p-2 bg-[#2c2c2e] rounded-full text-white mb-2">
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="bg-[#000000] p-4 rounded-2xl border border-[#2c2c2e] mb-4">
            {user && user.discordId ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckBadgeIcon className="w-5 h-5 text-green-500" />
                  <span className="text-white font-bold truncate max-w-[150px]">{user.discordUsername || user.username}</span>
                </div>
                <button onClick={handleLogout} className="text-[#ff3b30] text-xs hover:underline">Sign Out</button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-gray-400 text-xs">Login to process order</p>
                {isMobile ? (
                  <button onClick={handleLinkWeb} className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2">
                    <UserCircleIcon className="w-5 h-5" /> Link Discord
                  </button>
                ) : (
                  <>
                    <button onClick={handleLinkWeb} className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-2.5 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2">
                      <UserCircleIcon className="w-5 h-5" /> Link via Discord Web
                    </button>
                    <button onClick={handleLinkApp} className="w-full bg-[#2c2c2e] hover:bg-[#3f3f46] text-white py-2.5 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2">
                      Link via Discord App
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto mb-4 pr-1">
            <h3 className="text-gray-400 text-xs uppercase font-bold mb-3 tracking-wider">How to pay</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center flex-shrink-0 text-blue-400">
                  <ClipboardDocumentListIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">1. Link Discord</p>
                  <p className="text-gray-500 text-xs">Press &quot;Link Discord&quot; and login with your account.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center flex-shrink-0 text-purple-400">
                  <TicketIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">2. Create an Order</p>
                  <p className="text-gray-500 text-xs">Add items to bag and click &quot;Check Out&quot;.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center flex-shrink-0 text-green-400">
                  <CurrencyDollarIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">3. Auto-create ticket</p>
                  <p className="text-gray-500 text-xs">After checkout, the bot creates your Discord ticket automatically.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center flex-shrink-0 text-green-400">
                  <CurrencyDollarIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium">4. Payment</p>
                  <p className="text-gray-500 text-xs">Complete payment from the payment page or inside the Discord ticket.</p>
                </div>
              </div>
            </div>
          </div>

          {isBelowMinimumCheckout && cart.length > 0 && (
            <p className="text-[11px] text-red-400 mb-2">Total must be above $1.00 to checkout.</p>
          )}
          <button
            onClick={handleCheckout}
            disabled={!user || cart.length === 0 || isProcessing || isBelowMinimumCheckout}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-3 md:py-4 rounded-xl text-base md:text-lg font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-transform mt-auto"
          >
            {isProcessing ? 'Processing...' : 'Check Out'}
          </button>
        </div>
      </div>

      {showJoinModal && (
        <div className="absolute inset-0 z-[70] bg-black/90 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[#1c1c1e] rounded-2xl p-8 max-w-sm text-center w-full border border-[#2c2c2e]">
            <h2 className="text-2xl font-bold text-white mb-2">Join Discord</h2>
            <p className="text-gray-400 mb-6 text-sm">Required to process your order.</p>
            <a href={inviteLink} target="_blank" rel="noreferrer" className="block w-full py-3 bg-[#5865F2] text-white font-bold rounded-xl mb-3 hover:bg-[#4752C4] transition">Join Server Now</a>
            <button onClick={() => setShowJoinModal(false)} className="text-gray-500 hover:text-white transition">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartModal;
