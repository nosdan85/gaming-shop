import { useState, useContext } from 'react';
import axios from 'axios';
import { ShopContext } from '../context/ShopContext';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const DiscordModal = ({ isOpen, onClose }) => {
  const [discordId, setDiscordId] = useState('');
  const [discordUsername, setDiscordUsername] = useState('');
  const { loginDiscord } = useContext(ShopContext);
  const [loading, setLoading] = useState(false);

  const handleLink = async () => {
    if(!discordId || !discordUsername) return alert("Please fill all fields");
    setLoading(true);
    try {
      // Gọi API Link
      const res = await axios.post('http://localhost:5000/api/shop/link-discord', {
        discordId,
        discordUsername
      });
      loginDiscord(res.data);
      onClose();
    } catch (err) {
      alert("Error linking discord. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="bg-[#0F172A] p-8 rounded-2xl border border-blue-500/30 w-full max-w-md shadow-2xl relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500"></div>
        
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#5865F2] rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/50">
             <img src="https://assets-global.website-files.com/6257adef93867e56f84d3092/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" className="w-10 h-10" alt="Discord" />
          </div>
          <h2 className="text-2xl font-bold text-white">Link Discord Account</h2>
          <p className="text-gray-400 text-sm mt-2">
            We need your Discord to create a <span className="text-blue-400 font-bold">Support Ticket</span> automatically after purchase.
          </p>
        </div>
        
        <div className="space-y-4">
            <div>
                <label className="text-xs text-gray-500 uppercase font-bold ml-1">Discord ID</label>
                <input 
                  className="w-full bg-[#050B1E] border border-gray-700 p-3 rounded-lg text-white focus:border-blue-500 focus:outline-none transition"
                  placeholder="e.g. 739361..."
                  value={discordId}
                  onChange={e => setDiscordId(e.target.value)}
                />
                <p className="text-[10px] text-gray-500 mt-1">*Turn on Developer Mode on Discord to copy ID.</p>
            </div>
            
            <div>
                <label className="text-xs text-gray-500 uppercase font-bold ml-1">Username</label>
                <input 
                  className="w-full bg-[#050B1E] border border-gray-700 p-3 rounded-lg text-white focus:border-blue-500 focus:outline-none transition"
                  placeholder="e.g. user#1234 or user"
                  value={discordUsername}
                  onChange={e => setDiscordUsername(e.target.value)}
                />
            </div>
        </div>
        
        <div className="mt-8 flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 font-bold transition">
              Cancel
            </button>
            <button onClick={handleLink} disabled={loading} className="flex-1 py-3 btn-primary shadow-lg shadow-blue-600/30">
              {loading ? 'Linking...' : 'Link Now'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default DiscordModal;