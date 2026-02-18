import { createContext, useState, useEffect } from 'react';

export const ShopContext = createContext();

export const ShopProvider = ({ children }) => {
  // Cart: khởi tạo từ localStorage để F5 / redirect không mất giỏ
  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [user, setUser] = useState(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [notification, setNotification] = useState(null); // Thông báo nhỏ

  useEffect(() => {
    const u = localStorage.getItem('discordUser') || localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));

    const onStorage = (e) => {
      if (e.key === 'user' || e.key === 'discordUser') {
        const stored = localStorage.getItem('discordUser') || localStorage.getItem('user');
        if (stored) setUser(JSON.parse(stored));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Lưu cart xuống localStorage mỗi khi thay đổi
  useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Hàm thêm vào giỏ
  const addToCart = (product) => {
    setCart((prev) => {
      const exist = prev.find((x) => x._id === product._id);
      if (exist) {
        return prev.map((x) => x._id === product._id ? { ...x, quantity: x.quantity + 1 } : x);
      } else {
        return [...prev, { ...product, quantity: 1 }];
      }
    });
    
    // KHÔNG TỰ BẬT CART NỮA -> Thay bằng thông báo
    setNotification(`Added ${product.name} to bag`);
    
    // Tắt thông báo sau 3s
    setTimeout(() => setNotification(null), 3000);
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item._id !== id));
  };

  const clearCart = () => setCart([]);
  
  const loginDiscord = (userData) => {
    setUser(userData);
    localStorage.setItem('discordUser', JSON.stringify(userData));
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const logoutDiscord = () => {
    setUser(null);
    localStorage.removeItem('discordUser');
    localStorage.removeItem('user');
  }

  return (
    <ShopContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, user, loginDiscord, logoutDiscord, isCartOpen, setIsCartOpen }}>
      {children}
      
      {/* Toast Notification (Hiện ở dưới màn hình) */}
      {notification && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[100] toast-animate">
          <div className="bg-[#333333]/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-[#444]">
             <span className="text-[#00D632] bg-white/10 rounded-full p-1 text-xs">✓</span> 
             <span className="text-sm font-medium">{notification}</span>
          </div>
        </div>
      )}
    </ShopContext.Provider>
  );
};