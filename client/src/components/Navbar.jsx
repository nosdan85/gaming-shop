import { useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import { ShoppingBagIcon, Bars3Icon, XMarkIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../context/ThemeContext';
import axios from 'axios';

const PROOFS_EXTERNAL_URL = String(import.meta.env.VITE_PROOFS_URL || '').trim();
const normalizeExternalUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:\/\/|discord:\/\/)/i.test(raw)) return raw;
  if (/^(discord\.gg|www\.discord\.gg|discord\.com\/invite|discordapp\.com\/invite)\//i.test(raw)) {
    return `https://${raw}`;
  }
  if (/^[A-Za-z0-9_-]{2,64}$/.test(raw)) return `https://discord.gg/${raw}`;
  return `https://${raw}`;
};
const isDiscordInviteUrl = (value) => /discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\//i.test(String(value || '').toLowerCase());
const DISCORD_INVITE_URL = normalizeExternalUrl(import.meta.env.VITE_DISCORD_INVITE_URL || import.meta.env.VITE_DISCORD_SERVER_INVITE);
const DISCORD_VOUCH_URL = normalizeExternalUrl(import.meta.env.VITE_DISCORD_VOUCH_URL);
const DISCORD_DEFAULT_INVITE_URL = normalizeExternalUrl(import.meta.env.VITE_DISCORD_DEFAULT_INVITE_URL || 'https://discord.gg/nosmarket');
const RESOLVED_DISCORD_URL = isDiscordInviteUrl(DISCORD_INVITE_URL)
  ? DISCORD_INVITE_URL
  : (isDiscordInviteUrl(DISCORD_VOUCH_URL) ? DISCORD_VOUCH_URL : DISCORD_DEFAULT_INVITE_URL);
const SITE_LOGO_PATH = String(import.meta.env.VITE_SITE_LOGO || '/site-logo.png').trim() || '/site-logo.png';

const NavItem = ({ label, href, isExternal = false, onClick }) => {
  const className = 'text-[var(--color-text-secondary)] hover:text-[var(--color-error)] transition-colors duration-150 font-gothic text-sm tracking-normal font-medium';

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={onClick}
        className={className}
      >
        {label}
      </a>
    );
  }

  return (
    <Link to={href} onClick={onClick} className={className}>
      {label}
    </Link>
  );
};

const Navbar = () => {
  const { cart, setIsCartOpen, user } = useContext(ShopContext);
  const { isDark, toggleTheme } = useTheme();
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
    if (RESOLVED_DISCORD_URL) {
      links.push({ label: 'Discord', href: RESOLVED_DISCORD_URL, isExternal: true });
    }
    if (isOwner) {
      links.push({ label: 'Admin', href: '/admin', isExternal: false });
    }
    return links;
  }, [isOwner, user?.discordId]);

  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-[var(--color-bg-main)] backdrop-blur-md border-b border-[var(--color-border)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          <Link to="/" className="flex-shrink-0 flex items-center">
            <img
              src={SITE_LOGO_PATH}
              alt="NOS Logo"
              className="h-12 md:h-[4.2rem] w-auto object-contain"
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
              className="relative p-2 text-[var(--color-text-primary)] hover:text-[var(--color-accent)] transition-colors"
            >
              <ShoppingBagIcon className="w-6 h-6" />
              {totalItems > 0 && (
                <span className="absolute top-0 right-0 bg-[var(--color-accent)] text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full shadow-sm">
                  {totalItems}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="btn-press p-2 rounded-pill bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-text-primary)] hover:text-[var(--color-error)] transition-colors"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>

            <button
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="md:hidden p-2 text-[var(--color-text-primary)] hover:text-[var(--color-error)]"
            >
              {isMenuOpen ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-[var(--color-bg-main)] border-t border-[var(--color-border)]">
          <div className="px-4 pt-2 pb-4 space-y-1">
            {navLinks.map((item) => (
              <div
                key={`mobile-${item.label}-${item.href}`}
                className="block px-3 py-2 rounded-md hover:bg-[var(--color-bg-elevated)]"
              >
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
