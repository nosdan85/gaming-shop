import { Routes, Route } from 'react-router-dom';
import axios from 'axios';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import AuthCallback from './pages/AuthCallback';
import PaymentPage from './pages/PaymentPage';
import AdminOrders from './pages/AdminOrders';
import { ShopProvider } from './context/ShopContext';
import { AuthProvider } from './context/AuthContext';
import CartModal from './components/CartModal';

const savedToken = localStorage.getItem('token');
if (savedToken) {
  axios.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
}

function App() {
  return (
    <AuthProvider>
      <ShopProvider>
        <div className="min-h-screen bg-[#000000] text-[#F5F5F7] font-sans selection:bg-blue-500 selection:text-white">
          <CartModal />

          <Routes>
            <Route
              path="/"
              element={(
                <>
                  <Navbar />
                  <Home />
                </>
              )}
            />
            <Route path="/auth/discord/callback" element={<AuthCallback />} />
            <Route path="/pay" element={<PaymentPage />} />
            <Route path="/admin" element={<AdminOrders />} />
          </Routes>
        </div>
      </ShopProvider>
    </AuthProvider>
  );
}

export default App;
