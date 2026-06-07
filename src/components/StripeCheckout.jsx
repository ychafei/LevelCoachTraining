import { useState } from 'react';
import { rpc } from '@/lib/rpc';
import { Button } from '@/components/ui/button';
import { CreditCard, ShieldCheck } from 'lucide-react';

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
        ...extraPayload,
      });
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        const diag = res.data?.diagnostics?.join(' | ') || '';
        const errMsg = res.data?.error || 'No URL returned';
        setError(`Stripe error: ${errMsg}${diag ? ' — Debug: ' + diag : ''}`);
      }
    } catch (err) {
      const detail = err?.data?.detail || err?.data?.stripe_error || err?.data?.error || err?.message || 'Unknown error';
      setError(`Payment failed: ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {error && <p className="text-destructive text-sm mb-3">{error}</p>}
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
