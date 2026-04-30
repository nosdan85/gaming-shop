import { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { XMarkIcon, CheckCircleIcon, PlusIcon, MinusIcon } from '@heroicons/react/24/outline';
import { formatCardPrice } from '../utils/priceFormatting';
import { formatDeliveredUnitsLabel } from '../utils/itemQuantityDisplay';

const MAX_UI_QUANTITY = 100000;

const ProductDetailModal = ({ product, onClose }) => {
  const { addToCart } = useContext(ShopContext);
  const [quantity, setQuantity] = useState(1);
  const [quantityInput, setQuantityInput] = useState('1');
  const [isPortraitImage, setIsPortraitImage] = useState(false);

  useEffect(() => {
    setQuantity(1);
    setQuantityInput('1');
    setIsPortraitImage(false);
  }, [product?._id]);

  if (!product) return null;
  const isSetCategory = String(product?.category || '').trim().toLowerCase() === 'sets';
  const productImageSrc = `/products/${encodeURIComponent(String(product.image || ''))}`;
  const displayPrice = formatCardPrice(product?.originalPriceString, product?.price);
  const itemDescription = `${displayPrice} for ${formatDeliveredUnitsLabel(product?.name, 1)}`;
  const imageFrameClass = isPortraitImage
    ? 'max-w-[300px] md:max-w-[470px] aspect-[3/4]'
    : 'max-w-[320px] md:max-w-[560px] aspect-square';

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

  const handleAddToCart = () => {
    const normalized = normalizeQuantity(quantityInput);
    setQuantity(normalized);
    setQuantityInput(String(normalized));
    addToCart(product, normalized);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      ></div>

      <div className="relative bg-[var(--color-bg-main)] w-full max-w-3xl md:max-w-[90rem] rounded-[10px] shadow-[rgba(17,24,39,0.12)_0px_24px_60px,rgba(17,24,39,0.06)_0px_8px_24px] overflow-hidden border border-[var(--color-border)] animate-pop-in flex flex-col md:flex-row">
        <button
          onClick={onClose}
          className="btn-press absolute top-4 right-4 z-10 p-2 bg-[var(--color-bg-elevated)] rounded-full text-[var(--color-text-primary)] hover:text-[var(--color-error)] transition"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        <div className="w-full md:w-[60%] bg-[var(--color-bg-secondary)] p-6 md:p-10 flex items-center justify-center">
          <div className={`w-full ${imageFrameClass}`}>
            <div className="w-full h-full bg-white rounded-[8px] border border-[var(--color-border)] overflow-hidden">
              <img
                src={productImageSrc}
                alt={product.name}
                loading="eager"
                decoding="async"
                className={`w-full h-full object-contain ${isSetCategory ? 'scale-[1.10]' : ''}`}
                onLoad={(event) => {
                  const naturalWidth = Number(event.currentTarget?.naturalWidth || 0);
                  const naturalHeight = Number(event.currentTarget?.naturalHeight || 0);
                  if (!naturalWidth || !naturalHeight) return;
                  setIsPortraitImage(naturalHeight > (naturalWidth * 1.05));
                }}
                onError={(e) => {
                  e.currentTarget.src = '/products/aura-chest.png';
                  setIsPortraitImage(false);
                }}
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-[40%] p-6 md:p-10 flex flex-col">
          <p className="text-[var(--color-accent)] text-xs font-gothic font-normal uppercase tracking-wider mb-2">
            {product.category}
          </p>
          <h2 className="text-2xl md:text-[36px] font-gothic font-normal text-[var(--color-text-primary)] mb-4 leading-tight tracking-[-0.72px]">
            {product.name}
          </h2>
          <p className="text-[var(--color-text-secondary)] font-serif text-sm mb-4">{itemDescription}</p>

          <div className="space-y-2 mb-6">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <CheckCircleIcon className="w-5 h-5 text-[var(--color-success)]" />
              <span>Instant Delivery</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <CheckCircleIcon className="w-5 h-5 text-[var(--color-success)]" />
              <span>Secure Transaction</span>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-pill">
              <button
                type="button"
                onClick={() => updateQuantity(quantity - 1)}
                className="btn-press w-8 h-8 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center"
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
                className="w-16 bg-transparent text-sm font-semibold text-[var(--color-text-primary)] text-center outline-none"
              />
              <button
                type="button"
                onClick={() => updateQuantity(quantity + 1)}
                className="btn-press w-8 h-8 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] flex items-center justify-center"
                aria-label="Increase quantity"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
            <span className="text-xs text-[var(--color-text-secondary)]">Selected quantity</span>
          </div>

          <button
            onClick={handleAddToCart}
            className="btn-press w-full bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white hover:text-white py-4 rounded-[8px] text-lg font-gothic font-normal shadow-none active:scale-95 transition-all mt-auto"
          >
            Add {quantity} to Cart
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDetailModal;
