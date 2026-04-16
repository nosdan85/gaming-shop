import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

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
const DISCORD_VOUCH_URL = String(import.meta.env.VITE_DISCORD_VOUCH_URL || '').trim();
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
    } catch (_) {
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
        } catch (_) {
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

  let filteredProducts = safeProducts.filter((p) => {
    const matchSearch = !searchTerm.trim() || p.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = !searchTerm.trim() ? (activeCategory === 'All' || p.category === activeCategory) : true;
    return matchSearch && matchCategory;
  });

  if (sortBy === 'low-high') {
    filteredProducts = [...filteredProducts].sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortBy === 'high-low') {
    filteredProducts = [...filteredProducts].sort((a, b) => (b.price || 0) - (a.price || 0));
  }

  return (
    <div className="min-h-screen bg-black pt-20 md:pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">
        <div className="mb-8 md:mb-10">
          <div className="relative max-w-xl mx-auto">
            <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-accent)]" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 md:py-4 bg-[var(--color-bg-secondary)] border border-[var(--color-accent)]/30 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-all shadow-lg shadow-cyan-500/5"
            />
          </div>
        </div>

        <div className="flex justify-center gap-6 mb-8 overflow-x-auto pb-4 scrollbar-hide">
          {GAMES.map((game) => (
            <button
              key={game}
              onClick={() => setActiveGame(game)}
              className={`text-lg font-semibold transition-all whitespace-nowrap ${
                activeGame === game ? 'text-white border-b-2 border-white pb-1' : 'text-[#86868b] hover:text-white'
              }`}
            >
              {game}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center items-center gap-3 mb-12">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`tab-apple ${activeCategory === cat ? 'active' : 'inactive'}`}
            >
              {cat}
            </button>
          ))}
          <span className="text-gray-500 text-sm mx-1">|</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[var(--color-bg-secondary)] border border-white/10 rounded-full px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} className="bg-[#1c1c1e]">{opt.label}</option>
            ))}
          </select>
        </div>

        {loadError && (
          <div className="text-center mb-6 text-red-400 text-sm">{loadError}</div>
        )}

        {loading && filteredProducts.length === 0 ? (
          <div className="products-loader" role="status" aria-live="polite">
            <div className="products-loader-track">
              <span className="products-loader-dog" aria-hidden="true">🐕</span>
            </div>
            <p className="products-loader-text">Loading products...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-[#86868b]">No products found.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
            {filteredProducts.map((p, index) => (
              <div
                key={`${p._id}-${categoryAnimKey}`}
                className="product-reveal"
                style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
              >
                <ProductCard
                  product={p}
                  onOpenDetail={setSelectedProduct}
                />
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
        <div className="fixed inset-0 z-[85] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl border border-[#27344f] bg-[#0f1422] p-5 md:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.45)]">
            <h3 className="text-xl md:text-2xl font-black text-white mb-2"><strong>Order Proof</strong></h3>
            <p className="text-sm md:text-base text-gray-300 leading-relaxed">
              All completed orders are logged and supported with photo proof. Feel free to check our delivery history for clear and authentic records.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  closeProofNotice();
                  navigate('/proofs');
                }}
                className="btn-press px-4 py-2 rounded-xl bg-[#11b7d6] hover:bg-[#0ea2be] text-white text-sm font-semibold"
              >
                Open Proofs
              </button>
              {DISCORD_VOUCH_URL && (
                <a
                  href={DISCORD_VOUCH_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-press px-4 py-2 rounded-xl bg-[#223150] hover:bg-[#2c3e64] text-white text-sm font-semibold"
                >
                  Discord Vouch
                </a>
              )}
              <button
                type="button"
                onClick={closeProofNotice}
                className="btn-press px-4 py-2 rounded-xl bg-[#1a2030] hover:bg-[#252f45] text-gray-200 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Home;
