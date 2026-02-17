import { useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import { ShoppingBagIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';

// Đảm bảo bạn import đúng đường dẫn ảnh logo DÀI
// Nếu để trong public folder thì dùng đường dẫn string trực tiếp '/logo.png'
import logo from '/logo.png'; 

const Navbar = () => {
  const { cart, isCartOpen, setIsCartOpen } = useContext(ShopContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          
          {/* --- SỬA PHẦN LOGO Ở ĐÂY --- */}
          <Link to="/" className="flex-shrink-0 flex items-center">
            <img 
              src={logo} 
              alt="NOS Logo" 
              // GIẢI THÍCH CLASS:
              // h-10 md:h-14: Chiều cao 40px trên đt, 56px trên máy tính -> Đủ lớn để logo dài ra ngang.
              // w-auto: Tự động kéo dài chiều ngang theo tỷ lệ ảnh -> Sẽ lấp đầy khung bạn khoanh.
              // object-contain: Đảm bảo toàn bộ chữ trong logo không bị cắt.
              className="h-10 md:h-14 w-auto object-contain" 
            />
            {/* LƯU Ý: Tôi đã XÓA thẻ <span>NOS</span> ở đây vì trong ảnh logo của bạn đã có chữ rồi */}
          </Link>

          {/* ... (Phần Menu giữ nguyên không đổi) ... */}
          
          {/* Mobile Menu Button */}
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
      
      {/* (Phần Mobile Menu Dropdown giữ nguyên code cũ của bạn) */}
    </nav>
  );
};

export default Navbar;