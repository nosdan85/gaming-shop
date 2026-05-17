import { useContext, useEffect, useMemo, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { formatCardPrice } from '../utils/priceFormatting';
import { formatDeliveredUnitsLabel } from '../utils/itemQuantityDisplay';
import { getProductImageUrl } from '../utils/productImage';

const ProductCard = ({ product, onOpenDetail }) => {
  const displayPrice = formatCardPrice(product.originalPriceString, product.price);
  const itemDescription = `${displayPrice} for ${formatDeliveredUnitsLabel(product?.name, 1)}`;
  const isSetCategory = String(product?.category || '').trim().toLowerCase() === 'sets';
  const [imageVariantIndex, setImageVariantIndex] = useState(0);
  const imageCandidates = useMemo(() => {
    const rawName = String(product?.image || '').trim();
    const decodedName = (() => {
      try { return decodeURIComponent(rawName); } catch (_) { return rawName; }
    })();
    const primary = getProductImageUrl(decodedName);
    const fallback = '/products/aura-chest.png';
    return [primary, fallback];
  }, [product?.image]);
  const productImageSrc = imageCandidates[Math.min(imageVariantIndex, imageCandidates.length - 1)];

  useEffect(() => { setImageVariantIndex(0); }, [product?.image]);

  return (
    <div
      className="card-apple p-3 flex flex-col h-full group cursor-pointer border border-[var(--color-border)] hover:border-[var(--color-border-medium)] transition-all duration-200 relative overflow-hidden rounded-[8px] bg-[var(--color-bg-secondary)] hover:shadow-[rgba(17,24,39,0.08)_0px_18px_42px,rgba(17,24,39,0.05)_0px_6px_16px]"
      onClick={() => { if (onOpenDetail) onOpenDetail(product); }}
    >
      <p className="text-[var(--color-text-secondary)] text-[10px] font-gothic font-normal uppercase tracking-wider mb-1">{product.category}</p>
      <h3 className="text-[var(--color-text-primary)] font-gothic font-normal text-[13px] leading-snug tracking-[-0.11px] line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors mb-2">
        {product.name}
      </h3>

      <div className="flex-1 flex items-center justify-center my-2 relative z-10">
        <div className="relative w-[90%] h-[90%] max-w-[150px] max-h-[150px] bg-[var(--color-bg-secondary)] rounded-[8px] border border-[var(--color-border)] flex items-center justify-center p-2">
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

      <div className="mt-auto pt-1 relative z-10">
        <p className="text-[var(--color-text-secondary)] font-serif text-[11px] leading-tight">{itemDescription}</p>
      </div>
    </div>
  );
};

export default ProductCard;
