import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from '@heroicons/react/24/outline';
import { Link } from 'react-router-dom';

const DISCORD_VOUCH_URL = String(import.meta.env.VITE_DISCORD_VOUCH_URL || '').trim();

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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await axios.get('/api/shop/proofs?limit=48', { timeout: 20000 });
        if (cancelled) return;
        setProofs(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || 'Failed to load proofs.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewImages = useMemo(() => (Array.isArray(preview?.imageUrls) ? preview.imageUrls : []), [preview]);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    setPreviewIndex(0);
  }, [preview?.id]);

  const activeImage = previewImages[previewIndex] || '';

  return (
    <div className="min-h-screen bg-black pt-20 md:pt-24 pb-16">
      <div className="max-w-7xl mx-auto px-4">
        <section className="mb-8 md:mb-10 text-center">
          <div className="inline-flex items-center rounded-full px-4 py-2 bg-[#0d111f] border border-[#1f2b45] text-[#8ef3c7] text-xs font-semibold tracking-wider uppercase">
            Verified Deliveries
          </div>
          <h1 className="mt-4 text-4xl md:text-6xl font-black text-[#b7ffd8]">Proof of Delivery</h1>
          <p className="mt-4 text-gray-300 max-w-3xl mx-auto text-sm md:text-xl">
            Every completed order is logged with image proof. Browse clear, authentic delivery records from our real orders.
          </p>
          <p className="mt-3 text-gray-400 text-sm md:text-base">
            <span className="font-semibold text-white">{proofs.length}</span> proof entries loaded
          </p>
          {DISCORD_VOUCH_URL && (
            <a
              href={DISCORD_VOUCH_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-4 btn-press bg-[#1d273d] hover:bg-[#293553] text-white text-sm px-4 py-2 rounded-full border border-[#31405f]"
            >
              Open Discord Vouch Channel
            </a>
          )}
          <div className="mt-3">
            <Link
              to="/"
              className="inline-block btn-press bg-[#1a2030] hover:bg-[#24314a] text-white text-sm px-4 py-2 rounded-full border border-[#2a3a58]"
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
          <div className="text-center text-red-300 bg-[#1d0f12] border border-[#47232a] rounded-2xl p-5">{error}</div>
        ) : proofs.length === 0 ? (
          <div className="text-center text-gray-400 bg-[#111217] border border-[#232737] rounded-2xl p-6">No proof records yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {proofs.map((proof) => {
              const firstImage = Array.isArray(proof?.imageUrls) ? proof.imageUrls[0] : '';
              const items = Array.isArray(proof?.items) ? proof.items : [];
              return (
                <article
                  key={proof.id}
                  className="rounded-2xl overflow-hidden border border-[#222939] bg-[#111522] shadow-[0_14px_34px_rgba(0,0,0,0.35)]"
                >
                  <button
                    type="button"
                    onClick={() => setPreview(proof)}
                    className="w-full block text-left btn-press"
                  >
                    <div className="relative h-56 bg-[#090b13]">
                      {firstImage ? (
                        <img
                          src={firstImage}
                          alt={`Proof ${proof.orderId}`}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">No image</div>
                      )}
                      {Array.isArray(proof?.imageUrls) && proof.imageUrls.length > 1 && (
                        <span className="absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-semibold bg-black/60 border border-white/10 text-white">
                          {proof.imageUrls.length} photos
                        </span>
                      )}
                    </div>
                  </button>
                  <div className="p-4 space-y-3">
                    <div className="space-y-2">
                      {items.slice(0, 3).map((item, idx) => (
                        <div key={`${proof.id}-${idx}`} className="flex items-start justify-between gap-3">
                          <p className="text-sm text-white truncate font-bold">
                            {item.deliveredLabel || 'x0'} {item.name}
                          </p>
                          <p className="text-sm text-[#7ef8bc] font-semibold shrink-0">
                            ${Number(item?.lineTotal || 0).toFixed(2)}
                          </p>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <p className="text-xs text-gray-500">+{items.length - 3} more</p>
                      )}
                      {items.length === 0 && (
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-white font-bold">Unknown item</p>
                          <p className="text-sm text-[#7ef8bc] font-semibold">${Number(proof?.totalAmount || 0).toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 flex items-center gap-1">
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
        <div className="fixed inset-0 z-[90] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="absolute inset-0" onClick={() => setPreview(null)} />
          <div className="relative w-full max-w-6xl bg-[#0f1320] border border-[#24314d] rounded-2xl overflow-hidden proof-modal-in">
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="absolute top-3 right-3 z-10 px-3 py-1 rounded-full bg-black/60 text-white text-sm btn-press"
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
                  <div className="text-gray-500 text-sm">No image</div>
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

              <div className="p-5 border-t md:border-t-0 md:border-l border-[#24314d]">
                <h3 className="text-white font-bold text-lg">Order Proof</h3>
                <p className="text-[#7ef8bc] font-semibold mt-1">${Number(preview?.totalAmount || 0).toFixed(2)}</p>
                <div className="mt-4 space-y-2">
                  {(Array.isArray(preview?.items) ? preview.items : []).map((item, idx) => (
                    <div key={`preview-${idx}`} className="rounded-lg bg-[#0a0e19] border border-[#1f2a43] px-3 py-2 text-sm">
                      <p className="text-white font-bold">{item.deliveredLabel || 'x0'} {item.name}</p>
                      <p className="text-gray-400 text-xs">${Number(item?.lineTotal || 0).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
                {previewImages.length > 1 && (
                  <p className="mt-4 text-xs text-gray-500">
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
