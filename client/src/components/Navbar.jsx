import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import { ShoppingBagIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

// --- QUAN TRỌNG: ĐÃ XÓA DÒNG IMPORT LOGO Ở ĐÂY ĐỂ TRÁNH LỖI BUILD ---

const Navbar = () => {
  const { cart, isCartOpen, setIsCartOpen } = useContext(ShopContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          
          {/* --- LOGO ĐÃ SỬA --- */}
          <Link to="/" className="flex-shrink-0 flex items-center">
            <img 
              src="/logo.png"   // <--- Dùng trực tiếp đường dẫn string, không dùng biến {logo}
              alt="NOS Logo" 
              // Class chỉnh kích thước:
              // h-10 (40px) trên mobile để không quá to
              // md:h-14 (56px) trên PC để đủ dài và rõ
              className="h-10 md:h-14 w-auto object-contain" 
            />
          </Link>

          {/* Desktop Menu (Giữ nguyên các link của bạn) */}
          <div className="hidden md:flex space-x-8">
            <Link to="/" className="text-gray-300 hover:text-white transition-colors font-medium">Home</Link>
            <Link to="/shop" className="text-gray-300 hover:text-white transition-colors font-medium">Shop</Link>
            <Link to="/about" className="text-gray-300 hover:text-white transition-colors font-medium">About</Link>
          </div>
          
          {/* Mobile Menu Button & Cart */}
          <div className="flex items-center gap-4">
             {/* Cart Icon */}
             <button 
               onClick={() => setIsCartOpen(true)} 
               className="relative p-2 text-gray-300 hover:text-white transition-colors"
             >
               <ShoppingBagIcon className="w-6 h-6" />
               {totalItems > 0 && (
                 <span className="absolute top-0 right-0 bg-[#0EA5E9] text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-lg shadow-blue-500/50">
                   {totalItems}
                 </span>
               )}
             </button>

             {/* Mobile Menu Toggle */}
             <button 
               onClick={() => setIsMenuOpen(!isMenuOpen)} 
               className="md:hidden p-2 text-gray-300 hover:text-white"
             >
               {isMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
             </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu Dropdown */}
      {isMenuOpen && (
        <div className="md:hidden bg-[#09090b] border-t border-white/10">
          <div className="px-4 pt-2 pb-4 space-y-1">
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-white hover:bg-white/5 rounded-md">Home</Link>
            <Link to="/shop" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-md">Shop</Link>
            <Link to="/about" onClick={() => setIsMenuOpen(false)} className="block px-3 py-2 text-base font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-md">About</Link>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;