import { useState } from 'react';
import { rpc } from '@/lib/rpc';
import { Button } from '@/components/ui/button';
import { CreditCard, ShieldCheck } from 'lucide-react';

// The server computes the charge amount from pricing_packages — the client
// never sends a price. Strip any price-shaped keys from extraPayload so a
// caller can't accidentally (or deliberately) pass client-computed money.
const PRICE_KEY_RE = /price|amount|cents|total|fee|discount/i;

function sanitizeExtraPayload(extraPayload) {
  return Object.fromEntries(
    Object.entries(extraPayload || {}).filter(([key]) => !PRICE_KEY_RE.test(key)),
  );
}

export default function StripeCheckout({
  packageId,
  coachId,
  sessionDurationMinutes,
  disabled = false,
  extraPayload = {},
  onBeforeCheckout,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      if (onBeforeCheckout) await onBeforeCheckout();
      const res = await rpc.invoke('createStripeCheckout', {
        packageId,
        coachId,
        sessionDurationMinutes,
        ...sanitizeExtraPayload(extraPayload),
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        setError(res.data?.error || 'Stripe did not return a checkout link. Please try again.');
      }
    } catch (err) {
      // Server validation messages are user-friendly — surface them verbatim
      // (e.g. "Coach is not ready to accept payments yet.").
      setError(err?.data?.error || err?.message || 'Payment could not be started. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && (
        <p role="alert" className="text-destructive text-sm mb-3">{error}</p>
      )}
      <Button
        onClick={handleClick}
        disabled={loading || disabled}
        className="w-full bg-[#635BFF] text-white font-display tracking-wider uppercase hover:bg-[#5851DB] h-12 text-sm"
      >
        <CreditCard className="w-4 h-4 mr-2" />
        {loading ? 'Redirecting...' : 'Continue to Stripe Checkout'}
      </Button>
      <p className="text-xs text-muted-foreground text-center mt-2">
        <ShieldCheck className="inline h-3 w-3 mr-1" />
        Cards, wallets, and Link. Credits activate only after Stripe's verified webhook.
      </p>
    </div>
  );
}
