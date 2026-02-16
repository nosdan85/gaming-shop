import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';

const ProductDetailModal = ({ product, onClose }) => {
  const { addToCart } = useContext(ShopContext);
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>

      {/* Content */}
      <div className="relative bg-[#0F172A] border border-[#1E293B] rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl animate-fade-in flex flex-col md:flex-row">
        
        {/* Close Button */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full hover:bg-red-500/80 transition text-white">
          <XMarkIcon className="w-6 h-6" />
        </button>

        {/* Left: Image */}
        <div className="w-full md:w-1/2 bg-[#050B1E] flex items-center justify-center p-8 relative">
           <div className="absolute inset-0 bg-blue-600/5"></div>
           <img 
             src={`/pictures/products/${product.image}`} 
             alt={product.name}
             className="w-full h-auto object-contain max-h-[400px] drop-shadow-[0_0_30px_rgba(59,130,246,0.5)] z-10"
             onError={(e) => e.target.src = 'https://via.placeholder.com/300?text=No+Image'}
           />
        </div>

        {/* Right: Info */}
        <div className="w-full md:w-1/2 p-8 flex flex-col">
          <span className="inline-block px-3 py-1 rounded-full bg-blue-500/20 text-blue-400 text-xs font-bold w-fit mb-4 border border-blue-500/30">
            {product.category}
          </span>

          <h2 className="text-3xl font-bold text-white mb-2">{product.name}</h2>
          <div className="text-3xl font-extrabold gradient-text mb-6">${product.price}</div>

          <div className="bg-[#1E293B]/50 p-4 rounded-xl border border-[#334155] mb-6 flex-1">
            <h4 className="text-gray-400 text-sm uppercase font-bold mb-2">Description</h4>
            <p className="text-gray-300 leading-relaxed text-sm whitespace-pre-line">
              {product.desc || "No description available for this item."}
            </p>
          </div>

          <button 
            onClick={() => { addToCart(product); onClose(); }}
            className="w-full btn-primary flex items-center justify-center gap-2 py-4 text-lg shadow-xl shadow-purple-600/30"
          >
            <ShoppingCartIcon className="w-6 h-6" />
            Add to Cart - ${product.price}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;