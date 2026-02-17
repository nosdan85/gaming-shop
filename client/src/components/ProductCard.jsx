import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';
import { PlusIcon } from '@heroicons/react/24/solid'; // Thêm icon cộng cho nút ADD

// Nhận prop onOpenDetail
const ProductCard = ({ product, onOpenDetail }) => {
  const { addToCart } = useContext(ShopContext);

  return (
    <div 
        // Thêm border màu accent khi hover
        className="card-apple p-5 flex flex-col h-full group cursor-pointer border border-transparent hover:border-[var(--color-accent)]/30 transition-all duration-300 relative overflow-hidden rounded-3xl bg-[var(--color-bg-secondary)]"
        onClick={() => {
            // Gọi hàm mở modal khi click vào thẻ
            if (onOpenDetail) onOpenDetail(product);
        }}
    >
        {/* Hiệu ứng nền glow nhẹ khi hover */}
        <div className="absolute inset-0 bg-[var(--color-accent)]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

        {/* Phần đầu: Tên & Loại */}
        <div className="mb-3 min-h-[60px] relative z-10">
            <p className="text-[var(--color-text-secondary)] text-[11px] font-bold uppercase tracking-wider mb-1">{product.category}</p>
            <h3 className="text-white font-bold text-sm md:text-[15px] leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
              {product.name}
            </h3>
        </div>

        {/* Phần giữa: Ảnh */}
        <div className="flex-1 flex items-center justify-center my-4 relative z-10">
            <img 
                src={`/pictures/products/${product.image}`} 
                alt={product.name}
                // Ảnh to hơn một chút và có hiệu ứng drop-shadow màu accent
                className="w-28 h-28 md:w-40 md:h-40 object-contain transition-transform duration-500 group-hover:scale-110 drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] group-hover:drop-shadow-[0_8px_20px_rgba(14,165,233,0.4)]"
                onError={(e) => e.target.src = 'https://via.placeholder.com/150'}
            />
        </div>

        {/* Phần cuối: Giá & Nút Add */}
        <div className="flex items-center justify-between mt-auto bg-black/30 rounded-full p-1.5 pl-4 backdrop-blur-sm relative z-10 border border-white/5">
            <span className="text-white font-bold text-sm md:text-base">${product.price}</span>
            
            {/* Nút ADD: Màu accent và chặn click */}
            <button 
                onClick={(e) => {
                    e.stopPropagation(); // Chặn không cho mở modal
                    addToCart(product);
                }}
                className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white p-2 rounded-full transition-all transform hover:scale-105 active:scale-90 shadow-lg shadow-cyan-500/20 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-cyan-400"
                title="Add to Cart"
                onMouseDown={(e) => {
                  // Thêm class tạm để tạo hiệu ứng bounce nhẹ
                  e.currentTarget.classList.add('tap-bounce');
                }}
                onAnimationEnd={(e) => {
                  e.currentTarget.classList.remove('tap-bounce');
                }}
            >
                <PlusIcon className="w-5 h-5"/>
            </button>
        </div>
    </div>
  );
};

export default ProductCard;