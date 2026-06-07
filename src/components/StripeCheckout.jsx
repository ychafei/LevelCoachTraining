import { useState } from 'react';
import { rpc } from '@/lib/rpc';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

export default function StripeCheckout({ amount, packageId, packageName, packageSessions, sessionDurationMinutes, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await rpc.invoke('createStripeCheckout', {
        amount,
        packageId,
        packageName,
        packageSessions,
        sessionDurationMinutes,
      });
      console.log('Stripe response:', JSON.stringify(res.data));
      if (res.data?.url) {
        window.location.href = res.data.url;
      } else {
        const diag = res.data?.diagnostics?.join(' | ') || '';
        const errMsg = res.data?.error || 'No URL returned';
        setError(`Stripe error: ${errMsg}${diag ? ' — Debug: ' + diag : ''}`);
      }
    } catch (err) {
      const detail = err?.response?.data?.stripe_error || err?.response?.data?.error || err?.message || 'Unknown error';
      console.error('Stripe checkout error detail:', detail, err?.response?.data);
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
        disabled={loading}
        className="w-full bg-[#635BFF] text-white font-display tracking-wider uppercase hover:bg-[#5851DB] h-12 text-sm"
      >
        <CreditCard className="w-4 h-4 mr-2" />
        {loading ? 'Redirecting...' : 'Pay with Card'}
      </Button>
      <p className="text-xs text-muted-foreground text-center mt-2">
        Also accepts Apple Pay, Google Pay & Link
      </p>
    </div>
  );
}
