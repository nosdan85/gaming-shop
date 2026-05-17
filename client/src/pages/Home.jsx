import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { MagnifyingGlassIcon, ShieldCheckIcon, XMarkIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { getProductImageUrl } from '../utils/productImage';

const CACHE_KEY = 'productsCache';
const ORDER_PROOF_NOTICE_SEEN_KEY = 'orderProofNoticeSeenV1';
const CATEGORIES = ['All', 'Chest', 'Reroll', 'Shard', 'Seal', 'Relic', 'Sets', 'Combo'];
const KNOWN_CATEGORY_LOOKUP = new Map(
  CATEGORIES.filter((c) => c !== 'All').map((c) => [c.toLowerCase(), c])
);
const SORT_OPTIONS = [
  { id: 'none', label: 'Default' },
  { id: 'low-high', label: 'Price: Low -> High' },
  { id: 'high-low', label: 'Price: High -> Low' },
];

const shouldShowProofNoticeOnLoad = () => {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(ORDER_PROOF_NOTICE_SEEN_KEY) !== '1'; } catch { return true; }
};

const normalizeCategory = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return 'Other';
  return KNOWN_CATEGORY_LOOKUP.get(raw.toLowerCase()) || raw;
};

const normalizeProducts = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((item) => ({
    ...item,
    category: normalizeCategory(item.category),
  }));
};

// ─── Ticker Component ──────────────────────────────────────────────────────────
const Ticker = ({ items }) => {
  if (!items || items.length === 0) return null;
  const doubled = [...items, ...items]; // for seamless loop
  return (
    <div className="w-full overflow-hidden bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)] py-2">
      <div className="ticker-track flex gap-0 whitespace-nowrap w-max">
        {doubled.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-2 px-6 text-sm text-[var(--color-text-secondary)] font-serif">
            <span className="text-[var(--color-accent)] font-gothic font-medium">{item.username}</span>
            <span>just bought</span>
            <span className="text-[var(--color-text-primary)]">{item.productName}</span>
            <span className="text-[var(--color-border)] mx-2">|</span>
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Banner + Best Seller Row Component ────────────────────────────────────────
// Banner: 4/6 width, auto height | Best Seller: 2/6 width, same height as banner
const BannerAndBestSellerRow = ({ banners, bestSeller, allProducts, bannerHeight, onBannerHeightChange }) => {
  const [current, setCurrent] = useState(0);
  const timerRef = useRef(null);

  const nextBanner = useCallback(() => {
    setCurrent((prev) => (prev + 1) % banners.length);
  }, [banners.length]);

  const prevBanner = () => setCurrent((prev) => (prev - 1 + banners.length) % banners.length);

  useEffect(() => {
    if (!banners || banners.length <= 1) return;
    timerRef.current = setInterval(nextBanner, 4000);
    return () => clearInterval(timerRef.current);
  }, [nextBanner, banners]);

  const product = bestSeller ? allProducts.find((p) => String(p._id) === String(bestSeller)) : null;
  const hasContent = (banners && banners.length > 0) || product;

  if (!hasContent) return null;

  const currentBanner = banners?.[current];
  const currentBannerSrc = currentBanner
    ? (currentBanner.startsWith('http') || currentBanner.startsWith('/')
        ? currentBanner
        : `/api/banners/${encodeURIComponent(currentBanner)}`)
    : null;

  return (
    <div className="flex gap-3 mb-10 items-start">
      {/* Banner — 4/6 width */}
      <div className="flex-[4] w-full">
        <div
          className="relative w-full rounded-[12px] overflow-hidden bg-[var(--color-bg-secondary)] border border-[var(--color-border)]"
          style={{ height: bannerHeight }}
        >
          {currentBannerSrc ? (
            <img
              src={currentBannerSrc}
              alt={`Banner ${current + 1}`}
              className="w-full h-full object-contain"
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth && el.naturalHeight) {
                  const containerW = el.parentElement?.clientWidth || 800;
                  const h = Math.round(containerW * el.naturalHeight / el.naturalWidth);
                  onBannerHeightChange(Math.min(Math.max(h, 180), 440));
                }
              }}
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--color-text-secondary)] text-sm">No banners</div>
          )}
          {banners?.length > 1 && (
            <>
              <button
                onClick={prevBanner}
                className="btn-press absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-all"
              >
                <ChevronLeftIcon className="w-5 h-5" />
              </button>
              <button
                onClick={nextBanner}
                className="btn-press absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-all"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { clearInterval(timerRef.current); setCurrent(i); }}
                    className={`h-1.5 rounded-full transition-all ${i === current ? 'bg-white w-5' : 'bg-white/50 w-1.5'}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Best Seller — 2/6 width, same height as banner */}
      <div className="flex-[2] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-gothic text-[var(--color-text-primary)] uppercase tracking-wider">Best Seller</h3>
          {product && (
            <div className="flex gap-1">
              <button
                onClick={prevBanner}
                className="btn-press w-8 h-8 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] flex items-center justify-center transition-all"
                title="Previous"
              >
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <button
                onClick={nextBanner}
                className="btn-press w-8 h-8 rounded-full bg-[var(--color-bg-secondary)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] flex items-center justify-center transition-all"
                title="Next"
              >
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {product ? (
          <div
            className="flex-1 bg-[var(--color-bg-secondary)] rounded-[12px] border border-[var(--color-border)] overflow-hidden"
            style={{ minHeight: bannerHeight }}
          >
            <ProductCard product={product} onOpenDetail={() => {}} />
          </div>
        ) : (
          <div
            className="flex-1 flex items-center justify-center bg-[var(--color-bg-secondary)] rounded-[12px] border border-[var(--color-border)] text-[var(--color-text-secondary)] text-sm"
            style={{ minHeight: bannerHeight }}
          >
            No best seller set
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Game Section Component ────────────────────────────────────────────────────
const GameSection = ({ game, products, onViewAll, onOpenProduct }) => {
  const preview = products.slice(0, 6);
  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">{game.name}</h2>
        <button
          onClick={onViewAll}
          className="btn-press text-sm text-[var(--color-accent)] hover:text-[var(--color-accent-hover)] font-gothic transition-colors"
        >
          View All →
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 md:gap-4">
        {preview.map((product) => (
          <ProductCard key={product._id} product={product} onOpenDetail={onOpenProduct} />
        ))}
      </div>
    </div>
  );
};

// ─── Main Home Component ────────────────────────────────────────────────────────
const Home = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [games, setGames] = useState([]);
  const [config, setConfig] = useState({ banners: [], bestSellerIds: [], featuredProductIds: [] });
  const [recentPurchases, setRecentPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showProofNotice, setShowProofNotice] = useState(shouldShowProofNoticeOnLoad);

  // Filter state
  const [activeGameId, setActiveGameId] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [categoryAnimKey, setCategoryAnimKey] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('none');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'section'
  // Shared banner height so banner and best seller panel stay aligned
  const [bannerHeight, setBannerHeight] = useState(280);

  const closeProofNotice = () => {
    setShowProofNotice(false);
    try { localStorage.setItem(ORDER_PROOF_NOTICE_SEEN_KEY, '1'); } catch { /* ignore */ }
  };

  // Fetch all shop data in parallel
  useEffect(() => {
    setLoading(true);
    Promise.all([
      axios.get('/api/shop/products').catch(() => null),
      axios.get('/api/shop/games').catch(() => null),
      axios.get('/api/shop/config').catch(() => null),
      axios.get('/api/shop/recent-purchases?limit=30').catch(() => null),
    ])
      .then(([productsRes, gamesRes, configRes, tickerRes]) => {
        const prods = normalizeProducts(productsRes?.data);
        setProducts(prods);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data: prods, ts: Date.now() })); } catch { /* ignore */ }

        if (gamesRes?.data) {
          setGames(gamesRes.data);
          if (Array.isArray(gamesRes.data) && gamesRes.data.length > 0) {
            setActiveGameId(gamesRes.data[0]._id);
          }
        }
        if (configRes?.data) setConfig(configRes.data);
        if (tickerRes?.data) setRecentPurchases(Array.isArray(tickerRes.data) ? tickerRes.data : []);
        setLoadError('');
      })
      .catch(() => setLoadError('Could not load shop data. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { setCategoryAnimKey((p) => p + 1); }, [activeCategory]);

  // Filtered products
  const safeProducts = Array.isArray(products) ? products : [];

  let filteredProducts = safeProducts.filter((product) => {
    const matchGame = !activeGameId || product.gameId === activeGameId;
    const matchSearch = !searchTerm.trim() || product.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCategory = !searchTerm.trim() ? (activeCategory === 'All' || product.category === activeCategory) : true;
    return matchGame && matchSearch && matchCategory;
  });

  if (sortBy === 'low-high') filteredProducts = [...filteredProducts].sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sortBy === 'high-low') filteredProducts = [...filteredProducts].sort((a, b) => (b.price || 0) - (a.price || 0));

  // Best sellers — single product (first one in the list)
  const bestSeller = config.bestSellerIds?.[0] || null;

  // Products grouped by game for section view
  const productsByGame = games.reduce((acc, game) => {
    acc[game._id] = safeProducts.filter((p) => String(p.gameId) === String(game._id));
    return acc;
  }, {});

  const handleViewAll = (gameId) => {
    setActiveGameId(gameId);
    setViewMode('grid');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProduct = (product) => {
    if (product) setSelectedProduct(product);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] pt-20 md:pt-24 pb-32">
      <div className="max-w-7xl mx-auto px-3 sm:px-4">

        {/* ── Recent purchases ticker ── */}
        {!loading && <Ticker items={recentPurchases} />}

        {/* ── Search bar ── */}
        <div className="relative max-w-xl mx-auto mb-6">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-accent)]" />
          <input
            type="text"
            placeholder="Search products..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)] transition-all"
          />
        </div>

        {/* ── Game selector ── */}
        {games.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 mb-6 scrollbar-hide">
            {games.map((game) => (
              <button
                key={game._id}
                onClick={() => { setActiveGameId(game._id); setViewMode('grid'); }}
                className={`btn-press shrink-0 px-4 py-2 rounded-full text-sm font-gothic border transition-all ${
                  activeGameId === game._id
                    ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                    : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                }`}
              >
                {game.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Loading state ── */}
        {loadError && (
          <div className="text-center mb-6 text-[var(--color-error)] text-sm">{loadError}</div>
        )}

        {loading ? (
          <div className="products-loader" role="status">
            <div className="products-loader-track">
              <span className="products-loader-dog">🐕</span>
            </div>
            <p className="products-loader-text">Loading products...</p>
          </div>
        ) : (
          <>
            {/* ── Banner + Best Seller row ── */}
            <BannerAndBestSellerRow
              banners={config.banners}
              bestSeller={bestSeller}
              allProducts={safeProducts}
              bannerHeight={bannerHeight}
              onBannerHeightChange={setBannerHeight}
            />

            {/* ── Category filters + sort ── */}
            <div className="flex flex-wrap justify-center items-center gap-2 mb-8">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`btn-press px-3 py-1.5 rounded-full text-xs font-gothic border transition-all ${
                    activeCategory === cat
                      ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                      : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                  }`}
                >
                  {cat}
                </button>
              ))}
              <span className="text-[var(--color-border)] mx-1">|</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-full px-3 py-1.5 text-xs text-[var(--color-text-primary)] font-gothic cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              {games.length > 0 && (
                <>
                  <span className="text-[var(--color-border)] mx-1">|</span>
                  <button
                    onClick={() => setViewMode('section')}
                    className={`btn-press px-3 py-1.5 rounded-full text-xs font-gothic border transition-all ${
                      viewMode === 'section'
                        ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                        : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                    }`}
                  >
                    Browse by Game
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`btn-press px-3 py-1.5 rounded-full text-xs font-gothic border transition-all ${
                      viewMode === 'grid'
                        ? 'bg-[var(--color-accent)] text-white border-[var(--color-accent)]'
                        : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]'
                    }`}
                  >
                    All Items
                  </button>
                </>
              )}
            </div>

            {/* ── Section view: products grouped by game ── */}
            {viewMode === 'section' && games.length > 0 && (
              <>
                {games
                  .filter((g) => productsByGame[g._id]?.length > 0)
                  .map((game) => (
                    <GameSection
                      key={game._id}
                      game={game}
                      products={productsByGame[game._id]}
                      onViewAll={() => handleViewAll(game._id)}
                      onOpenProduct={openProduct}
                    />
                  ))}
              </>
            )}

            {/* ── Grid view: filtered product list ── */}
            {viewMode === 'grid' && (
              <>
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-20 text-[var(--color-text-secondary)] font-serif">No products found.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-6">
                    {filteredProducts.map((product, index) => (
                      <div
                        key={`${product._id}-${categoryAnimKey}`}
                        className="product-reveal"
                        style={{ animationDelay: `${Math.min(index, 11) * 45}ms` }}
                      >
                        <ProductCard product={product} onOpenDetail={openProduct} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="max-w-7xl mx-auto px-3 sm:px-4 mt-16 pt-6 border-t border-[var(--color-border)]">
        <p className="text-xs md:text-sm text-[var(--color-text-secondary)] leading-relaxed text-center">
          This website only provides a marketplace for user-to-user digital item transactions and does not operate, publish, host, or distribute any online game.
        </p>
      </footer>

      {/* ── Product detail modal ── */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* ── Proof notice ── */}
      {showProofNotice && (
        <div className="fixed z-[85] top-20 md:top-24 left-3 right-3 md:left-auto md:right-6">
          <div className="relative w-full md:w-[430px] rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-[rgba(17,24,39,0.1)_0px_20px_52px]">
            <button
              type="button"
              onClick={closeProofNotice}
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
                    onClick={() => { closeProofNotice(); navigate('/proofs'); }}
                    className="btn-press px-4 py-2 rounded-[8px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-sm font-gothic"
                  >
                    View Proof Logs &gt;
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
