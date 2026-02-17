import { useState, useContext } from 'react'; // Thêm useState
import { ShopContext } from '../context/ShopContext';
import ProductCard from '../components/ProductCard';
import ProductDetailModal from '../components/ProductDetailModal'; // Import Modal mới

const Shop = () => {
  const { products } = useContext(ShopContext);
  // State để lưu sản phẩm đang được xem chi tiết
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Hàm mở modal
  const handleOpenDetail = (product) => {
    setSelectedProduct(product);
  };

  // Hàm đóng modal
  const handleCloseDetail = () => {
    setSelectedProduct(null);
  };

  return (
    <div className="page-container ...">
      {/* ... (các phần tiêu đề, filter giữ nguyên) */}

      {/* Grid sản phẩm */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {products.map(product => (
          <ProductCard 
            key={product._id} 
            product={product}
            // Truyền hàm mở modal xuống cho ProductCard
            onOpenDetail={handleOpenDetail}
          />
        ))}
      </div>

      {/* Hiển thị Modal nếu có sản phẩm được chọn */}
      {selectedProduct && (
        <ProductDetailModal 
          product={selectedProduct} 
          onClose={handleCloseDetail} 
        />
      )}
    </div>
  );
};

export default Shop;