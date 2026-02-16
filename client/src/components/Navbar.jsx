import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';
import { ShoppingBagIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const Navbar = ({ onSearch }) => {
  const { cart, setIsCartOpen } = useContext(ShopContext);
  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <nav className="sticky top-0 z-40 bg-[#000000]/80 backdrop-blur-xl border-b border-[#1c1c1e]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
        
        {/* LOGO ẢNH (Thay thế chữ) */}
        <div className="cursor-pointer" onClick={() => window.scrollTo(0,0)}>
           {/* Đường dẫn ảnh trỏ về public/pictures/products/logo.png */}
           <img 
             src="/pictures/products/logo.png" 
             alt="Store Logo" 
             className="h-10 w-auto object-contain hover:opacity-80 transition-opacity"
             onError={(e) => {
               // Fallback nếu ảnh lỗi thì hiện chữ
               e.target.style.display = 'none';
               e.target.nextSibling.style.display = 'block';
             }}
           />
           <h1 className="text-xl font-semibold text-white hidden">GamingShop</h1>
        </div>
        
        {/* Search Bar */}
        <div className="hidden md:flex flex-1 max-w-sm mx-8 relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search..." 
            className="w-full bg-[#1c1c1e] border-none rounded-lg py-2 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 transition-all"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        {/* Cart Icon */}
        <button 
          onClick={() => setIsCartOpen(true)} 
          className="relative p-2 text-gray-300 hover:text-white transition-colors"
        >
          <ShoppingBagIcon className="h-6 w-6" />
          {totalItems > 0 && (
            <span className="absolute -top-1 -right-1 bg-white text-black text-[10px] font-bold h-4 w-4 flex items-center justify-center rounded-full">
              {totalItems}
            </span>
          )}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;