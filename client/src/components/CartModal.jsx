import { useContext, useState, useEffect } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckBadgeIcon, UserCircleIcon, CurrencyDollarIcon, TicketIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { formatCardPrice } from '../utils/priceFormatting';
import { formatDeliveredUnitsLabel } from '../utils/itemQuantityDisplay';

const BULK_DISCOUNT_THRESHOLD = 10;
const CHECKOUT_TIMEOUT_MS = 20000;
const roundMoney = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const getItemPricing = (item) => {
  const quantity = Number(item?.quantity) || 0;
  const basePrice = Number(item?.price) || 0;
  const regularUnitPrice = basePrice > 0 && basePrice < 1 ? 1 : basePrice;
  if (!Number.isFinite(regularUnitPrice) || regularUnitPrice <= 0 || quantity <= 0) {
    return {
      displayUnitPrice: '$0',
      bulkDisplayUnitPrice: '',
      bulkAppliedUnits: 0,
      lineTotal: 0
    };
  }

  const regularDisplayPrice = formatCardPrice(item?.originalPriceString, regularUnitPrice);
  const bulkUnitPrice = basePrice > 0 && basePrice < 1 ? null : Number(item?.bulkPrice);
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
  const [couponCode, setCouponCode] = useState('');
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
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
    pricing: getItemPricing(item),
    deliveredLabel: formatDeliveredUnitsLabel(item?.name, item?.quantity)
  }));
  const totalValue = roundMoney(cartRows.reduce((acc, row) => acc + row.pricing.lineTotal, 0));
  const total = totalValue.toFixed(2);
  const hasInvalidCheckoutTotal = totalValue <= 0;
  const normalizedCouponCode = couponCode.trim().toUpperCase();
  const appliedDiscountAmount = roundMoney(Number(appliedCoupon?.discountAmount) || 0);
  const totalAfterDiscountValue = roundMoney(Math.max(0, totalValue - appliedDiscountAmount));

  useEffect(() => {
    if (!appliedCoupon) return;
    setAppliedCoupon(null);
  }, [cart]);

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

  const handleCouponInputChange = (value) => {
    const next = String(value || '').toUpperCase();
    setCouponCode(next);
    setCouponError('');
    if (appliedCoupon && next.trim().toUpperCase() !== String(appliedCoupon.couponCode || '').toUpperCase()) {
      setAppliedCoupon(null);
    }
  };

  const handleApplyCoupon = async () => {
    if (isApplyingCoupon) return;
    if (cart.length === 0) return;

    const codeToApply = normalizedCouponCode;
    if (!codeToApply) {
      setAppliedCoupon(null);
      setCouponError('');
      return;
    }

    setIsApplyingCoupon(true);
    setCouponError('');
    try {
      const { data } = await axios.post(
        '/api/shop/coupon/preview',
        {
          cartItems: cart,
          couponCode: codeToApply
        },
        { timeout: CHECKOUT_TIMEOUT_MS }
      );

      setAppliedCoupon({
        couponCode: String(data?.couponCode || codeToApply).toUpperCase(),
        discountPercent: Number(data?.discountPercent) || 0,
        discountAmount: roundMoney(Number(data?.discountAmount) || 0),
        subtotalAmount: roundMoney(Number(data?.subtotalAmount) || totalValue),
        totalAmount: roundMoney(Number(data?.totalAmount) || totalValue)
      });
    } catch (err) {
      setAppliedCoupon(null);
      setCouponError(err.response?.data?.error || 'Coupon cannot be applied right now.');
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleCheckout = async () => {
    if (isProcessing) return;
    if (!user || !user.discordId) return alert('Please link Discord first!');
    if (hasInvalidCheckoutTotal) return alert('Checkout total is invalid.');

    setIsProcessing(true);
    try {
      let res = null;
      try {
        res = await axios.post(
          '/api/shop/checkout',
          {
            cartItems: cart,
            couponCode: appliedCoupon?.couponCode || undefined
          },
          { timeout: CHECKOUT_TIMEOUT_MS }
        );
      } catch (firstError) {
        const retryable = firstError.code === 'ECONNABORTED' || !firstError.response;
        if (!retryable) throw firstError;
        res = await axios.post(
          '/api/shop/checkout',
          {
            cartItems: cart,
            couponCode: appliedCoupon?.couponCode || undefined
          },
          { timeout: CHECKOUT_TIMEOUT_MS }
        );
      }
      const { orderId } = res.data || {};
      if (!orderId) {
        throw new Error('Invalid checkout response: missing orderId');
      }

      clearCart();
      setCouponCode('');
      setAppliedCoupon(null);
      setCouponError('');
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xl transition-opacity" onClick={() => setIsCartOpen(false)} />

      <div className="relative bg-[var(--color-bg-main)] w-full h-full md:h-[85vh] md:max-w-4xl md:rounded-[10px] shadow-[rgba(0,0,0,0.14)_0px_28px_70px,rgba(0,0,0,0.1)_0px_14px_32px] flex flex-col md:flex-row overflow-hidden border border-[var(--color-border)] animate-pop-in">
        <button onClick={() => setIsCartOpen(false)} className="btn-press md:hidden absolute top-4 right-4 z-50 p-2 bg-[var(--color-bg-elevated)] rounded-full text-[var(--color-text-primary)] hover:text-[var(--color-error)]">
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="w-full md:w-3/5 p-6 flex flex-col bg-[var(--color-bg-main)] h-3/5 md:h-full border-b md:border-b-0 md:border-r border-[var(--color-border)]">
          <h2 className="text-2xl md:text-3xl font-gothic tracking-[-0.72px] mb-4 md:mb-6 text-[var(--color-text-primary)]">Bag</h2>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-[var(--color-text-secondary)] font-serif">Your bag is empty.</div>
            ) : (
              cartRows.map(({ item, pricing, deliveredLabel }) => (
                <div key={item._id} className="flex gap-3 md:gap-4 p-3 md:p-4 rounded-[8px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)]">
                    <img
                      src={`/products/${encodeURIComponent(String(item.image || ''))}`}
                      className="w-16 h-16 object-cover bg-[var(--color-bg-elevated)] rounded-[8px]"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => { e.currentTarget.src = '/products/aura-chest.png'; }}
                    />
                  <div className="flex-1">
                    <h3 className="font-gothic font-medium text-[var(--color-text-primary)] text-sm md:text-base line-clamp-1">{item.name}</h3>
                    <div className="flex justify-between mt-2 items-center">
                      <div className="min-w-0">
                        <span className="text-[var(--color-text-secondary)] text-xs md:text-sm">{pricing.displayUnitPrice} | qty {deliveredLabel}</span>
                        {pricing.bulkAppliedUnits > 0 && (
                          <p className="text-[10px] text-[var(--color-success)] mt-1">
                            Bulk applied for {pricing.bulkAppliedUnits} packs ({pricing.bulkDisplayUnitPrice})
                          </p>
                        )}
                        <p className="text-[10px] text-[var(--color-text-secondary)] mt-1">Line total: ${pricing.lineTotal.toFixed(2)}</p>
                      </div>
                      <button onClick={() => removeFromCart(item._id)} className="btn-press text-[var(--color-error)] text-xs md:text-sm font-medium hover:underline">Remove</button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="pt-4 mt-2 border-t border-[var(--color-border)] flex justify-between text-lg md:text-xl font-gothic text-[var(--color-text-primary)]">
            <span>Total</span>
            <span>${total}</span>
          </div>
        </div>

        <div className="w-full md:w-2/5 bg-[var(--color-bg-secondary)] p-4 md:p-6 flex flex-col min-h-0 h-2/5 md:h-full relative overflow-y-auto">
          <button onClick={() => setIsCartOpen(false)} className="btn-press hidden md:block self-end p-2 bg-[var(--color-bg-elevated)] rounded-full text-[var(--color-text-primary)] hover:text-[var(--color-error)] mb-2">
            <XMarkIcon className="w-5 h-5" />
          </button>

          <div className="bg-[var(--color-bg-main)] p-4 rounded-[8px] border border-[var(--color-border)] mb-4">
            {user && user.discordId ? (
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <CheckBadgeIcon className="w-5 h-5 text-[var(--color-success)]" />
                  <span className="text-[var(--color-text-primary)] font-gothic font-medium truncate max-w-[150px]">{user.discordUsername || user.username}</span>
                </div>
                <button onClick={handleLogout} className="text-[var(--color-error)] text-xs hover:underline">Sign Out</button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-[var(--color-text-secondary)] text-xs font-serif">Login to process order</p>
                {isMobile ? (
                    <button onClick={handleLinkWeb} className="btn-press w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-2.5 rounded-[8px] font-gothic text-sm transition flex items-center justify-center gap-2">
                      <UserCircleIcon className="w-5 h-5" /> Link Discord
                    </button>
                ) : (
                  <>
                    <button onClick={handleLinkWeb} className="btn-press w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-2.5 rounded-[8px] font-gothic text-sm transition flex items-center justify-center gap-2">
                      <UserCircleIcon className="w-5 h-5" /> Link via Discord Web
                    </button>
                    <button onClick={handleLinkApp} className="btn-press w-full bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] py-2.5 rounded-[8px] font-gothic text-xs transition flex items-center justify-center gap-2">
                      Link via Discord App
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto mb-4 pr-1">
            <h3 className="text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-3 tracking-wider">How to pay</h3>
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center flex-shrink-0 text-blue-500">
                  <ClipboardDocumentListIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[var(--color-text-primary)] text-sm font-gothic">1. Link Discord</p>
                  <p className="text-[var(--color-text-secondary)] text-xs font-serif">Press &quot;Link Discord&quot; and login with your account.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center flex-shrink-0 text-[var(--color-accent)]">
                  <TicketIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[var(--color-text-primary)] text-sm font-gothic">2. Create an Order</p>
                  <p className="text-[var(--color-text-secondary)] text-xs font-serif">Add items to bag and click &quot;Check Out&quot;.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center flex-shrink-0 text-[var(--color-success)]">
                  <CurrencyDollarIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[var(--color-text-primary)] text-sm font-gothic">3. Open payment page</p>
                  <p className="text-[var(--color-text-secondary)] text-xs font-serif">After checkout, press the green payment button to create your Discord ticket.</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-[var(--color-bg-elevated)] flex items-center justify-center flex-shrink-0 text-[var(--color-success)]">
                  <CurrencyDollarIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[var(--color-text-primary)] text-sm font-gothic">4. Payment</p>
                  <p className="text-[var(--color-text-secondary)] text-xs font-serif">Complete payment from the payment page or inside the Discord ticket.</p>
                </div>
              </div>
            </div>
          </div>

          {hasInvalidCheckoutTotal && cart.length > 0 && (
            <p className="text-[11px] text-[var(--color-error)] mb-2">Total must be greater than $0.00 to checkout.</p>
          )}
          <div className="mb-3">
            <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1 tracking-wider">
              Coupon Code
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => handleCouponInputChange(e.target.value)}
                placeholder="Enter coupon"
                className="flex-1 bg-transparent border border-[var(--color-border)] rounded-[8px] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] focus-warm"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={isApplyingCoupon || cart.length === 0}
                className="btn-press px-3 py-2.5 rounded-[8px] bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] disabled:bg-[var(--color-bg-elevated)] disabled:text-[var(--color-text-secondary)] text-[var(--color-text-primary)] text-xs font-gothic transition"
              >
                {isApplyingCoupon ? 'Applying...' : 'Apply'}
              </button>
            </div>
            {couponError && (
              <p className="text-[11px] text-[var(--color-error)] mt-1">{couponError}</p>
            )}
            {appliedCoupon && (
              <p className="text-[11px] text-[var(--color-success)] mt-1">
                Applied {appliedCoupon.couponCode} (-{appliedCoupon.discountPercent}%)
              </p>
            )}
          </div>
          <div className="mb-3 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3 text-xs space-y-1">
            <div className="flex items-center justify-between text-[var(--color-text-secondary)]">
              <span>Subtotal</span>
              <span>${totalValue.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[var(--color-text-secondary)]">
              <span>Discount</span>
              <span>- ${appliedDiscountAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between text-[var(--color-text-primary)] font-gothic text-sm pt-1 border-t border-[var(--color-border)]">
              <span>Total after discount</span>
              <span>${totalAfterDiscountValue.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={handleCheckout}
            disabled={!user || cart.length === 0 || isProcessing || hasInvalidCheckoutTotal}
            className="btn-press w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-bg-elevated)] disabled:text-[var(--color-text-secondary)] disabled:cursor-not-allowed text-white py-3 md:py-4 rounded-[8px] text-base md:text-lg font-gothic active:scale-95 transition-transform mt-auto"
          >
            {isProcessing ? 'Processing...' : 'Check Out'}
          </button>
        </div>
      </div>

      {showJoinModal && (
        <div className="absolute inset-0 z-[70] bg-black/80 flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-[var(--color-bg-main)] rounded-[10px] p-8 max-w-sm text-center w-full border border-[var(--color-border)]">
            <h2 className="text-2xl font-gothic text-[var(--color-text-primary)] mb-2">Join Discord</h2>
            <p className="text-[var(--color-text-secondary)] font-serif mb-6 text-sm">Required to process your order.</p>
            <a href={inviteLink} target="_blank" rel="noreferrer" className="btn-press block w-full py-3 bg-[#5865F2] text-white font-gothic rounded-[8px] mb-3 hover:bg-[#4752C4] transition text-center">Join Server Now</a>
            <button onClick={() => setShowJoinModal(false)} className="btn-press text-[var(--color-text-secondary)] hover:text-[var(--color-error)] transition">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartModal;
