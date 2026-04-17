import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { MagnifyingGlassIcon, ShieldCheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

const GAMES = ['Sailor Piece'];
const CATEGORIES = ['All', 'Chest', 'Reroll', 'Shard', 'Seal', 'Relic', 'Sets', 'Combo'];
const KNOWN_CATEGORY_LOOKUP = new Map(
  CATEGORIES
    .filter((category) => category !== 'All')
    .map((category) => [category.toLowerCase(), category])
);
const SORT_OPTIONS = [
  { id: 'none', label: 'Default' },
  { id: 'low-high', label: 'Price: Low -> High' },
  { id: 'high-low', label: 'Price: High -> Low' },
];

const CACHE_KEY = 'productsCache';
const ORDER_PROOF_NOTICE_SEEN_KEY = 'orderProofNoticeSeenV1';

const shouldShowProofNoticeOnLoad = () => {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(ORDER_PROOF_NOTICE_SEEN_KEY) !== '1';
  } catch {
    return true;
  }
};

const normalizeCategory = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Other';
  const knownCategory = KNOWN_CATEGORY_LOOKUP.get(raw.toLowerCase());
  return knownCategory || raw;
};

const normalizeProducts = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      category: normalizeCategory(item.category),
    }));
};

const getCachedProducts = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return normalizeProducts(parsed?.data);
  } catch {
    return [];
  }
};

const Home = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState(() => getCachedProducts());
  const [activeGame, setActiveGame] = useState('Sailor Piece');
  const [activeCategory, setActiveCategory] = useState('All');
  const [categoryAnimKey, setCategoryAnimKey] = useState(0);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(() => getCachedProducts().length === 0);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('none');
  const [showProofNotice, setShowProofNotice] = useState(() => shouldShowProofNoticeOnLoad());

  const closeProofNotice = () => {
    setShowProofNotice(false);
    try {
      localStorage.setItem(ORDER_PROOF_NOTICE_SEEN_KEY, '1');
    } catch {
      // Ignore storage write failures.
    }
  };

  useEffect(() => {
    const cachedProducts = getCachedProducts();
    if (cachedProducts.length > 0) {
      setProducts(cachedProducts);
      setLoading(false);
    } else {
      setLoading(true);
    }

    axios.get('/api/shop/products')
      .then((res) => {
        const nextProducts = normalizeProducts(res.data);
        setProducts(nextProducts);
        setLoadError('');
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: nextProducts, ts: Date.now() }));
        } catch {
          // Ignore cache write errors.
        }
      })
      .catch(() => {
        if (cachedProducts.length === 0) {
          setLoadError('Could not load products from server. Please refresh in a moment.');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setCategoryAnimKey((prev) => prev + 1);
  }, [activeCategory]);

  const safeProducts = Array.isArray(products) ? products : [];

  let filteredProducts = safeProducts.filter((product) => {
    const matchSearch = !searchTerm.trim() || product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = !searchTerm.trim() ? (activeCategory === 'All' || product.category === activeCategory) : true;
    return matchSearch && matchCategory;
  });

  if (sortBy === 'low-high') {
    filteredProducts = [...filteredProducts].sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortBy === 'high-low') {
    filteredProducts = [...filteredProducts].sort((a, b) => (b.price || 0) - (a.price || 0));
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] pt-20 md:pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="mb-8 md:mb-10">
          <div className="relative max-w-xl mx-auto">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-accent)]" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-12 pr-4 py-3 md:py-4 bg-transparent border border-[var(--color-border)] rounded-[8px] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-border-medium)] focus:shadow-[rgba(0,0,0,0.1)_0px_4px_12px] transition-all"
            />
          </div>
        </div>

        <div className="flex justify-center gap-6 mb-8 overflow-x-auto pb-4 scrollbar-hide">
          {GAMES.map((game) => (
            <button
              key={game}
              onClick={() => setActiveGame(game)}
              className={`text-lg font-gothic transition-all whitespace-nowrap ${
                activeGame === game
                  ? 'text-[var(--color-text-primary)] border-b-2 border-[var(--color-text-primary)] pb-1'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-error)]'
              }`}
            >
              {game}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center items-center gap-3 mb-12">
          {CATEGORIES.map((category) => (
            <button
              key={category}
              onClick={() => setActiveCategory(category)}
              className={`tab-apple ${activeCategory === category ? 'active' : 'inactive'}`}
            >
              {category}
            </button>
          ))}
          <span className="text-[var(--color-text-secondary)] text-sm mx-1">|</span>
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
            className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-pill px-4 py-2 text-sm text-[var(--color-text-primary)] font-gothic focus:outline-none focus:border-[var(--color-border-medium)] cursor-pointer"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id} className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className="text-center mb-6 text-[var(--color-error)] text-sm">{loadError}</div>
        )}

        {loading && filteredProducts.length === 0 ? (
          <div className="products-loader" role="status" aria-live="polite">
            <div className="products-loader-track">
              <span className="products-loader-dog" aria-hidden="true">🐕</span>
            </div>
            <p className="products-loader-text">Loading products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-[var(--color-text-secondary)] font-serif">No products found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
            {filteredProducts.map((product, index) => (
              <div
                key={`${product._id}-${categoryAnimKey}`}
                className="product-reveal"
                style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
              >
                <ProductCard product={product} onOpenDetail={setSelectedProduct} />
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {showProofNotice && (
        <div className="fixed z-[85] top-20 md:top-24 left-3 right-3 md:left-auto md:right-6">
          <div className="relative w-full md:w-[430px] rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[rgba(0,0,0,0.14)_0px_28px_70px]">
            <button
              type="button"
              onClick={closeProofNotice}
              aria-label="Close notice"
              className="btn-press absolute top-3 right-3 p-1 rounded-full text-[var(--color-text-secondary)] hover:text-[var(--color-error)] hover:bg-[var(--color-bg-elevated)]"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
            <div className="p-4 md:p-5 flex items-start gap-3">
              <div className="mt-0.5 w-11 h-11 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex items-center justify-center shrink-0">
                <ShieldCheckIcon className="w-6 h-6 text-[var(--color-accent)]" />
              </div>
              <div className="min-w-0 flex-1 pr-8">
                <h3 className="text-[var(--color-text-primary)] font-gothic text-lg leading-tight">New here? See our receipts</h3>
                <p className="mt-1 text-[var(--color-text-secondary)] font-serif text-sm leading-relaxed">
                  Every delivery we make is photographed and logged. Browse thousands of verified deliveries.
                </p>
                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      closeProofNotice();
                      navigate('/proofs');
                    }}
                    className="btn-press px-4 py-2 rounded-[8px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-sm font-gothic"
                  >
                    View Proof Logs {'>'}
                  </button>
                  <button
                    type="button"
                    onClick={closeProofNotice}
                    className="btn-press text-[var(--color-text-secondary)] hover:text-[var(--color-error)] text-sm font-medium"
                  >
                    Later
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
