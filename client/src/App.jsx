import { Routes, Route } from 'react-router-dom';
import axios from 'axios';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import AuthCallback from './pages/AuthCallback';
import PaymentPage from './pages/PaymentPage';
import ProofsPage from './pages/ProofsPage';
import AdminOrders from './pages/AdminOrders';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import { ShopProvider } from './context/ShopContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import CartModal from './components/CartModal';

const configuredApiBaseUrl = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const fallbackApiBaseUrl = String(import.meta.env.VITE_FALLBACK_API_URL || '').trim().replace(/\/+$/, '');
const runtimeHost = typeof window !== 'undefined' ? String(window.location.hostname || '').trim().toLowerCase() : '';
const isNosMarketHost = runtimeHost === 'nosmarket.com' || runtimeHost === 'www.nosmarket.com';
const resolvedApiBaseUrl = configuredApiBaseUrl
  || (isNosMarketHost ? (fallbackApiBaseUrl || 'https://gaming-shop-2.onrender.com') : '');
if (resolvedApiBaseUrl) {
  axios.defaults.baseURL = resolvedApiBaseUrl;
}

const savedToken = localStorage.getItem('token');
if (savedToken) {
  axios.defaults.headers.common.Authorization = `Bearer ${savedToken}`;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ShopProvider>
          <div className="min-h-screen bg-[var(--color-bg-main)] text-[var(--color-text-primary)] font-serif selection:bg-sky-400/30 selection:text-[var(--color-text-primary)]">
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
              <Route
                path="/proofs"
                element={(
                  <>
                    <Navbar />
                    <ProofsPage />
                  </>
                )}
              />
              <Route path="/auth/discord/callback" element={<AuthCallback />} />
              <Route path="/pay" element={<PaymentPage />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin/dashboard" element={<AdminDashboard />} />
              <Route path="/admin/orders.php" element={<AdminDashboard />} />
              <Route path="/admin" element={<AdminOrders />} />
            </Routes>
          </div>
        </ShopProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
