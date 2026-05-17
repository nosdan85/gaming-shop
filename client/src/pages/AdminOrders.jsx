import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { ShopContext } from '../context/ShopContext';
import { getProductImageUrl } from '../utils/productImage';
import { COUNTRY_TIMEZONES } from '../utils/timezones';

const formatDate = (value) => {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch {
    return '-';
  }
};

const statusClass = (status) => {
  if (status === 'paid' || status === 'completed') {
    return 'text-[var(--color-success)] bg-[rgba(31,138,101,0.14)] border-[rgba(31,138,101,0.35)]';
  }
  if (status === 'rejected' || status === 'cancelled') {
    return 'text-[var(--color-error)] bg-[rgba(207,45,86,0.14)] border-[rgba(207,45,86,0.35)]';
  }
  return 'text-[var(--color-gold)] bg-[rgba(204,150,64,0.14)] border-[rgba(204,150,64,0.35)]';
};

const normalizeSearch = (value) => String(value || '').trim().toLowerCase();

const CATEGORIES = ['Chest', 'Reroll', 'Sets', 'Other'];

const AdminOrders = () => {
  const { user } = useContext(ShopContext);
  const [orders, setOrders] = useState([]);
  const [walletAdmin, setWalletAdmin] = useState({ pendingTopups: [], transactions: [] });
  const [confirmedOrders, setConfirmedOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('orders');

  // ── Products state ────────────────────────────────────────────────────────
  const [products, setProducts] = useState([]);
  const [productImages, setProductImages] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({
    name: '', price: '', originalPriceString: '', bulkPrice: '', bulkPriceString: '',
    image: '', desc: '', category: 'Chest'
  });
  const [productFormErrors, setProductFormErrors] = useState({});
  const [productUploading, setProductUploading] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);

  // ── Games state ────────────────────────────────────────────────────────────
  const [games, setGames] = useState([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  const [gameForm, setGameForm] = useState({ name: '', slug: '', image: '', active: true });
  const [gameFormOpen, setGameFormOpen] = useState(false);
  const [gameFormErrors, setGameFormErrors] = useState({});
  const [gameUploading, setGameUploading] = useState(false);

  // ── Homepage config state ──────────────────────────────────────────────────
  const [homepageConfig, setHomepageConfig] = useState({ banners: [], bestSellerIds: [] });
  const [configLoading, setConfigLoading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bestSellerOptions, setBestSellerOptions] = useState([]);

  // ── Delivery slots state ───────────────────────────────────────────────────
  const [slotOwnerTimezone, setSlotOwnerTimezone] = useState('Asia/Ho_Chi_Minh');
  const [slotDate, setSlotDate] = useState('');
  const [slotRanges, setSlotRanges] = useState([{ startTime: '', endTime: '', note: '' }]);
  const [slotNote, setSlotNote] = useState('');
  const [slotsManaging, setSlotsManaging] = useState([]);
  const [slotsManagingLoading, setSlotsManagingLoading] = useState(false);
  const [slotTabFilter, setSlotTabFilter] = useState('active');

  const localUser = useMemo(() => {
    if (user?.discordId) return user;
    try {
      const stored = localStorage.getItem('discordUser') || localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }, [user]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes, walletRes, confirmedRes] = await Promise.all([
        axios.get('/api/shop/orders'),
        axios.get('/api/shop/wallet/admin'),
        axios.get('/api/shop/owner/confirmed-orders')
      ]);
      setOrders(Array.isArray(ordersRes.data) ? ordersRes.data : []);
      setConfirmedOrders(Array.isArray(confirmedRes.data) ? confirmedRes.data : []);
      setWalletAdmin({
        pendingTopups: Array.isArray(walletRes.data?.pendingTopups) ? walletRes.data.pendingTopups : [],
        transactions: Array.isArray(walletRes.data?.transactions) ? walletRes.data.transactions : []
      });
    } catch {
      setOrders([]);
      setConfirmedOrders([]);
      setWalletAdmin({ pendingTopups: [], transactions: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Products fetch ─────────────────────────────────────────────────────────
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const [prodsRes, imgsRes] = await Promise.all([
        axios.get('/api/shop/owner/products'),
        axios.get('/api/shop/owner/product-images')
      ]);
      setProducts(Array.isArray(prodsRes.data?.products) ? prodsRes.data.products : []);
      setProductImages(Array.isArray(imgsRes.data?.images) ? imgsRes.data.images : []);
    } catch {
      setProducts([]);
      setProductImages([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  const fetchManagedSlots = useCallback(async () => {
    setSlotsManagingLoading(true);
    try {
      const res = await axios.get('/api/shop/delivery-slots/manage');
      setSlotsManaging(Array.isArray(res.data?.slots) ? res.data.slots : []);
    } catch {
      setSlotsManaging([]);
    } finally {
      setSlotsManagingLoading(false);
    }
  }, []);

  // ── Games fetch ─────────────────────────────────────────────────────────────
  const fetchGames = useCallback(async () => {
    setGamesLoading(true);
    try {
      const res = await axios.get('/api/shop/owner/games');
      setGames(Array.isArray(res.data) ? res.data : []);
    } catch {
      setGames([]);
    } finally {
      setGamesLoading(false);
    }
  }, []);

  // ── Homepage config fetch ──────────────────────────────────────────────────
  const fetchHomepageConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const [configRes, productsRes] = await Promise.all([
        axios.get('/api/shop/config'),
        axios.get('/api/shop/owner/products')
      ]);
      setHomepageConfig({
        banners: Array.isArray(configRes.data?.banners) ? configRes.data.banners : [],
        bestSellerIds: Array.isArray(configRes.data?.bestSellerIds) ? configRes.data.bestSellerIds : []
      });
      setBestSellerOptions(Array.isArray(productsRes.data?.products) ? productsRes.data.products : []);
    } catch {
      setHomepageConfig({ banners: [], bestSellerIds: [] });
      setBestSellerOptions([]);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!localUser?.discordId) {
      setIsOwner(false);
      setLoading(false);
      return;
    }

    axios.get('/api/shop/check-owner')
      .then((res) => setIsOwner(res.data?.isOwner === true))
      .catch(() => setIsOwner(false));
  }, [localUser?.discordId]);

  useEffect(() => {
    if (isOwner === true) fetchData();
  }, [fetchData, isOwner]);

  useEffect(() => {
    if (isOwner === true && activeTab === 'products') {
      fetchProducts();
      fetchGames();
    }
  }, [isOwner, activeTab, fetchProducts, fetchGames]);

  useEffect(() => {
    if (isOwner === true && activeTab === 'slots') fetchManagedSlots();
  }, [isOwner, activeTab, fetchManagedSlots]);

  useEffect(() => {
    if (isOwner === true && activeTab === 'games') fetchGames();
  }, [isOwner, activeTab, fetchGames]);

  useEffect(() => {
    if (isOwner === true && activeTab === 'homepage') fetchHomepageConfig();
  }, [isOwner, activeTab, fetchHomepageConfig]);

  // ── Products helpers ───────────────────────────────────────────────────────
  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({ name: '', price: '', originalPriceString: '', bulkPrice: '', bulkPriceString: '', image: '', desc: '', category: 'Chest', gameId: '' });
    setProductFormErrors({});
    setImagePickerOpen(false);
    setProductFormOpen(true);
  };

  const openEditProduct = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || '',
      price: product.price != null ? String(product.price) : '',
      originalPriceString: product.originalPriceString || '',
      bulkPrice: product.bulkPrice != null ? String(product.bulkPrice) : '',
      bulkPriceString: product.bulkPriceString || '',
      image: product.image || '',
      desc: product.desc || '',
      category: product.category || 'Chest',
      gameId: product.gameId || ''
    });
    setProductFormErrors({});
    setImagePickerOpen(false);
    setProductFormOpen(true);
  };

  const setProductField = (field, value) => {
    setProductForm((prev) => ({ ...prev, [field]: value }));
    setProductFormErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  };

  const selectProductImage = (filename) => {
    setProductField('image', filename);
    setImagePickerOpen(false);
  };

  const handleUploadProductImage = async (file) => {
    if (!file) return;
    setProductUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await axios.post('/api/shop/owner/product-images/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      selectProductImage(res.data.filename);
      fetchProducts();
    } catch (err) {
      alert(err.response?.data?.error || 'Upload failed.');
    } finally {
      setProductUploading(false);
    }
  };

  const validateProductForm = () => {
    const errors = {};
    if (!productForm.name.trim()) errors.name = 'Required';
    const priceNum = Number(productForm.price);
    if (!productForm.price || isNaN(priceNum) || priceNum <= 0) errors.price = 'Must be > 0';
    if (!productForm.category) errors.category = 'Required';
    if (!productForm.image) errors.image = 'Select an image';
    return errors;
  };

  const handleSaveProduct = async () => {
    const errors = validateProductForm();
    if (Object.keys(errors).length > 0) { setProductFormErrors(errors); return; }
    try {
      const payload = {
        name: productForm.name.trim(),
        price: Number(productForm.price),
        originalPriceString: productForm.originalPriceString.trim(),
        bulkPrice: productForm.bulkPrice ? Number(productForm.bulkPrice) : null,
        bulkPriceString: productForm.bulkPriceString.trim(),
        image: productForm.image,
        desc: productForm.desc.trim(),
        category: productForm.category,
        gameId: productForm.gameId || null
      };
      if (editingProduct) {
        await axios.put(`/api/shop/owner/products/${editingProduct._id}`, payload);
      } else {
        await axios.post('/api/shop/owner/products', payload);
      }
      fetchProducts();
      localStorage.removeItem('productsCache');
      setEditingProduct(null);
      setProductFormOpen(false);
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || 'Could not save product.';
      if (status === 403) {
        alert('Access denied: you are not the shop owner.');
      } else {
        console.error('Save product error:', err);
        alert(msg);
      }
    }
  };

  const handleDeleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"?`)) return;
    try {
      await axios.delete(`/api/shop/owner/products/${product._id}`);
      fetchProducts();
      localStorage.removeItem('productsCache');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete product.');
    }
  };

  // ── Delivery slots helpers ────────────────────────────────────────────────
  const addSlotRange = () => setSlotRanges((prev) => [...prev, { startTime: '', endTime: '', note: '' }]);
  const removeSlotRange = (index) => setSlotRanges((prev) => prev.filter((_, i) => i !== index));
  const updateSlotRange = (index, field, value) =>
    setSlotRanges((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const handleBulkCreateSlots = async () => {
    if (!slotDate) { alert('Select a date first.'); return; }
    const validRanges = slotRanges.filter((r) => r.startTime && r.endTime);
    if (validRanges.length === 0) { alert('Add at least one time range.'); return; }
    try {
      await axios.post('/api/shop/delivery-slots/bulk', {
        ownerTimezone: slotOwnerTimezone,
        date: slotDate,
        ranges: validRanges.map((r) => ({ startTime: r.startTime, endTime: r.endTime, note: r.note }))
      });
      setSlotRanges([{ startTime: '', endTime: '', note: '' }]);
      setSlotNote('');
      fetchManagedSlots();
      alert('Slots created.');
    } catch (err) {
      alert(err.response?.data?.error || 'Could not create slots.');
    }
  };

  const handleToggleSlotActive = async (slot) => {
    try {
      await axios.patch(`/api/shop/delivery-slots/${slot._id}`, { active: !slot.active });
      fetchManagedSlots();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update slot.');
    }
  };

  const handleDeleteSlot = async (slot) => {
    if (!window.confirm('Delete this slot?')) return;
    try {
      await axios.delete(`/api/shop/delivery-slots/${slot._id}`);
      fetchManagedSlots();
    } catch (err) {
      alert(err.response?.data?.error || 'Could not delete slot.');
    }
  };

  // ── Filtering ──────────────────────────────────────────────────────────────
  const query = normalizeSearch(search);
  const pendingTopups = walletAdmin.pendingTopups || [];
  const filteredOrders = orders.filter((order) => {
    if (!query) return true;
    return [
      order.orderId,
      order.customerEmail,
      order.discordId,
      order.discordUsername,
      order.txnId,
      order.paymentMethod
    ].some((value) => normalizeSearch(value).includes(query));
  });
  const filteredTransactions = (walletAdmin.transactions || []).filter((item) => {
    if (!query) return true;
    return [
      item.referenceCode,
      item.orderId,
      item.txnId,
      item.discordId,
      item.discordUsername,
      item.methodLabel,
      item.memoExpected
    ].some((value) => normalizeSearch(value).includes(query));
  });

  const managedSlotsActive = slotsManaging.filter((s) => s.active);
  const managedSlotsInactive = slotsManaging.filter((s) => !s.active);
  const displayedSlots = slotTabFilter === 'active' ? managedSlotsActive : managedSlotsInactive;

  if (isOwner === false) return <Navigate to="/" replace />;
  if (isOwner !== true) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-main)] flex items-center justify-center text-[var(--color-text-secondary)]">
        Checking access...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] pt-24 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-gothic text-[var(--color-text-primary)]">Owner Control</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">Monitor provider-confirmed wallet deposits and checkout activity.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={fetchData}
              className="btn-press rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:text-[var(--color-error)]"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 border-b border-[var(--color-border)]">
          {['orders', 'slots', 'products', 'games', 'homepage'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-gothic capitalize transition-colors ${
                activeTab === tab
                  ? 'text-[var(--color-accent)] border-b-2 border-[var(--color-accent)]'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {tab === 'orders' ? 'Orders & Wallet' : tab === 'slots' ? 'Delivery Slots' : tab === 'products' ? 'Products' : tab === 'games' ? 'Games' : 'Homepage'}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* ORDERS & WALLET TAB                                               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'orders' && (
          <>
            <div className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4">
              <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-2 tracking-wider">Search</label>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Order, Discord, email, memo, transaction"
                className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
              />
            </div>

            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-x-auto">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Confirmed Orders</h2>
                <span className="text-sm text-[var(--color-text-secondary)]">{confirmedOrders.length} confirmed</span>
              </div>
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="p-3">Order</th><th className="p-3">Discord</th><th className="p-3">Roblox</th>
                    <th className="p-3">Total</th><th className="p-3">Paid / Delivered / Confirmed</th>
                    <th className="p-3">Evidence</th><th className="p-3">Coupon</th>
                  </tr>
                </thead>
                <tbody>
                  {confirmedOrders.map((order) => (
                    <tr key={order.orderId} className="border-t border-[var(--color-border)] align-top">
                      <td className="p-3 font-mono text-[var(--color-accent)]">{order.orderId}</td>
                      <td className="p-3 text-[var(--color-text-primary)]">{order.discordUsername || order.discordId}</td>
                      <td className="p-3 text-[var(--color-text-primary)]">{order.robloxUsername || order.robloxUserId || '-'}</td>
                      <td className="p-3 text-[var(--color-text-primary)]">${Number(order.totalAmount || 0).toFixed(2)}</td>
                      <td className="p-3 text-xs text-[var(--color-text-secondary)]">
                        <p>Paid: {formatDate(order.paidAt)}</p><p>Delivered: {formatDate(order.deliveredAt)}</p>
                        <p>Confirmed: {formatDate(order.confirmedAt)}</p>
                      </td>
                      <td className="p-3 text-xs text-[var(--color-text-secondary)] break-all">
                        <p>IP: {order.confirmIp || '-'}</p><p>UA: {order.confirmUa || '-'}</p>
                      </td>
                      <td className="p-3 font-mono text-[var(--color-success)]">{order.couponCode || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Pending Provider Confirmations</h2>
                <span className="text-sm text-[var(--color-text-secondary)]">{pendingTopups.length} pending</span>
              </div>
              {loading ? (
                <p className="p-4 text-sm text-[var(--color-text-secondary)]">Loading...</p>
              ) : pendingTopups.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-text-secondary)]">No pending provider confirmations.</p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {pendingTopups.map((topup) => (
                    <div key={topup.id} className="p-4 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className={`rounded-[8px] border px-2 py-1 text-xs ${statusClass(topup.status)}`}>{topup.status}</span>
                          <span className="text-[var(--color-text-primary)] font-gothic">{topup.referenceCode}</span>
                          <span className="text-[var(--color-success)] font-gothic">+${Number(topup.amount || 0).toFixed(2)}</span>
                        </div>
                        <p className="text-sm text-[var(--color-text-secondary)]">User: {topup.discordUsername || topup.discordId}</p>
                        <p className="text-sm text-[var(--color-text-secondary)]">Method: {topup.methodLabel}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] break-all mt-1">Destination: {topup.paymentAddress || '-'}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] break-words mt-1">Memo: {topup.memoExpected || '-'}</p>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">{formatDate(topup.createdAt)}</p>
                      </div>
                      <div className="text-xs text-[var(--color-text-secondary)] lg:text-right">
                        Waiting for PayPal, Square, or NOWPayments confirmation.
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-x-auto">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Wallet Transactions</h2>
              </div>
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="p-3">Time</th><th className="p-3">User</th><th className="p-3">Type</th>
                    <th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((item) => (
                    <tr key={item.id} className="border-t border-[var(--color-border)]">
                      <td className="p-3 text-[var(--color-text-secondary)]">{formatDate(item.createdAt)}</td>
                      <td className="p-3 text-[var(--color-text-primary)]">{item.discordUsername || item.discordId}</td>
                      <td className="p-3 text-[var(--color-text-secondary)]">{item.type} / {item.methodLabel}</td>
                      <td className={`p-3 font-gothic ${item.direction === 'credit' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
                        {item.direction === 'credit' ? '+' : '-'}${Number(item.amount || 0).toFixed(2)}
                      </td>
                      <td className="p-3"><span className={`rounded-[8px] border px-2 py-1 text-xs ${statusClass(item.status)}`}>{item.status}</span></td>
                      <td className="p-3 text-xs text-[var(--color-text-secondary)] break-all">{item.referenceCode || item.orderId || item.txnId || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-x-auto">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Orders</h2>
              </div>
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                  <tr>
                    <th className="p-3">Order</th><th className="p-3">Customer</th><th className="p-3">Total</th>
                    <th className="p-3">Payment</th><th className="p-3">Ticket</th><th className="p-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => (
                    <tr key={order.orderId} className="border-t border-[var(--color-border)]">
                      <td className="p-3 font-mono text-[var(--color-accent)]">{order.orderId}</td>
                      <td className="p-3 text-[var(--color-text-primary)]">{order.discordUsername || order.discordId}</td>
                      <td className="p-3 text-[var(--color-text-primary)]">${Number(order.totalAmount || 0).toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`rounded-[8px] border px-2 py-1 text-xs ${statusClass(order.paymentStatus)}`}>{order.paymentStatus}</span>
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1">{order.paymentMethod || '-'}</p>
                      </td>
                      <td className="p-3 text-xs text-[var(--color-text-secondary)]">{order.ticketStatus || '-'}</td>
                      <td className="p-3 text-[var(--color-text-secondary)]">{formatDate(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* DELIVERY SLOTS TAB                                                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'slots' && (
          <>
            {/* Bulk create form */}
            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4">
              <h2 className="text-xl font-gothic text-[var(--color-text-primary)] mb-4">Create Delivery Slots</h2>

              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Owner Timezone</label>
                  <div className="flex gap-2">
                    <select
                      value={slotOwnerTimezone}
                      onChange={(e) => setSlotOwnerTimezone(e.target.value)}
                      className="flex-1 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] cursor-pointer"
                    >
                      {COUNTRY_TIMEZONES.map((tz) => (
                        <option key={tz.code} value={tz.zone} className="bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)]">
                          {tz.flag} {tz.country} ({tz.zone})
                        </option>
                      ))}
                    </select>
                    <input
                      value={slotOwnerTimezone}
                      onChange={(e) => setSlotOwnerTimezone(e.target.value)}
                      placeholder="Custom IANA zone"
                      className="w-40 bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Date</label>
                  <input
                    type="date"
                    value={slotDate}
                    onChange={(e) => setSlotDate(e.target.value)}
                    className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                  />
                </div>
              </div>

              <div className="space-y-2 mb-3">
                {slotRanges.map((range, index) => (
                  <div key={index} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-[var(--color-text-secondary)] text-xs mb-1">Start</label>
                      <input
                        type="time"
                        value={range.startTime}
                        onChange={(e) => updateSlotRange(index, 'startTime', e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[var(--color-text-secondary)] text-xs mb-1">End</label>
                      <input
                        type="time"
                        value={range.endTime}
                        onChange={(e) => updateSlotRange(index, 'endTime', e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[var(--color-text-secondary)] text-xs mb-1">Note (opt.)</label>
                      <input
                        value={range.note}
                        onChange={(e) => updateSlotRange(index, 'note', e.target.value)}
                        placeholder="Note"
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      />
                    </div>
                    {slotRanges.length > 1 && (
                      <button
                        onClick={() => removeSlotRange(index)}
                        className="btn-press px-2 py-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] text-[var(--color-error)] text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button onClick={addSlotRange} className="btn-press rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-sm text-[var(--color-text-primary)]">
                  + Add Range
                </button>
                <button
                  onClick={handleBulkCreateSlots}
                  className="btn-press rounded-[8px] bg-[var(--color-accent)] text-white font-gothic px-4 py-2 text-sm"
                >
                  Create All Slots
                </button>
              </div>
            </section>

            {/* Slots list */}
            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Manage Slots</h2>
                <div className="flex gap-1">
                  <button
                    onClick={() => setSlotTabFilter('active')}
                    className={`px-3 py-1 rounded-[8px] text-xs font-gothic ${slotTabFilter === 'active' ? 'bg-[var(--color-accent)] text-white' : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
                  >
                    Active ({managedSlotsActive.length})
                  </button>
                  <button
                    onClick={() => setSlotTabFilter('inactive')}
                    className={`px-3 py-1 rounded-[8px] text-xs font-gothic ${slotTabFilter === 'inactive' ? 'bg-[var(--color-accent)] text-white' : 'border border-[var(--color-border)] text-[var(--color-text-secondary)]'}`}
                  >
                    Inactive ({managedSlotsInactive.length})
                  </button>
                  <button
                    onClick={fetchManagedSlots}
                    className="btn-press px-3 py-1 rounded-[8px] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)]"
                  >
                    Refresh
                  </button>
                </div>
              </div>

              {slotsManagingLoading ? (
                <p className="p-4 text-sm text-[var(--color-text-secondary)]">Loading...</p>
              ) : displayedSlots.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-text-secondary)]">
                  {slotTabFilter === 'active' ? 'No active slots.' : 'No inactive slots.'}
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                    <tr>
                      <th className="p-3">Date / Time</th>
                      <th className="p-3">Owner TZ</th>
                      <th className="p-3">Note</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedSlots.map((slot) => (
                      <tr key={slot._id} className="border-t border-[var(--color-border)]">
                        <td className="p-3 text-[var(--color-text-primary)]">
                          {formatDate(slot.startAt)} – {formatDate(slot.endAt)}
                        </td>
                        <td className="p-3 text-[var(--color-text-secondary)]">{slot.ownerTimezone}</td>
                        <td className="p-3 text-[var(--color-text-secondary)]">{slot.note || '-'}</td>
                        <td className="p-3 flex gap-1 flex-wrap">
                          <button
                            onClick={() => handleToggleSlotActive(slot)}
                            className={`btn-press px-2 py-1 rounded-[8px] text-xs ${slot.active ? 'border border-[var(--color-gold)] text-[var(--color-gold)]' : 'border border-[var(--color-success)] text-[var(--color-success)]'}`}
                          >
                            {slot.active ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleDeleteSlot(slot)}
                            className="btn-press px-2 py-1 rounded-[8px] border border-[var(--color-error)] text-[var(--color-error)] text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* PRODUCTS TAB                                                       */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'products' && (
          <>
            {/* Product form panel */}
            {(productFormOpen || editingProduct !== null || imagePickerOpen) && (
              <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">
                    {editingProduct ? `Edit: ${editingProduct.name}` : 'Add Product'}
                  </h2>
                  <button
                    onClick={() => { setEditingProduct(null); setImagePickerOpen(false); setProductFormOpen(false); }}
                    className="btn-press text-[var(--color-text-secondary)] hover:text-[var(--color-error)] text-sm"
                  >
                    Cancel
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Name *</label>
                      <input value={productForm.name} onChange={(e) => setProductField('name', e.target.value)}
                        placeholder="Product name"
                        className={`w-full bg-[var(--color-bg-main)] border rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)] ${productFormErrors.name ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}
                      />
                      {productFormErrors.name && <p className="text-[var(--color-error)] text-xs mt-1">{productFormErrors.name}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Price ($) *</label>
                        <input value={productForm.price} onChange={(e) => setProductField('price', e.target.value)}
                          type="number" step="0.01" min="0"
                          className={`w-full bg-[var(--color-bg-main)] border rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)] ${productFormErrors.price ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}
                        />
                        {productFormErrors.price && <p className="text-[var(--color-error)] text-xs mt-1">{productFormErrors.price}</p>}
                      </div>
                      <div>
                        <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Bulk Price ($)</label>
                        <input value={productForm.bulkPrice} onChange={(e) => setProductField('bulkPrice', e.target.value)}
                          type="number" step="0.01" min="0" placeholder="Optional"
                          className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Category *</label>
                      <select value={productForm.category} onChange={(e) => setProductField('category', e.target.value)}
                        className={`w-full bg-[var(--color-bg-main)] border rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)] ${productFormErrors.category ? 'border-[var(--color-error)]' : 'border-[var(--color-border)]'}`}
                      >
                        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Game</label>
                      <select value={productForm.gameId || ''} onChange={(e) => setProductField('gameId', e.target.value)}
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      >
                        <option value="">— No Game —</option>
                        {games.map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">Description</label>
                      <textarea value={productForm.desc} onChange={(e) => setProductField('desc', e.target.value)}
                        rows={3} placeholder="Optional description"
                        className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)] resize-none"
                      />
                    </div>
                  </div>

                  {/* Image picker */}
                  <div>
                    <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">
                      Image * {productFormErrors.image && <span className="text-[var(--color-error)]">— {productFormErrors.image}</span>}
                    </label>
                    {productForm.image && (
                      <div className="mb-2">
                        <img
                          src={getProductImageUrl(productForm.image)}
                          alt="Preview"
                          className="h-32 w-auto object-contain rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1"
                        />
                        <p className="text-xs text-[var(--color-text-secondary)] mt-1 truncate">{productForm.image}</p>
                      </div>
                    )}
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setImagePickerOpen(!imagePickerOpen)}
                        className="btn-press flex-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                      >
                        {imagePickerOpen ? 'Hide Library' : 'Choose from Library'}
                      </button>
                      <label className="btn-press flex-1 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] px-3 py-2 text-sm text-[var(--color-text-primary)] text-center cursor-pointer">
                        {productUploading ? 'Uploading...' : 'Upload New'}
                        <input type="file" accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => handleUploadProductImage(e.target.files[0])}
                          className="hidden" disabled={productUploading}
                        />
                      </label>
                    </div>
                    {imagePickerOpen && (
                      <div className="border border-[var(--color-border)] rounded-[8px] p-2 max-h-64 overflow-y-auto custom-scrollbar">
                        {productsLoading ? (
                          <p className="text-sm text-[var(--color-text-secondary)] p-2">Loading images...</p>
                        ) : productImages.length === 0 ? (
                          <p className="text-sm text-[var(--color-text-secondary)] p-2">No images found. Upload one above.</p>
                        ) : (
                          <div className="grid grid-cols-4 gap-1">
                            {productImages.map((img) => (
                              <button
                                key={img.filename}
                                onClick={() => selectProductImage(img.filename)}
                                className={`p-1 rounded-[6px] border transition-all ${
                                  productForm.image === img.filename
                                    ? 'border-[var(--color-accent)] ring-1 ring-[var(--color-accent)]'
                                    : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'
                                }`}
                              >
                                <img
                                  src={getProductImageUrl(img.filename)}
                                  alt={img.filename}
                                  className="w-full aspect-square object-contain rounded-[4px]"
                                />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={handleSaveProduct}
                    className="btn-press rounded-[8px] bg-[var(--color-accent)] text-white font-gothic px-5 py-2 text-sm"
                  >
                    {editingProduct ? 'Save Changes' : 'Add Product'}
                  </button>
                </div>
              </section>
            )}

            {/* Products table */}
            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-hidden">
              <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Products</h2>
                <button
                  onClick={openAddProduct}
                  className="btn-press rounded-[8px] bg-[var(--color-accent)] text-white font-gothic px-4 py-2 text-sm"
                >
                  + Add Product
                </button>
              </div>
              {productsLoading ? (
                <p className="p-4 text-sm text-[var(--color-text-secondary)]">Loading...</p>
              ) : products.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-text-secondary)]">No products yet. Click "Add Product" above.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                    <tr>
                      <th className="p-3">Image</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Bulk</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product._id} className="border-t border-[var(--color-border)]">
                        <td className="p-3">
                          <img
                            src={getProductImageUrl(product.image)}
                            alt={product.name}
                            className="w-12 h-12 object-contain rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg-main)]"
                          />
                        </td>
                        <td className="p-3 text-[var(--color-text-primary)]">{product.name}</td>
                        <td className="p-3 text-[var(--color-text-secondary)]">{product.category}</td>
                        <td className="p-3 text-[var(--color-text-primary)]">${Number(product.price || 0).toFixed(2)}</td>
                        <td className="p-3 text-[var(--color-text-secondary)]">
                          {product.bulkPrice != null ? `$${Number(product.bulkPrice).toFixed(2)}` : '-'}
                        </td>
                        <td className="p-3 flex gap-1">
                          <button
                            onClick={() => openEditProduct(product)}
                            className="btn-press px-2 py-1 rounded-[8px] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="btn-press px-2 py-1 rounded-[8px] border border-[var(--color-error)] text-xs text-[var(--color-error)]"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* GAMES TAB                                                         */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'games' && (
          <>
            {/* Game form panel */}
            {(gameFormOpen || editingGame) && (
              <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">
                    {editingGame ? 'Edit Game' : 'Add Game'}
                  </h2>
                  <button
                    onClick={() => { setGameFormOpen(false); setEditingGame(null); setGameForm({ name: '', slug: '', image: '', active: true }); setGameFormErrors({}); }}
                    className="text-[var(--color-text-secondary)] hover:text-[var(--color-error)] text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid md:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">
                      Name * {gameFormErrors.name && <span className="text-[var(--color-error)]">— {gameFormErrors.name}</span>}
                    </label>
                    <input
                      value={gameForm.name}
                      onChange={(e) => setGameForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Genshin Impact"
                      className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-1">
                      Slug * {gameFormErrors.slug && <span className="text-[var(--color-error)]">— {gameFormErrors.slug}</span>}
                    </label>
                    <input
                      value={gameForm.slug}
                      onChange={(e) => setGameForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                      placeholder="e.g. genshin-impact"
                      className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2 text-sm text-[var(--color-text-primary)]"
                    />
                  </div>
                </div>
                <div className="flex gap-3 items-center mb-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={gameForm.active}
                      onChange={(e) => setGameForm((f) => ({ ...f, active: e.target.checked }))}
                      className="w-4 h-4 accent-[var(--color-accent)]"
                    />
                    Active (visible on shop)
                  </label>
                </div>
                <button
                  onClick={async () => {
                    const errors = {};
                    if (!gameForm.name.trim()) errors.name = 'Required';
                    if (!gameForm.slug.trim()) errors.slug = 'Required';
                    if (Object.keys(errors).length > 0) { setGameFormErrors(errors); return; }
                    setGameUploading(true);
                    try {
                      if (editingGame) {
                        await axios.put(`/api/shop/owner/games/${editingGame._id}`, gameForm);
                      } else {
                        await axios.post('/api/shop/owner/games', gameForm);
                      }
                      fetchGames();
                      setGameFormOpen(false);
                      setEditingGame(null);
                      setGameForm({ name: '', slug: '', image: '', active: true });
                    } catch (err) {
                      alert(err.response?.data?.error || 'Save failed.');
                    } finally {
                      setGameUploading(false);
                    }
                  }}
                  disabled={gameUploading}
                  className="btn-press bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white px-4 py-2 rounded-[8px] text-sm font-gothic disabled:opacity-50"
                >
                  {gameUploading ? 'Saving...' : (editingGame ? 'Update Game' : 'Add Game')}
                </button>
              </section>
            )}

            {/* Add game button */}
            {!gameFormOpen && !editingGame && (
              <button
                onClick={() => setGameFormOpen(true)}
                className="btn-press mb-4 px-4 py-2 rounded-[8px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-sm font-gothic"
              >
                + Add Game
              </button>
            )}

            {/* Games list */}
            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-x-auto">
              <div className="p-4 border-b border-[var(--color-border)]">
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Games ({games.length})</h2>
              </div>
              {gamesLoading ? (
                <p className="p-4 text-[var(--color-text-secondary)] text-sm">Loading...</p>
              ) : games.length === 0 ? (
                <p className="p-4 text-[var(--color-text-secondary)] text-sm">No games yet. Add one above.</p>
              ) : (
                <table className="w-full min-w-[500px] text-left text-sm">
                  <thead className="bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">
                    <tr>
                      <th className="p-3">Name</th>
                      <th className="p-3">Slug</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {games.map((game) => (
                      <tr key={game._id} className="border-t border-[var(--color-border)]">
                        <td className="p-3 font-gothic text-[var(--color-text-primary)]">{game.name}</td>
                        <td className="p-3 text-[var(--color-text-secondary)] font-mono text-xs">{game.slug}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${game.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {game.active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="p-3">
                          <button
                            onClick={() => {
                              setEditingGame(game);
                              setGameForm({ name: game.name, slug: game.slug, image: game.image || '', active: game.active });
                              setGameFormOpen(true);
                            }}
                            className="btn-press px-2 py-1 rounded-[8px] border border-[var(--color-border)] text-xs text-[var(--color-text-primary)] mr-2"
                          >
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete game "${game.name}"?`)) return;
                              try {
                                await axios.delete(`/api/shop/owner/games/${game._id}`);
                                fetchGames();
                              } catch (err) {
                                alert(err.response?.data?.error || 'Delete failed.');
                              }
                            }}
                            className="btn-press px-2 py-1 rounded-[8px] border border-[var(--color-error)] text-xs text-[var(--color-error)]"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* HOMEPAGE CONFIG TAB                                               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'homepage' && (
          <>
            {/* Banner management */}
            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4 mb-4">
              <h2 className="text-xl font-gothic text-[var(--color-text-primary)] mb-4">Homepage Banners</h2>
              {configLoading ? (
                <p className="text-[var(--color-text-secondary)] text-sm">Loading...</p>
              ) : (
                <>
                  {/* Banner preview grid */}
                  {homepageConfig.banners.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      {homepageConfig.banners.map((banner, idx) => {
                        const bannerSrc = banner.startsWith('http') ? banner : `/api/banners/${encodeURIComponent(banner)}`;
                        return (
                        <div key={idx} className="relative group rounded-[8px] overflow-hidden border border-[var(--color-border)]">
                          <img
                            src={bannerSrc}
                            alt={`Banner ${idx + 1}`}
                            className="w-full h-24 object-cover"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                          <button
                            onClick={async () => {
                              try {
                                const res = await axios.delete('/api/shop/owner/config/banners', { data: { bannerUrl: banner } });
                                setHomepageConfig((c) => ({ ...c, banners: res.data?.banners || [] }));
                              } catch (err) {
                                alert(err.response?.data?.error || 'Delete failed.');
                              }
                            }}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    </div>
                  )}
                  {homepageConfig.banners.length === 0 && (
                    <p className="text-[var(--color-text-secondary)] text-sm mb-4">No banners uploaded yet.</p>
                  )}
                  {/* Upload new banner */}
                  <label className="btn-press inline-block cursor-pointer">
                    <span className="px-4 py-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] text-sm text-[var(--color-text-primary)]">
                      {bannerUploading ? 'Uploading...' : '+ Upload Banner'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={bannerUploading}
                      onChange={async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        setBannerUploading(true);
                        try {
                          const formData = new FormData();
                          formData.append('banner', file);
                          const res = await axios.post('/api/shop/owner/config/banners/upload', formData, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                          });
                          setHomepageConfig((c) => ({ ...c, banners: res.data?.banners || [] }));
                        } catch (err) {
                          alert(err.response?.data?.error || 'Upload failed.');
                        } finally {
                          setBannerUploading(false);
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                </>
              )}
            </section>

            {/* Best seller management */}
            <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-4">
              <h2 className="text-xl font-gothic text-[var(--color-text-primary)] mb-2">Best Seller</h2>
              <p className="text-sm text-[var(--color-text-secondary)] mb-4">Select the product to feature as the Best Seller on the homepage.</p>
              {configLoading ? (
                <p className="text-[var(--color-text-secondary)] text-sm">Loading...</p>
              ) : (
                <div className="flex flex-col md:flex-row gap-4 items-start">
                  <div className="flex-1">
                    <select
                      value={homepageConfig.bestSellerIds?.[0] || ''}
                      onChange={async (e) => {
                        const selectedId = e.target.value;
                        try {
                          const res = await axios.put('/api/shop/owner/config/best-sellers', {
                            bestSellerIds: selectedId ? [selectedId] : []
                          });
                          setHomepageConfig((c) => ({ ...c, bestSellerIds: res.data?.bestSellerIds || [] }));
                        } catch (err) {
                          alert(err.response?.data?.error || 'Update failed.');
                        }
                      }}
                      className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-2.5 text-sm text-[var(--color-text-primary)]"
                    >
                      <option value="">— None —</option>
                      {bestSellerOptions.map((p) => (
                        <option key={p._id} value={p._id}>{p.name} (${p.price})</option>
                      ))}
                    </select>
                  </div>
                  {homepageConfig.bestSellerIds?.[0] && (
                    <div className="shrink-0">
                      <img
                        src={getProductImageUrl(bestSellerOptions.find((p) => String(p._id) === String(homepageConfig.bestSellerIds[0]))?.image || '')}
                        alt="Preview"
                        className="h-20 w-auto object-contain rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-1"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

      </div>
    </div>
  );
};

export default AdminOrders;
