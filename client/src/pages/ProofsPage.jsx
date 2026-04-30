import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

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

const DISCORD_VOUCH_URL = normalizeExternalUrl(import.meta.env.VITE_DISCORD_VOUCH_URL);
const buildPublicApiClient = () => {
  const configuredApiBaseUrl = String(axios.defaults.baseURL || '').trim();
  const fallbackApiBaseUrl = String(import.meta.env.VITE_FALLBACK_API_URL || '').trim().replace(/\/+$/, '');
  const runtimeHost = typeof window !== 'undefined' ? String(window.location.hostname || '').trim().toLowerCase() : '';
  const isNosMarketHost = runtimeHost === 'nosmarket.com' || runtimeHost === 'www.nosmarket.com';
  const resolvedApiBaseUrl = configuredApiBaseUrl
    || (isNosMarketHost ? (fallbackApiBaseUrl || 'https://gaming-shop-2.onrender.com') : '');

  const client = axios.create({ baseURL: resolvedApiBaseUrl });
  delete client.defaults.headers.common.Authorization;
  return client;
};

const formatAgo = (dateValue) => {
  if (!dateValue) return '';
  const timestamp = new Date(dateValue).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
};

const ProofsPage = () => {
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [deletingProofId, setDeletingProofId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const checkOwner = async () => {
      try {
        const { data } = await axios.get('/api/shop/check-owner', { timeout: 10000 });
        if (!cancelled) {
          setIsOwner(data?.isOwner === true);
        }
      } catch {
        if (!cancelled) {
          setIsOwner(false);
        }
      }
    };

    checkOwner();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async ({ silent = false } = {}) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const publicApi = buildPublicApiClient();
        const { data } = await publicApi.get(`/api/shop/proofs?limit=48&t=${Date.now()}`, {
          timeout: 20000,
          headers: {
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache'
          }
        });
        if (cancelled) return;
        setError('');
        setProofs(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to load proofs.');
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };

    run();
    const refreshTimer = setInterval(() => {
      run({ silent: true }).catch(() => {});
    }, 15000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        run({ silent: true }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const previewImages = useMemo(() => (Array.isArray(preview?.imageUrls) ? preview.imageUrls : []), [preview]);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    setPreviewIndex(0);
  }, [preview?.id]);

  const activeImage = previewImages[previewIndex] || '';

  const handleDeleteProof = async (proofId) => {
    const id = String(proofId || '').trim();
    if (!id) return;
    if (!window.confirm('Delete this proof?')) return;

    setDeletingProofId(id);
    try {
      await axios.delete(`/api/shop/proofs/${encodeURIComponent(id)}`, { timeout: 15000 });
      setProofs((prev) => prev.filter((item) => String(item?.id || '') !== id));
      setPreview((prev) => (String(prev?.id || '') === id ? null : prev));
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to delete proof.');
    } finally {
      setDeletingProofId('');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-main)] pt-20 md:pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <section className="mb-8 md:mb-10 text-center">
          <div className="inline-flex items-center rounded-pill px-4 py-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] text-[var(--color-accent)] text-xs font-gothic tracking-wider uppercase">
            Verified Deliveries
          </div>
          <h1 className="mt-4 text-4xl md:text-6xl font-gothic text-[var(--color-text-primary)] tracking-[-2.16px]">Proof of Delivery</h1>
          <p className="mt-4 text-[var(--color-text-secondary)] font-serif max-w-3xl mx-auto text-sm md:text-xl">
            Every completed order is logged with image proof. Browse clear, authentic delivery records from our real orders.
          </p>
          {DISCORD_VOUCH_URL && (
            <a
              href={DISCORD_VOUCH_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 btn-press bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-sm px-4 py-2 rounded-pill border border-[var(--color-border)]"
            >
              Open Discord Vouch Channel
            </a>
          )}
          <div className="mt-3">
            <Link
              to="/"
              className="inline-block btn-press bg-[var(--color-bg-elevated)] hover:text-[var(--color-error)] text-[var(--color-text-primary)] text-sm px-4 py-2 rounded-pill border border-[var(--color-border)]"
            >
              Back To Home
            </Link>
          </div>
        </section>

        {loading ? (
          <div className="products-loader" role="status" aria-live="polite">
            <div className="products-loader-track">
              <span className="products-loader-dog" aria-hidden="true">🐕</span>
            </div>
            <p className="products-loader-text">Loading proofs...</p>
          </div>
        ) : error ? (
          <div className="text-center text-[var(--color-error)] bg-[rgba(207,45,86,0.1)] border border-[rgba(207,45,86,0.3)] rounded-[10px] p-5">{error}</div>
        ) : proofs.length === 0 ? (
          <div className="text-center text-[var(--color-text-secondary)] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[10px] p-6">No proof records yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {proofs.map((proof) => {
              const firstImage = Array.isArray(proof?.imageUrls) ? proof.imageUrls[0] : '';
              const items = Array.isArray(proof?.items) ? proof.items : [];
              return (
                <article
                  key={proof.id}
                  className="rounded-[10px] overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-secondary)] shadow-none hover:shadow-[rgba(17,24,39,0.08)_0px_18px_42px]"
                >
                  <button
                    type="button"
                    onClick={() => setPreview(proof)}
                    className="w-full block text-left btn-press"
                  >
                    <div className="relative h-56 bg-[var(--color-bg-elevated)]">
                      {firstImage ? (
                        <img
                          src={firstImage}
                          alt={`Proof ${proof.orderId}`}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--color-text-secondary)] text-sm">No image</div>
                      )}
                      {Array.isArray(proof?.imageUrls) && proof.imageUrls.length > 1 && (
                        <span className="absolute top-3 right-3 px-2 py-1 rounded-pill text-xs font-semibold bg-black/60 border border-white/10 text-white">
                          {proof.imageUrls.length} photos
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="p-4 space-y-3">
                    {isOwner && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteProof(proof.id)}
                          disabled={deletingProofId === proof.id}
                          className="btn-press px-3 py-1.5 rounded-pill border border-[rgba(207,45,86,0.35)] bg-[rgba(207,45,86,0.08)] text-[var(--color-error)] text-xs font-gothic hover:text-[var(--color-error)] disabled:opacity-60"
                        >
                          {deletingProofId === proof.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    )}
                    <div className="space-y-2">
                      {items.slice(0, 3).map((item, idx) => (
                        <p key={`${proof.id}-${idx}`} className="text-sm text-[var(--color-text-primary)] truncate font-gothic">
                          {item.deliveredLabel || 'x0'} {item.name}
                        </p>
                      ))}
                      {items.length > 3 && (
                        <p className="text-xs text-[var(--color-text-secondary)]">+{items.length - 3} more</p>
                      )}
                      {items.length === 0 && (
                        <p className="text-sm text-[var(--color-text-primary)] font-gothic">Unknown item</p>
                      )}
                      <p className="text-sm text-[var(--color-accent)] font-semibold">
                        Total: ${Number(proof?.totalAmount || 0).toFixed(2)}
                      </p>
                    </div>
                    <p className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1">
                      <ClockIcon className="w-3.5 h-3.5" />
                      {formatAgo(proof?.createdAt)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {preview && (
        <div className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setPreview(null)} />
          <div className="relative w-full max-w-6xl bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[10px] overflow-hidden proof-modal-in">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute top-3 right-3 z-10 px-3 py-1 rounded-pill bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] text-sm btn-press hover:text-[var(--color-error)]"
            >
              Close
            </button>

            <div className="md:grid md:grid-cols-[1.5fr_1fr]">
              <div className="relative min-h-[300px] bg-black flex items-center justify-center">
                {activeImage ? (
                  <img
                    key={`preview-image-${preview?.id || 'proof'}-${previewIndex}`}
                    src={activeImage}
                    alt="Proof preview"
                    className="max-h-[72vh] w-auto max-w-full object-contain proof-image-in"
                  />
                ) : (
                  <div className="text-[var(--color-text-secondary)] text-sm">No image</div>
                )}

                {previewImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((prev) => (prev - 1 + previewImages.length) % previewImages.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white"
                    >
                      <ChevronLeftIcon className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewIndex((prev) => (prev + 1) % previewImages.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/60 text-white"
                    >
                      <ChevronRightIcon className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>

              <div className="p-5 border-t md:border-t-0 md:border-l border-[var(--color-border)]">
                <h3 className="text-[var(--color-text-primary)] font-gothic text-lg">Order Proof</h3>
                <p className="text-[var(--color-accent)] font-semibold mt-1">${Number(preview?.totalAmount || 0).toFixed(2)}</p>
                <div className="mt-4 space-y-2">
                  {(Array.isArray(preview?.items) ? preview.items : []).map((item, idx) => (
                    <div key={`preview-${idx}`} className="rounded-[8px] bg-[var(--color-bg-secondary)] border border-[var(--color-border)] px-3 py-2 text-sm">
                      <p className="text-[var(--color-text-primary)] font-gothic">{item.deliveredLabel || 'x0'} {item.name}</p>
                    </div>
                  ))}
                </div>
                {previewImages.length > 1 && (
                  <p className="mt-4 text-xs text-[var(--color-text-secondary)]">
                    Image {previewIndex + 1} / {previewImages.length}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProofsPage;
