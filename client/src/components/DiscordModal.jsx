import { UserCircleIcon } from '@heroicons/react/24/solid';

const getOAuthUrl = () => {
  const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '';
  const redirectUri = `${window.location.origin}/auth/discord/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
};

const DiscordModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const handleLink = () => {
    localStorage.setItem('discordLinkMethod', 'web');
    window.location.href = getOAuthUrl();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-[#0F172A] p-8 rounded-2xl border border-blue-500/30 w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-bold text-white text-center">Link Discord Account</h2>
        <p className="text-gray-400 text-sm mt-3 text-center">
          Login with Discord to continue checkout and create tickets automatically.
        </p>

        <div className="mt-8 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 font-bold transition">
            Cancel
          </button>
          <button onClick={handleLink} className="flex-1 py-3 bg-[#5865F2] hover:bg-[#4752C4] rounded-lg text-white font-bold transition flex items-center justify-center gap-2">
            <UserCircleIcon className="w-5 h-5" />
            Link Discord
          </button>
        </div>
      </div>
    </div>
  );
};

export default DiscordModal;
