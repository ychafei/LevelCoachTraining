import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

export default function StripeCheckout({ amount, packageId, packageName, packageSessions, sessionDurationMinutes, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('createStripeCheckout', {
        amount,
        packageId,
        packageName,
        packageSessions,
        sessionDurationMinutes,
      });
      if (res.data?.url) {
        // Redirect to Stripe's hosted checkout page
        window.location.href = res.data.url;
      } else {
        setError('Could not start checkout. Please try again.');
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
        className="w-full bg-[#635BFF] text-white font-oswald tracking-wider uppercase hover:bg-[#5851DB] h-12 text-sm"
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
