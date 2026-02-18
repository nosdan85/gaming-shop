import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import AuthCallback from './pages/AuthCallback';
import { ShopProvider } from './context/ShopContext';
import { AuthProvider } from './context/AuthContext';
import CartModal from './components/CartModal';
import axios from 'axios'; // <-- 1. Import Axios

// API base URL - dùng env hoặc fallback khi chạy trên nosmarket.com
const apiUrl = import.meta.env.VITE_API_URL || 
  (window.location.hostname === 'www.nosmarket.com' ? 'https://gaming-shop-backend.onrender.com' : '');
if (apiUrl) {
  axios.defaults.baseURL = apiUrl;
}

function App() {
  return (
    <AuthProvider>
      <ShopProvider>
        <div className="min-h-screen bg-[#000000] text-[#F5F5F7] font-sans selection:bg-blue-500 selection:text-white">
           <CartModal /> 

           <Routes>
             <Route path="/" element={
               <>
                 <Navbar />
                 <Home />
               </>
             } />

             <Route path="/auth/discord/callback" element={<AuthCallback />} />
             <Route path="/admin" element={<div>Admin Login</div>} />
           </Routes>
        </div>
      </ShopProvider>
    </AuthProvider>
  );
}

export default App;