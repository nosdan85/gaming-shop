import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

const ProductDetailModal = ({ product, onClose }) => {
  const { addToCart } = useContext(ShopContext);

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop mờ */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Modal Content */}
      <div className="relative bg-[var(--color-bg-secondary)] w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-gray-800 animate-pop-in flex flex-col md:flex-row">
        
        {/* Nút đóng */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition"
        >
          <XMarkIcon className="w-6 h-6"/>
        </button>

        {/* Cột Trái: Ảnh */}
        <div className="w-full md:w-1/2 bg-black/50 p-8 flex items-center justify-center">
          <img 
            src={`/pictures/products/${product.image}`} 
            alt={product.name}
            className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-[0_10px_20px_rgba(14,165,233,0.3)]"
            onError={(e) => e.target.src = 'https://via.placeholder.com/300'}
          />
        </div>

        {/* Cột Phải: Thông tin */}
        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col">
          <p className="text-[var(--color-accent)] text-xs font-bold uppercase tracking-wider mb-2">
            {product.category}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 leading-tight">
            {product.name}
          </h2>
          
          {/* Giá bán */}
          <div className="text-3xl font-bold text-white mb-6">
            ${product.price}
          </div>

          {/* Mô tả (Nếu có) */}
          <div className="flex-1 mb-6">
            <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase">Description</h3>
            <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">
              {product.description || product.desc || "No description available for this product. It's a great item, trust us!"}
            </p>
          </div>

           {/* Các điểm nổi bật (Ví dụ) */}
           <div className="space-y-2 mb-8">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircleIcon className="w-5 h-5 text-[var(--color-accent)]"/>
                <span>Instant Delivery</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <CheckCircleIcon className="w-5 h-5 text-[var(--color-accent)]"/>
                <span>Secure Transaction</span>
              </div>
           </div>

          {/* Nút Thêm vào giỏ */}
          <button 
            onClick={() => {
              addToCart(product);
              onClose(); // Đóng modal sau khi thêm
            }}
            className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white py-4 rounded-2xl text-lg font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all mt-auto"
          >
            Add to Cart - ${product.price}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;