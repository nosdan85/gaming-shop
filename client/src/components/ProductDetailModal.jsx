import { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckCircleIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { formatPriceForSentence } from '../utils/priceFormatting';

const MAX_UI_QUANTITY = 100000;

const ProductDetailModal = ({ product, onClose }) => {
  const { addToCart } = useContext(ShopContext);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    setQuantity(1);
  }, [product?._id]);

  if (!product) return null;

  const oneTimePriceLabel = formatPriceForSentence(product.originalPriceString, product.price);
  const bulkPriceLabel = product.bulkPriceString
    ? formatPriceForSentence(product.bulkPriceString, product.bulkPrice)
    : 'No bulk price available for this item';

  const updateQuantity = (next) => {
    if (!Number.isInteger(next)) return;
    if (next < 1) return;
    if (next > MAX_UI_QUANTITY) return;
    setQuantity(next);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      <div className="relative bg-[var(--color-bg-secondary)] w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden border border-gray-800 animate-pop-in flex flex-col md:flex-row">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 bg-black/50 rounded-full text-white hover:bg-black/80 transition"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="w-full md:w-1/2 bg-black/45 p-8 flex items-center justify-center">
          <div className="w-full max-w-[300px] aspect-square bg-white rounded-2xl border border-[#dbe1ef] shadow-[0_12px_26px_rgba(255,255,255,0.10)] p-4 flex items-center justify-center">
            <img
              src={`/products/${product.image}`}
              alt={product.name}
              className="w-full h-full object-contain"
              onError={(e) => e.target.src = 'https://via.placeholder.com/300'}
            />
          </div>
        </div>

        <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col">
          <p className="text-[var(--color-accent)] text-xs font-bold uppercase tracking-wider mb-2">
            {product.category}
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4 leading-tight">
            {product.name}
          </h2>

          <div className="rounded-2xl border border-white/10 bg-black/35 p-4 mb-5">
            <p className="text-sm text-white font-semibold">One-time: <span className="font-normal text-gray-300">{oneTimePriceLabel}</span></p>
            <p className="text-sm text-white font-semibold mt-2">Bulk: <span className="font-normal text-gray-300">{bulkPriceLabel}</span></p>
            <p className="text-[11px] text-[#9ca3b8] mt-3">Bulk rule: line total above $14.99 uses bulk pricing when available.</p>
          </div>

          <div className="flex-1 mb-6">
            <h3 className="text-sm font-bold text-gray-300 mb-2 uppercase">Description</h3>
            <p className="text-gray-400 text-sm leading-relaxed whitespace-pre-line">
              {product.description || product.desc || 'No description available for this product.'}
            </p>
          </div>

          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircleIcon className="w-5 h-5 text-[var(--color-accent)]" />
              <span>Instant Delivery</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <CheckCircleIcon className="w-5 h-5 text-[var(--color-accent)]" />
              <span>Secure Transaction</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center bg-black/45 border border-white/15 rounded-full">
              <button
                type="button"
                onClick={() => updateQuantity(quantity - 1)}
                className="w-8 h-8 text-gray-200 hover:text-white flex items-center justify-center"
                aria-label="Decrease quantity"
              >
                <MinusIcon className="w-4 h-4" />
              </button>
              <span className="min-w-[32px] text-center text-sm font-semibold text-white">{quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(quantity + 1)}
                className="w-8 h-8 text-gray-200 hover:text-white flex items-center justify-center"
                aria-label="Increase quantity"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-gray-400">Selected quantity</span>
          </div>

          <button
            onClick={() => {
              addToCart(product, quantity);
              onClose();
            }}
            className="w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white py-4 rounded-2xl text-lg font-bold shadow-lg shadow-cyan-500/20 active:scale-95 transition-all mt-auto"
          >
            Add {quantity} to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;