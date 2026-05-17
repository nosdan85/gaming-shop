import { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import {
  readAuthState,
  writeAuthState,
  clearAuthState,
  emitAuthStateChanged,
  subscribeAuthStateChanges
} from '../utils/authSync';
import { formatDeliveredUnitsLabel } from '../utils/itemQuantityDisplay';

export const ShopContext = createContext();

const MAX_CART_QUANTITY = 100000;
const normalizeQuantity = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  if (parsed < 1) return fallback;
  if (parsed > MAX_CART_QUANTITY) return MAX_CART_QUANTITY;
  return parsed;
};

export const ShopProvider = ({ children }) => {
  const [cart, setCart] = useState(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem('cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [user, setUser] = useState(() => readAuthState().user);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    const syncUser = () => {
      setUser(readAuthState().user);
    };
    return subscribeAuthStateChanges(syncUser);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('cart', JSON.stringify(cart));
    } catch {
      // Ignore storage write errors.
    }
  }, [cart]);

  const addToCart = (product, quantity = 1) => {
    const normalizedQuantity = normalizeQuantity(quantity);
    setCart((prev) => {
      const exist = prev.find((x) => x._id === product._id);
      if (exist) {
        return prev.map((x) => {
          if (x._id !== product._id) return x;
          const nextQuantity = Math.min(MAX_CART_QUANTITY, x.quantity + normalizedQuantity);
          return { ...x, ...product, quantity: nextQuantity };
        });
      }

      return [...prev, { ...product, quantity: normalizedQuantity }];
    });

    setNotification(`Added ${formatDeliveredUnitsLabel(product?.name, normalizedQuantity)} ${product.name} to bag`);
    setTimeout(() => setNotification(null), 3000);
  };

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((item) => item._id !== id));
  };

  const clearCart = () => setCart([]);

  const loginDiscord = (userData) => {
    const currentToken = readAuthState().token;
    setUser(userData || null);
    writeAuthState({ user: userData || null, token: currentToken });
    emitAuthStateChanged();
  };

  const logoutDiscord = () => {
    setUser(null);
    clearAuthState();
    emitAuthStateChanged();
    delete axios.defaults.headers.common.Authorization;
  };

  return (
    <ShopContext.Provider value={{ cart, addToCart, removeFromCart, clearCart, user, loginDiscord, logoutDiscord, isCartOpen, setIsCartOpen }}>
      {children}

      {notification && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[100] toast-animate">
          <div className="bg-[#333333]/90 backdrop-blur-md text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-[#444]">
            <span className="text-[#00D632] bg-white/10 rounded-full p-1 text-xs">OK</span>
            <span className="text-sm font-medium">{notification}</span>
          </div>
        </div>
      )}
    </ShopContext.Provider>
  );
};
