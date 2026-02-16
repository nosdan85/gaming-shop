import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import AuthCallback from './pages/AuthCallback';
import { ShopProvider } from './context/ShopContext';
import { AuthProvider } from './context/AuthContext';
import CartModal from './components/CartModal'; // Import đúng

function App() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <AuthProvider>
      <ShopProvider>
        <div className="min-h-screen bg-[#050B1E] text-white font-sans selection:bg-purple-500 selection:text-white">
           {/* Đặt CartModal ở đây để nó có thể đè lên mọi trang (nếu muốn) */}
           <CartModal /> 

           <Routes>
             <Route path="/" element={
               <>
                 <Navbar onSearch={setSearchTerm}/>
                 <Home searchTerm={searchTerm}/>
                 {/* Đã xóa <CartSidebar /> cũ */}
               </>
             } />

             {/* Route xử lý login Discord */}
             <Route path="/auth/discord/callback" element={<AuthCallback />} />
             
             {/* Route Admin */}
             <Route path="/admin" element={<div>Admin Login</div>} />
           </Routes>
        </div>
      </ShopProvider>
    </AuthProvider>
  );
}

export default App;