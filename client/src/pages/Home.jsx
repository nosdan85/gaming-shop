import { useEffect, useState } from 'react';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

const GAMES = ['Sailor Piece'];
const CATEGORIES = ['All', 'Chest', 'Reroll', 'Shard', 'Seal', 'Relic'];
const VALID_CACHE_CATEGORIES = new Set(CATEGORIES.filter((category) => category !== 'All'));
const SORT_OPTIONS = [
  { id: 'none', label: 'Default' },
  { id: 'low-high', label: 'Price: Low -> High' },
  { id: 'high-low', label: 'Price: High -> Low' },
];

const CACHE_KEY = 'productsCache';
const DISCORD_INVITE_URL = import.meta.env.VITE_DISCORD_INVITE_URL || 'https://discord.gg/T4A4ANp9';
const normalizeProducts = (value) => {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => VALID_CACHE_CATEGORIES.has(item?.category));
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
  const [products, setProducts] = useState(() => getCachedProducts());
  const [activeGame, setActiveGame] = useState('Sailor Piece');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(() => getCachedProducts().length === 0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('none');

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
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: nextProducts, ts: Date.now() }));
        } catch (_) {
          // Ignore cache write errors.
        }
      })
      .catch(() => {
        // Product API error is handled by empty state UI.
      })
      .finally(() => setLoading(false));
  }, []);

  let filteredProducts = products.filter((p) => {
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
      <div className="max-w-7xl mx-auto px-4 mb-4 md:mb-10">
        <div className="bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg md:rounded-xl p-3 md:p-4 flex items-center justify-between shadow-lg sticky top-16 z-[45] md:top-20 md:z-[45]">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
            </span>
            <p className="text-sm font-medium text-gray-200">
              We moved to a new Discord Server!
            </p>
          </div>
          <a href={DISCORD_INVITE_URL} target="_blank" rel="noreferrer" className="text-sm text-[#2997ff] font-bold hover:underline">
            Join Now &rarr;
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
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

        <p className="text-center text-xs text-[#9a9aa0] -mt-4 mb-8">
          If one item costs at least $10, it qualifies for bulk pricing.
        </p>

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

        {loading && filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-[#86868b]">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20 text-[#86868b]">No products found.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredProducts.map((p) => (
              <ProductCard
                key={p._id}
                product={p}
                onOpenDetail={setSelectedProduct}
              />
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
    </div>
  );
};

export default Home;
