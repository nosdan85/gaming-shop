import { useEffect, useState } from 'react';
import axios from 'axios';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal';

// Chỉ giữ lại 1 game như yêu cầu
const GAMES = ["Blox Fruits"];
const CATEGORIES = ["All", "Bundles", "Best Seller", "Permanent Fruits", "Gamepass"];

const CACHE_KEY = 'productsCache';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 phút

const Home = ({ searchTerm }) => {
  const [products, setProducts] = useState([]);
  const [activeGame, setActiveGame] = useState("Blox Fruits");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hiện cache ngay nếu còn hiệu lực -> load nhanh khi vào lại
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const { data, ts } = JSON.parse(raw);
        if (data?.length && Date.now() - ts < CACHE_TTL_MS) {
          setProducts(data);
        }
      }
    } catch (_) {}

    setLoading(true);
    axios.get('/api/shop/products')
      .then(res => {
        setProducts(res.data);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: res.data, ts: Date.now() }));
        } catch (_) {}
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredProducts = products.filter(p => {
    // Logic lọc: category + search (Game tạm thời chưa lọc vì DB chưa có field này)
    const matchCategory = activeCategory === "All" || p.category === activeCategory;
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="min-h-screen bg-black pt-20 md:pt-24 pb-32">
      
      {/* 1. THANH THÔNG BÁO SERVER MỚI - luôn hiện dưới navbar, mobile: sticky ngay dưới navbar */}
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
            {/* THAY LINK DISCORD MỚI CỦA BẠN VÀO DƯỚI ĐÂY */}
            <a href="https://discord.gg/T4A4ANp9" target="_blank" rel="noreferrer" className="text-sm text-[#2997ff] font-bold hover:underline">
                Join Now &rarr;
            </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {/* Headline */}
        <div className="text-center mb-12">
           <h1 className="text-4xl md:text-6xl font-bold text-white mb-2 tracking-tight">Store.</h1>
           <p className="text-lg text-[#86868b]">The best way to buy the items you love.</p>
        </div>

        {/* 2. CHỌN GAME (Mới) */}
        <div className="flex justify-center gap-6 mb-8 overflow-x-auto pb-4 scrollbar-hide">
            {GAMES.map(game => (
                <button 
                   key={game}
                   onClick={() => setActiveGame(game)}
                   className={`text-lg font-semibold transition-all whitespace-nowrap ${
                       activeGame === game 
                       ? 'text-white border-b-2 border-white pb-1' 
                       : 'text-[#86868b] hover:text-white'
                   }`}
                >
                   {game}
                </button>
            ))}
        </div>

        {/* 3. CHỌN DANH MỤC */}
        <div className="flex flex-wrap justify-center gap-3 mb-12">
          {CATEGORIES.map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`tab-apple ${activeCategory === cat ? 'active' : 'inactive'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 4. LƯỚI SẢN PHẨM (2 Cột Mobile / 4 Cột PC) */}
        {loading && filteredProducts.length === 0 ? (
           <div className="text-center py-20 text-[#86868b]">Loading products...</div>
        ) : filteredProducts.length === 0 ? (
           <div className="text-center py-20 text-[#86868b]">No products found.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filteredProducts.map(p => (
              <ProductCard 
                key={p._id} 
                product={p}
                onOpenDetail={setSelectedProduct}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal chi tiết sản phẩm (giữa màn hình) */}
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