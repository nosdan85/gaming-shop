import { useContext, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { formatCardPrice } from '../utils/priceFormatting';

const MAX_UI_QUANTITY = 100000;

const ProductCard = ({ product, onOpenDetail }) => {
  const { addToCart } = useContext(ShopContext);
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const displayPrice = formatCardPrice(product.originalPriceString, product.price);
  const productImageSrc = `/products/${encodeURIComponent(String(product.image || ''))}`;

  const normalizeQuantity = (value, fallback = 1) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    if (parsed > MAX_UI_QUANTITY) return MAX_UI_QUANTITY;
    return parsed;
  };

  const updateQuantity = (next) => {
    const normalized = normalizeQuantity(next, null);
    if (normalized === null) return;
    setQuantity(normalized);
    setQuantityInput(String(normalized));
  };

  const handleQuantityInput = (event) => {
    const rawValue = event.target.value;
    if (rawValue === '') {
      setQuantityInput('');
      return;
    }

    if (!/^\d+$/.test(rawValue)) return;
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed)) return;
    if (parsed > MAX_UI_QUANTITY) {
      setQuantity(MAX_UI_QUANTITY);
      setQuantityInput(String(MAX_UI_QUANTITY));
      return;
    }

    setQuantityInput(rawValue);
    if (parsed >= 1) setQuantity(parsed);
  };

  const handleQuantityBlur = () => {
    const normalized = normalizeQuantity(quantityInput);
    setQuantity(normalized);
    setQuantityInput(String(normalized));
  };

  const handleAddToCart = (event) => {
    event.stopPropagation();
    const normalized = normalizeQuantity(quantityInput);
    setQuantity(normalized);
    setQuantityInput(String(normalized));
    addToCart(product, normalized);
  };

  return (
    <div
      className="card-apple p-4 md:p-5 flex flex-col h-full group cursor-pointer border border-[#2b2f3f] hover:border-[#8f96aa]/45 transition-all duration-300 relative overflow-hidden rounded-3xl bg-[linear-gradient(180deg,#111427_0%,#0e1221_100%)]"
      onClick={() => {
        if (onOpenDetail) onOpenDetail(product);
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_55%)] opacity-70 pointer-events-none"></div>

      <div className="mb-3 min-h-[60px] relative z-10">
        <p className="text-[#b8bfd4] text-[11px] font-bold uppercase tracking-wider mb-1">{product.category}</p>
        <h3 className="text-white font-bold text-sm md:text-[15px] leading-snug line-clamp-2 group-hover:text-[#e7ebff] transition-colors">
          {product.name}
        </h3>
      </div>

      <div className="flex-1 flex items-center justify-center my-3 md:my-4 relative z-10">
        <div className="w-[90%] h-[90%] max-w-[150px] max-h-[150px] md:max-w-[180px] md:max-h-[180px] bg-white rounded-2xl border border-[#dbe1ef] shadow-[0_10px_28px_rgba(255,255,255,0.10)] flex items-center justify-center p-2 md:p-3">
          <img
            src={productImageSrc}
            alt={product.name}
            className="w-full h-full object-contain transition-transform duration-400 group-hover:scale-105"
            onError={(e) => { e.currentTarget.src = '/products/aura-chest.png'; }}
          />
        </div>
      </div>

      <div className="mt-auto bg-black/35 rounded-2xl px-3 py-2.5 backdrop-blur-sm relative z-10 border border-white/10">
        <div className="flex items-center justify-between gap-2">
          <span className="text-white font-bold text-sm md:text-[15px] leading-tight">{displayPrice}</span>

          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center bg-black/50 border border-white/15 rounded-full">
              <button
                type="button"
                onClick={() => updateQuantity(quantity - 1)}
                className="btn-press w-7 h-7 rounded-full text-gray-200 hover:text-white flex items-center justify-center"
                aria-label="Decrease quantity"
              >
                <MinusIcon className="w-4 h-4" />
              </button>
              <input
                type="number"
                min={1}
                max={MAX_UI_QUANTITY}
                value={quantityInput}
                onChange={handleQuantityInput}
                onBlur={handleQuantityBlur}
                onClick={(e) => e.stopPropagation()}
                className="w-14 bg-transparent text-xs font-semibold text-white text-center outline-none"
              />
              <button
                type="button"
                onClick={() => updateQuantity(quantity + 1)}
                className="btn-press w-7 h-7 rounded-full text-gray-200 hover:text-white flex items-center justify-center"
                aria-label="Increase quantity"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              className="btn-press bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white p-2 rounded-full transition-all transform hover:scale-105 active:scale-90 shadow-lg shadow-cyan-500/25 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-cyan-400"
              title="Add to Cart"
            >
              <PlusIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
