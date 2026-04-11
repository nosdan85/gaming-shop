import { useContext } from 'react';
import { ShopContext } from '../context/ShopContext';
import { PlusIcon } from '@heroicons/react/24/solid';

const ProductCard = ({ product, onOpenDetail }) => {
  const { addToCart } = useContext(ShopContext);
  const displayPrice = product.originalPriceString || `$${product.price}`;

  return (
    <div
      className="card-apple p-5 flex flex-col h-full group cursor-pointer border border-transparent hover:border-[var(--color-accent)]/30 transition-all duration-300 relative overflow-hidden rounded-3xl bg-[var(--color-bg-secondary)]"
      onClick={() => {
        if (onOpenDetail) onOpenDetail(product);
      }}
    >
      <div className="absolute inset-0 bg-[var(--color-accent)]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>

      <div className="mb-3 min-h-[60px] relative z-10">
        <p className="text-[var(--color-text-secondary)] text-[11px] font-bold uppercase tracking-wider mb-1">{product.category}</p>
        <h3 className="text-white font-bold text-sm md:text-[15px] leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
          {product.name}
        </h3>
      </div>

      <div className="flex-1 flex items-center justify-center my-4 relative z-10">
        <img
          src={`/products/${product.image}`}
          alt={product.name}
          className="w-28 h-28 md:w-40 md:h-40 object-contain transition-transform duration-500 group-hover:scale-110 drop-shadow-[0_5px_15px_rgba(0,0,0,0.5)] group-hover:drop-shadow-[0_8px_24px_rgba(6,182,212,0.35)]"
          onError={(e) => e.target.src = 'https://via.placeholder.com/150'}
        />
      </div>

      <div className="flex items-center justify-between mt-auto bg-black/30 rounded-full p-1.5 pl-4 backdrop-blur-sm relative z-10 border border-white/5">
        <span className="text-white font-bold text-sm md:text-base">{displayPrice}</span>

        <button
          onClick={(e) => {
            e.stopPropagation();
            addToCart(product);
          }}
          className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white p-2 rounded-full transition-all transform hover:scale-105 active:scale-90 shadow-lg shadow-cyan-500/20 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-cyan-400"
          title="Add to Cart"
          onMouseDown={(e) => {
            e.currentTarget.classList.add('tap-bounce');
          }}
          onAnimationEnd={(e) => {
            e.currentTarget.classList.remove('tap-bounce');
          }}
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default ProductCard;