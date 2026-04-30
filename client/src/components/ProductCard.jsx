import { useContext, useEffect, useMemo, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { PlusIcon, MinusIcon } from '@heroicons/react/24/solid';
import { formatCardPrice } from '../utils/priceFormatting';
import { formatDeliveredUnitsLabel } from '../utils/itemQuantityDisplay';

const MAX_UI_QUANTITY = 100000;

const ProductCard = ({ product, onOpenDetail }) => {
  const { addToCart } = useContext(ShopContext);
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [imageVariantIndex, setImageVariantIndex] = useState(0);
  const displayPrice = formatCardPrice(product.originalPriceString, product.price);
  const itemDescription = `${displayPrice} for ${formatDeliveredUnitsLabel(product?.name, 1)}`;
  const isSetCategory = String(product?.category || '').trim().toLowerCase() === 'sets';
  const imageCandidates = useMemo(() => {
    const rawName = String(product?.image || '').trim();
    const decodedName = (() => {
      try {
        return decodeURIComponent(rawName);
      } catch (_) {
        return rawName;
      }
    })();
    const preferred = `/products/${encodeURIComponent(decodedName)}`;
    const direct = `/products/${decodedName}`;
    return Array.from(new Set([preferred, direct, '/products/aura-chest.png']));
  }, [product?.image]);
  const productImageSrc = imageCandidates[Math.min(imageVariantIndex, imageCandidates.length - 1)];

  useEffect(() => {
    setImageVariantIndex(0);
  }, [product?.image]);

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
      className="card-apple p-4 md:p-5 flex flex-col h-full group cursor-pointer border border-[var(--color-border)] hover:border-[var(--color-border-medium)] transition-all duration-200 relative overflow-hidden rounded-[8px] bg-[var(--color-bg-secondary)] hover:shadow-[rgba(17,24,39,0.08)_0px_18px_42px,rgba(17,24,39,0.05)_0px_6px_16px]"
      onClick={() => {
        if (onOpenDetail) onOpenDetail(product);
      }}
    >
      <div className="mb-3 min-h-[60px] relative z-10">
        <p className="text-[var(--color-text-secondary)] text-[11px] font-gothic font-normal uppercase tracking-wider mb-1">{product.category}</p>
        <h3 className="text-[var(--color-text-primary)] font-gothic font-normal text-sm md:text-[15px] leading-snug tracking-[-0.11px] line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors">
          {product.name}
        </h3>
        <p className="text-[var(--color-text-secondary)] font-serif text-[11px] mt-1 leading-tight">{itemDescription}</p>
      </div>

      <div className="flex-1 flex items-center justify-center my-3 md:my-4 relative z-10">
        <div className="relative w-[90%] h-[90%] max-w-[150px] max-h-[150px] md:max-w-[180px] md:max-h-[180px] bg-white rounded-[8px] border border-[var(--color-border)] flex items-center justify-center p-2 md:p-3">
          <img
            src={productImageSrc}
            alt={product.name}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className={`w-full h-full object-contain transition-transform duration-400 ${isSetCategory ? 'scale-[1.10] group-hover:scale-[1.17]' : 'group-hover:scale-105'}`}
            onError={() => {
              setImageVariantIndex((prev) => {
                if (prev >= imageCandidates.length - 1) return prev;
                return prev + 1;
              });
            }}
          />
        </div>
      </div>

      <div className="mt-auto bg-[var(--color-bg-elevated)] rounded-[8px] px-3 py-2.5 relative z-10 border border-[var(--color-border)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <span className="text-[var(--color-text-primary)] font-gothic font-normal text-sm md:text-[15px] leading-tight">{displayPrice}</span>

          <div className="flex items-center gap-2 w-full md:w-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex-1 md:flex-none flex items-center justify-between bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-pill px-1">
              <button
                type="button"
                onClick={() => updateQuantity(quantity - 1)}
                className="btn-press w-6 h-6 md:w-7 md:h-7 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center"
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
                className="w-8 md:w-12 bg-transparent text-xs font-semibold text-[var(--color-text-primary)] text-center outline-none"
              />
              <button
                type="button"
                onClick={() => updateQuantity(quantity + 1)}
                className="btn-press w-6 h-6 md:w-7 md:h-7 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center"
                aria-label="Increase quantity"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleAddToCart}
              className="btn-press shrink-0 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white p-2 rounded-full transition-all transform hover:scale-105 active:scale-90 shadow-none hover:shadow-[rgba(47,111,237,0.18)_0px_6px_14px] flex items-center justify-center focus:outline-none"
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
