import { useContext, useState, useEffect } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckBadgeIcon, UserCircleIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const CartModal = () => {
  // Lấy user từ Context (có thể bị null khi F5)
  const { cart, removeFromCart, isCartOpen, setIsCartOpen, user: contextUser, logoutDiscord, clearCart } = useContext(ShopContext);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  
  // --- FIX QUAN TRỌNG: Tự lấy user từ LocalStorage nếu Context chưa có ---
  const [localUser, setLocalUser] = useState(null);

  useEffect(() => {
      // Mỗi khi mở giỏ hàng, kiểm tra lại LocalStorage ngay lập tức
      const stored = localStorage.getItem('user');
      if (stored) {
          try {
              setLocalUser(JSON.parse(stored));
          } catch (e) {
              console.error("Lỗi đọc LocalStorage", e);
          }
      }
  }, [isCartOpen]); // Chạy lại khi mở giỏ hàng

  // Ưu tiên dùng Context, nếu không có thì dùng LocalStorage
  const user = contextUser || localUser;
  // --------------------------------------------------------------------

  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0).toFixed(2);

  const handleDiscordLogin = () => {
    // Sửa lại cách lấy biến môi trường cho chắc chắn
    const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || "1439615003572572250"; // ID dự phòng
    const REDIRECT_URI = `${window.location.origin}/auth/discord/callback`;
    const SCOPE = "identify guilds.join"; 
    window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPE)}`;
  };

  const handleCheckout = async () => {
    // Kiểm tra kỹ hơn: Phải có user VÀ có discordId
    if (!user || !user.discordId) return alert("Please link Discord first!");
    
    setIsProcessing(true);
    try {
      // Dùng user.discordId lấy được từ fallback
      const res = await axios.post('/api/shop/checkout', { discordId: user.discordId, cartItems: cart });
      alert(`✅ Order Success! ID: ${res.data.orderId}\nPlease check your Discord Ticket.`);
      clearCart();
      setIsCartOpen(false);
    } catch (err) {
      console.error(err);
      if (err.response && err.response.data.error_code === "USER_NOT_IN_GUILD") {
          setInviteLink(err.response.data.invite_link);
          setShowJoinModal(true);
      } else {
          // Hiện lỗi chi tiết hơn chút để dễ debug
          alert(`Checkout Failed: ${err.response?.data?.error || "Unknown Error"}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isCartOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 md:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl transition-opacity" onClick={() => setIsCartOpen(false)}></div>

      {/* MAIN MODAL */}
      <div className="relative bg-[#09090b] w-full h-full md:h-[85vh] md:max-w-4xl md:rounded-[32px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-[#2c2c2e] animate-pop-in">
        
        {/* Nút đóng Mobile */}
        <button onClick={() => setIsCartOpen(false)} className="md:hidden absolute top-4 right-4 z-50 p-2 bg-[#2c2c2e] rounded-full text-white"><XMarkIcon className="w-6 h-6"/></button>

        {/* LEFT: CART ITEMS */}
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

        {/* RIGHT: CHECKOUT */}
        <div className="w-full md:w-2/5 bg-[#1c1c1e] p-6 flex flex-col justify-center md:justify-between h-2/5 md:h-full relative">
           <button onClick={() => setIsCartOpen(false)} className="hidden md:block self-end p-2 bg-[#2c2c2e] rounded-full text-white mb-4"><XMarkIcon className="w-5 h-5"/></button>
           
           <div className="bg-[#000000] p-5 rounded-2xl border border-[#2c2c2e] mb-4">
              {/* Kiểm tra User ở đây: Dùng biến user đã được fallback */}
              {user && user.discordId ? (
                <div className="text-center">
                   <div className="flex items-center justify-center gap-2 mb-2">
                      <CheckBadgeIcon className="w-6 h-6 text-green-500"/>
                      <span className="text-white font-bold truncate max-w-[150px]">{user.discordUsername || user.username}</span>
                   </div>
                   <button onClick={logoutDiscord} className="text-[#ff3b30] text-xs hover:underline">Sign Out</button>
                </div>
              ) : (
                <div className="text-center">
                   <UserCircleIcon className="w-8 h-8 text-[#0071e3] mx-auto mb-2"/>
                   <p className="text-gray-400 text-xs mb-3">Link Discord required.</p>
                   <button onClick={handleDiscordLogin} className="w-full btn-primary py-2 text-sm">Link Discord</button>
                </div>
              )}
           </div>

           <button 
             onClick={handleCheckout} 
             disabled={!user || cart.length === 0 || isProcessing}
             className="w-full btn-primary py-3 md:py-4 text-base md:text-lg font-bold shadow-lg shadow-blue-900/20 active:scale-95 transition-transform"
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