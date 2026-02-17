import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';

// Thêm prop onOpenDetail để nhận hàm mở modal từ cha
const ProductCard = ({ product, onOpenDetail }) => {
  const { addToCart } = useContext(ShopContext);

  return (
    // 1. Sửa onClick của thẻ cha: Chỉ dùng để mở chi tiết
    <div 
        className="card-apple p-5 flex flex-col h-full group cursor-pointer border border-transparent hover:border-[#0EA5E9]/30 transition-all duration-300" 
        onClick={() => {
            if (onOpenDetail) onOpenDetail(product);
        }}
    >
        {/* Phần đầu: Tên & Loại */}
        <div className="mb-2 min-h-[50px]">
            <p className="text-[#86868b] text-[10px] font-bold uppercase tracking-wider mb-1">{product.category}</p>
            <h3 className="text-white font-semibold text-sm md:text-base leading-snug line-clamp-2 group-hover:text-[#0EA5E9] transition-colors">
              {product.name}
            </h3>
        </div>

        {/* Phần giữa: Ảnh (Zoom khi hover) */}
        <div className="flex-1 flex items-center justify-center my-4">
            <img 
                src={`/pictures/products/${product.image}`} 
                alt={product.name}
                className="w-24 h-24 md:w-36 md:h-36 object-contain transition-transform duration-500 group-hover:scale-110 drop-shadow-lg"
                onError={(e) => e.target.src = 'https://via.placeholder.com/150'}
            />
        </div>

        {/* Phần cuối: Giá & Nút Add */}
        <div className="flex items-center justify-between mt-auto bg-[#2c2c2e] rounded-full p-1 pl-4 group-hover:bg-[#3a3a3c] transition-colors">
            <span className="text-white font-semibold text-sm">${product.price}</span>
            
            {/* 2. Sửa nút ADD: Chặn sự kiện click để không mở Modal + Đổi màu theo Logo */}
            <button 
                onClick={(e) => {
                    e.stopPropagation(); // <--- QUAN TRỌNG: Chặn click xuyên qua thẻ cha
                    addToCart(product);
                }}
                // Đổi màu xanh cũ (#0071e3) thành màu Cyan (#0EA5E9) cho khớp Logo
                className="bg-[#0EA5E9] text-white px-4 py-1.5 rounded-full text-xs font-bold hover:bg-[#0284c7] transition-colors shadow-[0_0_10px_rgba(14,165,233,0.4)]"
            >
                ADD
            </button>
        </div>
    </div>
  );
};

export default ProductCard;