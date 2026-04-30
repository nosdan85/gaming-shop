import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowPathIcon, BanknotesIcon, CheckCircleIcon, ClipboardDocumentIcon, ClockIcon, UserCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { ShopContext } from '../context/ShopContext';

const TOPUP_METHODS = [
  { id: 'paypal_ff', label: 'PayPal F&F' },
  { id: 'cashapp', label: 'Cash App' },
  { id: 'ltc', label: 'Litecoin' }
];

const statusClass = (status) => {
  if (status === 'completed') return 'text-[var(--color-success)] border-[rgba(31,138,101,0.35)] bg-[rgba(31,138,101,0.12)]';
  if (status === 'rejected' || status === 'cancelled') return 'text-[var(--color-error)] border-[rgba(207,45,86,0.35)] bg-[rgba(207,45,86,0.12)]';
  return 'text-[var(--color-gold)] border-[rgba(204,150,64,0.35)] bg-[rgba(204,150,64,0.12)]';
};

const statusIcon = (status) => {
  if (status === 'completed') return <CheckCircleIcon className="w-4 h-4" />;
  if (status === 'rejected' || status === 'cancelled') return <XCircleIcon className="w-4 h-4" />;
  return <ClockIcon className="w-4 h-4" />;
};

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

const getSquareScriptUrl = (environment) => (
  String(environment || '').toLowerCase() === 'production'
    ? 'https://web.squarecdn.com/v1/square.js'
    : 'https://sandbox.web.squarecdn.com/v1/square.js'
);

const loadSquareScript = (environment) => new Promise((resolve, reject) => {
  if (window.Square) {
    resolve(window.Square);
    return;
  }

  const src = getSquareScriptUrl(environment);
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) {
    existing.addEventListener('load', () => resolve(window.Square), { once: true });
    existing.addEventListener('error', reject, { once: true });
    return;
  }

  const script = document.createElement('script');
  script.src = src;
  script.async = true;
  script.onload = () => resolve(window.Square);
  script.onerror = reject;
  document.head.appendChild(script);
});

const WalletPage = () => {
  const { user: contextUser } = useContext(ShopContext);
  const [localUser, setLocalUser] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [method, setMethod] = useState('paypal_ff');
  const [amount, setAmount] = useState('10');
  const [creating, setCreating] = useState(false);
  const [createdTopup, setCreatedTopup] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('discordUser') || localStorage.getItem('user');
      setLocalUser(stored ? JSON.parse(stored) : null);
    } catch {
      setLocalUser(null);
    }
  }, []);

  const user = contextUser || localUser;
  const transactions = useMemo(() => Array.isArray(wallet?.transactions) ? wallet.transactions : [], [wallet]);
  const hasPendingTopup = transactions.some((item) => item.type === 'topup' && item.status === 'pending');

  const fetchWallet = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.discordId) {
      setLoading(false);
      return;
    }
    if (!quiet) setLoading(true);
    try {
      const { data } = await axios.get('/api/shop/wallet');
      setWallet(data || null);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load wallet.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [user?.discordId]);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  useEffect(() => {
    if (!user?.discordId || !hasPendingTopup) return undefined;
    const timer = window.setInterval(() => fetchWallet({ quiet: true }), 10000);
    return () => window.clearInterval(timer);
  }, [fetchWallet, hasPendingTopup, user?.discordId]);

  const copyText = async (key, value) => {
    const text = String(value || '').trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(''), 1200);
  };

  const createTopup = async (event) => {
    event.preventDefault();
    if (creating) return;
    setCreating(true);
    setError('');
    try {
      const { data } = await axios.post('/api/shop/wallet/topup', {
        method,
        amount: Number(amount)
      });
      setCreatedTopup(data);
      await fetchWallet({ quiet: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not create top-up request.');
    } finally {
      setCreating(false);
    }
  };

  const oauthUrl = useMemo(() => {
    const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID || '';
    const rawRedirectUri = import.meta.env.VITE_DISCORD_REDIRECT_URI;
    const redirectUri = typeof rawRedirectUri === 'string' && rawRedirectUri.trim()
      ? rawRedirectUri.trim()
      : `${window.location.origin}/auth/discord/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds.join'
    });
    return `https://discord.com/oauth2/authorize?${params.toString()}`;
  }, []);

  if (!user?.discordId) {
    return (
      <main className="min-h-screen bg-[var(--color-bg-main)] pt-24 px-4">
        <section className="max-w-xl mx-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-6 text-center">
          <UserCircleIcon className="w-10 h-10 mx-auto mb-3 text-[#5865F2]" />
          <h1 className="text-2xl font-gothic text-[var(--color-text-primary)] mb-2">Wallet</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mb-5">Link Discord to view your balance, top up, and pay from your wallet.</p>
          <a href={oauthUrl} className="btn-press inline-flex items-center justify-center rounded-[8px] bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2.5 font-gothic text-sm">
            Link Discord
          </a>
        </section>
      </main>
    );
  }

  const instructions = createdTopup?.instructions || null;
  const createdTopupId = createdTopup?.topup?.id || '';

  return (
    <main className="min-h-screen bg-[var(--color-bg-main)] pt-24 px-4 pb-10">
      <section className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-gothic text-[var(--color-text-primary)] tracking-normal">Wallet</h1>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">Balance is tied directly to your Discord account.</p>
          </div>
          <button
            type="button"
            onClick={() => fetchWallet()}
            className="btn-press inline-flex items-center gap-2 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] hover:text-[var(--color-error)]"
          >
            <ArrowPathIcon className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.4fr]">
          <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] p-5">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-[8px] bg-[var(--color-bg-elevated)] flex items-center justify-center text-[var(--color-success)]">
                <BanknotesIcon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)] font-gothic">Available balance</p>
                <p className="text-3xl font-gothic text-[var(--color-text-primary)]">
                  {loading ? 'Loading...' : `$${Number(wallet?.balance || 0).toFixed(2)}`}
                </p>
              </div>
            </div>

            <form onSubmit={createTopup} className="space-y-4">
              <div>
                <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-2 tracking-wider">Top-up method</label>
                <div className="grid grid-cols-3 gap-2">
                  {TOPUP_METHODS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMethod(item.id)}
                      className={`btn-press rounded-[8px] border px-2 py-2 text-xs font-gothic transition ${method === item.id ? 'border-[var(--color-accent)] bg-[var(--color-bg-main)] text-[var(--color-text-primary)]' : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[var(--color-text-secondary)] text-xs uppercase font-gothic mb-2 tracking-wider">Amount USD</label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full bg-[var(--color-bg-main)] border border-[var(--color-border)] rounded-[8px] px-3 py-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
                />
              </div>

              {error && <p className="text-sm text-[var(--color-error)]">{error}</p>}

              <button
                type="submit"
                disabled={creating}
                className="btn-press w-full rounded-[8px] bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-bg-elevated)] disabled:text-[var(--color-text-secondary)] text-white py-3 font-gothic"
              >
                {creating ? 'Creating...' : 'Create Top-up Request'}
              </button>
            </form>

            {instructions && (
              <div className="mt-5 border-t border-[var(--color-border)] pt-5 space-y-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-[var(--color-text-secondary)] font-gothic">Send payment</p>
                  <p className="text-sm text-[var(--color-text-primary)]">{instructions.methodLabel} - ${Number(instructions.amount || 0).toFixed(2)}</p>
                  {instructions.payAmount && (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                      Send exactly {Number(instructions.payAmount).toFixed(8)} {String(instructions.payCurrency || 'LTC').toUpperCase()}
                    </p>
                  )}
                </div>
                {instructions.method === 'cashapp' ? (
                  <CashAppPayPanel
                    topupId={createdTopupId}
                    instructions={instructions}
                    onComplete={async (data) => {
                      setCreatedTopup((current) => ({
                        ...(current || {}),
                        topup: data?.topup || current?.topup,
                        instructions: current?.instructions || instructions
                      }));
                      await fetchWallet({ quiet: true });
                    }}
                  />
                ) : (
                  <>
                    <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-gothic">Destination</p>
                          <p className="text-sm text-[var(--color-text-primary)] break-all">{instructions.destination || '-'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText('destination', instructions.destination)}
                          className="btn-press p-2 rounded-[8px] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:text-[var(--color-error)]"
                          title="Copy destination"
                        >
                          <ClipboardDocumentIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-gothic">Memo / note</p>
                          <p className="text-sm text-[var(--color-text-primary)] break-words">{instructions.memoExpected}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyText('memo', instructions.memoExpected)}
                          className="btn-press p-2 rounded-[8px] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] hover:text-[var(--color-error)]"
                          title="Copy memo"
                        >
                          <ClipboardDocumentIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {instructions.qrImageUrl && (
                      <img
                        src={instructions.qrImageUrl}
                        alt="Litecoin payment QR"
                        className="w-36 h-36 object-contain rounded-[8px] border border-[var(--color-border)] bg-white p-2"
                      />
                    )}
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {copiedKey ? 'Copied.' : 'After sending, the pending status updates here automatically when the provider confirms payment.'}
                    </p>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-[8px] overflow-hidden">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-gothic text-[var(--color-text-primary)]">Transaction History</h2>
                <p className="text-sm text-[var(--color-text-secondary)]">Top-ups, purchases, and owner decisions.</p>
              </div>
              <Link to="/" className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-error)]">Shop</Link>
            </div>
            {transactions.length === 0 ? (
              <p className="p-5 text-sm text-[var(--color-text-secondary)]">No wallet activity yet.</p>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {transactions.map((item) => (
                  <TransactionRow key={item.id} item={item} />
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
};

const CashAppPayPanel = ({ topupId, instructions, onComplete }) => {
  const [ready, setReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const buttonId = `cash-app-pay-${String(topupId || 'topup').replace(/[^a-zA-Z0-9_-]/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    let cashAppPay = null;

    const setup = async () => {
      setReady(false);
      setError('');
      setMessage('');
      const square = instructions?.square || {};
      if (!topupId || !square.applicationId || !square.locationId) {
        setError('Cash App Pay is not configured.');
        return;
      }

      try {
        const Square = await loadSquareScript(square.environment);
        if (!Square?.payments || cancelled) return;

        const payments = Square.payments(square.applicationId, square.locationId);
        const paymentRequest = payments.paymentRequest({
          countryCode: 'US',
          currencyCode: 'USD',
          total: {
            amount: Number(instructions.amount || 0).toFixed(2),
            label: 'NosMarket wallet top-up'
          }
        });

        cashAppPay = await payments.cashAppPay(paymentRequest, {
          redirectURL: window.location.href,
          referenceId: instructions.memoExpected || topupId
        });
        if (cancelled) return;

        cashAppPay.addEventListener('ontokenization', async (event) => {
          const tokenResult = event?.detail?.tokenResult || event?.detail?.result || event?.tokenResult || {};
          const sourceId = tokenResult.token || tokenResult.sourceId || '';
          if (String(tokenResult.status || '').toUpperCase() !== 'OK' || !sourceId) {
            setError(tokenResult.errors?.[0]?.message || 'Cash App did not return a payment token.');
            return;
          }

          setProcessing(true);
          setError('');
          setMessage('Confirming payment...');
          try {
            const { data } = await axios.post(`/api/shop/wallet/topup/square/${encodeURIComponent(topupId)}/complete`, {
              sourceId
            });
            if (data?.success) {
              setMessage('Cash App payment confirmed. Wallet balance updated.');
              await onComplete?.(data);
            } else {
              setMessage('Payment is pending provider confirmation. This page will update automatically.');
              await onComplete?.(data);
            }
          } catch (err) {
            setError(err.response?.data?.error || 'Could not confirm Cash App payment.');
          } finally {
            setProcessing(false);
          }
        });

        await cashAppPay.attach(`#${buttonId}`);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Could not load Cash App Pay.');
      }
    };

    setup();

    return () => {
      cancelled = true;
      if (cashAppPay?.destroy) {
        const result = cashAppPay.destroy();
        if (result?.catch) result.catch(() => {});
      }
    };
  }, [buttonId, instructions, onComplete, topupId]);

  return (
    <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-bg-main)] p-3 space-y-3">
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-secondary)] font-gothic">Cash App Pay</p>
        <p className="text-sm text-[var(--color-text-secondary)]">Approve the payment in Cash App. Your wallet is credited only after Square confirms payment.</p>
      </div>
      <div id={buttonId} className="min-h-[48px]" />
      {!ready && !error && <p className="text-xs text-[var(--color-text-secondary)]">Loading Cash App Pay...</p>}
      {processing && <p className="text-xs text-[var(--color-text-secondary)]">Processing...</p>}
      {message && <p className="text-xs text-[var(--color-success)]">{message}</p>}
      {error && <p className="text-xs text-[var(--color-error)]">{error}</p>}
    </div>
  );
};

const TransactionRow = ({ item }) => {
  const itemSummary = Array.isArray(item?.items)
    ? item.items
      .map((entry) => {
        const quantity = Number(entry?.quantity || 1);
        const name = String(entry?.name || '').trim();
        return name ? `${quantity}x ${name}` : '';
      })
      .filter(Boolean)
      .join(', ')
    : '';

  return (
    <div className="p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-[8px] border px-2 py-1 text-xs ${statusClass(item.status)}`}>
            {statusIcon(item.status)}
            {item.status}
          </span>
          <span className="text-sm font-gothic text-[var(--color-text-primary)]">
            {item.type === 'purchase' ? 'Purchase' : 'Top-up'} - {item.methodLabel}
          </span>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] mt-1">
          {item.referenceCode || item.orderId || item.txnId || '-'} - {formatDate(item.createdAt)}
        </p>
        {itemSummary && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-1 break-words">Items: {itemSummary}</p>
        )}
        {item.memoExpected && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-1 break-words">{item.memoExpected}</p>
        )}
      </div>
      <div className={`text-right font-gothic ${item.direction === 'credit' ? 'text-[var(--color-success)]' : 'text-[var(--color-error)]'}`}>
        {item.direction === 'credit' ? '+' : '-'}${Number(item.amount || 0).toFixed(2)}
      </div>
    </div>
  );
};

export default WalletPage;
