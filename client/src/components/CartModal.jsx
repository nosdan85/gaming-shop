import { useContext, useState, useEffect } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckBadgeIcon, UserCircleIcon, CurrencyDollarIcon, TicketIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

// Rút invite code từ URL dạng https://discord.gg/CODE hoặc discord.gg/CODE
const getInviteCode = (url) => {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/discord\.gg\/([a-zA-Z0-9]+)/i) || url.match(/invite\/([a-zA-Z0-9]+)/i);
  return m ? m[1] : null;
};

const CartModal = () => {
  const { cart, removeFromCart, isCartOpen, setIsCartOpen, user: contextUser, logoutDiscord, clearCart } = useContext(ShopContext);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [localUser, setLocalUser] = useState(null);
  const [showOpenDiscordModal, setShowOpenDiscordModal] = useState(false);
  const [orderSuccessInvite, setOrderSuccessInvite] = useState("");
  useEffect(() => {
      const stored = localStorage.getItem('user');
      if (stored) {
          try {
              setLocalUser(JSON.parse(stored));
          } catch (e) { console.error(e); }
      }
  }, [isCartOpen]);

  const user = contextUser || localUser;
  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2);

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const handleDiscordLogin = () => {
    const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || "1439615003572572250";
    const REDIRECT_URI = `${window.location.origin}/auth/discord/callback`;
    const SCOPE = "identify guilds.join"; 
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}`;
    if (isMobile) {
      // Mở OAuth trong Discord app qua discord:// protocol
      window.location.href = `discord://-/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}`;
      // Fallback: nếu Discord app không cài → mở web sau 2 giây
      setTimeout(() => { window.location.href = oauthUrl; }, 2000);
    } else {
      window.location.href = oauthUrl;
    }
  };

  const handleLogout = () => {
    // Xóa state trong context
    logoutDiscord();
    // Xóa state local trong CartModal
    setLocalUser(null);
    // Xóa luôn user OAuth nếu có
    localStorage.removeItem('user');
  };

  const handleCheckout = async () => {
    if (!user || !user.discordId) return alert("Please link Discord first!");
    
    setIsProcessing(true);
    try {
      const res = await axios.post('/api/shop/checkout', { discordId: user.discordId, cartItems: cart });
      const invite = import.meta.env.VITE_DISCORD_INVITE || "https://discord.gg/T4A4ANp9";
      clearCart();
      setIsCartOpen(false);
      setOrderSuccessInvite(invite);
      setShowOpenDiscordModal(true);
    } catch (err) {
      if (err.response && err.response.data.error_code === "USER_NOT_IN_GUILD") {
          setInviteLink(err.response.data.invite_link);
          setShowJoinModal(true);
      } else {
          alert(`Checkout Failed: ${err.response?.data?.error || "Unknown Error"}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isCartOpen && !showOpenDiscordModal) return null;

  if (showOpenDiscordModal && orderSuccessInvite && !isCartOpen) {
    const code = getInviteCode(orderSuccessInvite);
    const discordAppUrl = code ? `discord://invite/${code}` : null;
    const webUrl = orderSuccessInvite.startsWith('http') ? orderSuccessInvite : `https://discord.gg/${code || ''}`;
    return (
      <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-6">
        <div className="bg-[#1c1c1e] rounded-2xl p-8 max-w-sm text-center w-full border border-[#2c2c2e]">
          <h2 className="text-2xl font-bold text-white mb-2">Order successful</h2>
          <p className="text-gray-400 mb-6 text-sm">Check your Discord ticket. Open our server:</p>
          {discordAppUrl && (
            <a
              href={discordAppUrl}
              className="block w-full py-3 bg-[#5865F2] text-white font-bold rounded-xl mb-3 hover:bg-[#4752C4] transition"
              onClick={() => setShowOpenDiscordModal(false)}
            >
              Open in Discord App
            </a>
          )}
          <a
            href={webUrl}
            target="_blank"
            rel="noreferrer"
            className="block w-full py-3 bg-[#2c2c2e] hover:bg-[#3f3f46] text-white font-bold rounded-xl mb-3 transition"
            onClick={() => setShowOpenDiscordModal(false)}
          >
            Open in Browser
          </a>
          <button onClick={() => setShowOpenDiscordModal(false)} className="text-gray-500 hover:text-white text-sm transition">Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl transition-opacity" onClick={() => setIsCartOpen(false)}></div>

      {/* MAIN MODAL */}
      <div className="relative bg-[#09090b] w-full h-full md:h-[85vh] md:max-w-4xl md:rounded-[32px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-[#2c2c2e] animate-pop-in">
        
        {/* Nút đóng Mobile */}
        <button onClick={() => setIsCartOpen(false)} className="md:hidden absolute top-4 right-4 z-50 p-2 bg-[#2c2c2e] rounded-full text-white"><XMarkIcon className="w-6 h-6"/></button>

        {/* --- CỘT TRÁI: DANH SÁCH SẢN PHẨM --- */}
        <div className="w-full md:w-3/5 p-6 flex flex-col bg-[#000000] h-3/5 md:h-full border-b md:border-b-0 md:border-r border-[#2c2c2e]">
          <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 text-white">Bag</h2>
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
             {cart.length === 0 ? (
               <div className="h-full flex items-center justify-center text-[#86868b]">Your bag is empty.</div>
             ) : (
               cart.map(item => (
                 <div key={item._id} className="flex gap-3 md:gap-4 p-3 md:p-4 rounded-2xl bg-[#1c1c1e]">
                    <img src={`/pictures/products/${item.image}`} className="w-16 h-16 object-contain bg-[#2c2c2e] rounded-lg" />
                    <div className="flex-1">
                       <h3 className="font-medium text-white text-sm md:text-base line-clamp-1">{item.name}</h3>
                       <div className="flex justify-between mt-2 items-center">
                          <span className="text-gray-400 text-xs md:text-sm">${item.price} x {item.quantity}</span>
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

        {/* --- CỘT PHẢI: CHECKOUT & INFO --- */}
        <div className="w-full md:w-2/5 bg-[#1c1c1e] p-6 flex flex-col h-2/5 md:h-full relative">
           <button onClick={() => setIsCartOpen(false)} className="hidden md:block self-end p-2 bg-[#2c2c2e] rounded-full text-white mb-2"><XMarkIcon className="w-5 h-5"/></button>
           
           {/* 1. PHẦN ĐĂNG NHẬP (Ở TRÊN CÙNG) */}
           <div className="bg-[#000000] p-4 rounded-2xl border border-[#2c2c2e] mb-4">
              {user && user.discordId ? (
                <div className="text-center">
                   <div className="flex items-center justify-center gap-2 mb-1">
                      <CheckBadgeIcon className="w-5 h-5 text-green-500"/>
                      <span className="text-white font-bold truncate max-w-[150px]">{user.discordUsername || user.username}</span>
                   </div>
                   <button onClick={handleLogout} className="text-[#ff3b30] text-xs hover:underline">Sign Out</button>
                </div>
              ) : (
                <div className="text-center">
                   <p className="text-gray-400 text-xs mb-3">Login to process order</p>
                   <button onClick={handleDiscordLogin} className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-2 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2">
                     <UserCircleIcon className="w-5 h-5"/> Link Discord
                   </button>
                </div>
              )}
           </div>

           {/* 2. PHẦN HƯỚNG DẪN THANH TOÁN (How to pay) */}
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
                          <p className="text-white text-sm font-medium">3. Ticket</p>
                          <p className="text-gray-500 text-xs">A Discord ticket will open automatically.</p>
                      </div>
                  </div>
                  <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#2c2c2e] flex items-center justify-center flex-shrink-0 text-green-400">
                          <CurrencyDollarIcon className="w-4 h-4" />
                      </div>
                      <div>
                          <p className="text-white text-sm font-medium">4. Payment</p>
                          <p className="text-gray-500 text-xs">Choose payment method and pay inside the ticket.</p>
                      </div>
                  </div>
              </div>
           </div>

           {/* 3. NÚT CHECKOUT (Ở DƯỚI CÙNG) */}
           <button 
             onClick={handleCheckout} 
             disabled={!user || cart.length === 0 || isProcessing}
             className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white py-3 md:py-4 rounded-xl text-base md:text-lg font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-transform mt-auto"
           >
             {isProcessing ? 'Processing...' : 'Check Out'}
           </button>
        </div>
      </div>
      
      {/* JOIN SERVER MODAL */}
      {showJoinModal && (
        <div className="absolute inset-0 z-[70] bg-black/90 flex items-center justify-center p-6 animate-fade-in">
             <div className="bg-[#1c1c1e] rounded-2xl p-8 max-w-sm text-center w-full border border-[#2c2c2e]">
                 <h2 className="text-2xl font-bold text-white mb-2">Join Discord</h2>
                 <p className="text-gray-400 mb-6 text-sm">Required to process your order.</p>
                 <a href={inviteLink} target="_blank" className="block w-full py-3 bg-[#5865F2] text-white font-bold rounded-xl mb-3 hover:bg-[#4752C4] transition">Join Server Now</a>
                 <button onClick={() => setShowJoinModal(false)} className="text-gray-500 hover:text-white transition">Close</button>
             </div>
        </div>
      )}

    </div>
  );
};

export default CartModal;