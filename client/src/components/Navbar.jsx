import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import { ShoppingBagIcon, Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';

const PROOFS_EXTERNAL_URL = String(import.meta.env.VITE_PROOFS_URL || '').trim();
const DISCORD_INVITE_URL = String(import.meta.env.VITE_DISCORD_INVITE_URL || '').trim();
const DISCORD_VOUCH_URL = String(import.meta.env.VITE_DISCORD_VOUCH_URL || '').trim();
const RESOLVED_DISCORD_URL = DISCORD_INVITE_URL || DISCORD_VOUCH_URL;
const SITE_LOGO_PATH = String(import.meta.env.VITE_SITE_LOGO || '/site-logo.png').trim() || '/site-logo.png';

const NavItem = ({ label, href, isExternal = false, onClick }) => {
  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
        className="text-gray-300 hover:text-white transition-colors font-medium"
      >
        {label}
      </a>
    );
  }

  return (
    <Link to={href} onClick={onClick} className="text-gray-300 hover:text-white transition-colors font-medium">
      {label}
    </Link>
  );
};

const Navbar = () => {
  const { cart, setIsCartOpen, user } = useContext(ShopContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user?.discordId) {
      setIsOwner(false);
      return;
    }
    axios.get('/api/shop/check-owner')
      .then((res) => setIsOwner(res.data?.isOwner === true))
      .catch(() => setIsOwner(false));
  }, [user?.discordId]);

  const totalItems = cart.reduce((acc, item) => acc + item.quantity, 0);

  const navLinks = useMemo(() => {
    const links = [];
    if (PROOFS_EXTERNAL_URL) {
      links.push({ label: 'Proofs', href: PROOFS_EXTERNAL_URL, isExternal: true });
    } else {
      links.push({ label: 'Proofs', href: '/proofs', isExternal: false });
    }
    if (user?.discordId && RESOLVED_DISCORD_URL) {
      links.push({ label: 'Discord', href: RESOLVED_DISCORD_URL, isExternal: true });
    }
    if (isOwner) {
      links.push({ label: 'Admin', href: '/admin', isExternal: false });
    }
    return links;
  }, [isOwner, user?.discordId]);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex-shrink-0 flex items-center">
            <img
              src={SITE_LOGO_PATH}
              alt="NOS Logo"
              className="h-10 md:h-14 w-auto object-contain"
              onError={(event) => { event.currentTarget.src = '/logo.png'; }}
            />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((item) => (
              <NavItem key={`${item.label}-${item.href}`} {...item} />
            ))}
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-gray-300 hover:text-white transition-colors"
            >
              <ShoppingBagIcon className="w-6 h-6" />
              {totalItems > 0 && (
                <span className="absolute top-0 right-0 bg-[var(--color-accent)] text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-lg shadow-cyan-500/40">
                  {totalItems}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="md:hidden p-2 text-gray-300 hover:text-white"
            >
              {isMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-[#09090b] border-t border-white/10">
          <div className="px-4 pt-2 pb-4 space-y-1">
            {navLinks.map((item) => (
              <div key={`mobile-${item.label}-${item.href}`} className="block px-3 py-2 text-base font-medium text-gray-300 hover:text-white hover:bg-white/5 rounded-md">
                <NavItem {...item} onClick={() => setIsMenuOpen(false)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
