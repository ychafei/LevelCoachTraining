import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { useState } from 'react';
import { base44 } from '@/api/base44Client';

const PAYPAL_CLIENT_ID = 'Adz5wY73h9nEH2eSHIOxR6GA_vD6bI7TykK_0dRsL3g5T7zBcQ1rbbF7naBDgd56ehUnfJi-U2fD-RfN';

export default function PayPalCheckout({ amount, packageId, packageName, packageSessions, sessionDurationMinutes, onSuccess }) {
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);

  const createOrder = async () => {
    setError(null);
    const res = await base44.functions.invoke('createPaypalOrder', {
      amount,
      packageId,
      packageName,
      packageSessions,
      sessionDurationMinutes,
    });
    if (!res.data.orderId) throw new Error('Could not create PayPal order');
    return res.data.orderId;
  };

  const onApprove = async (data) => {
    setProcessing(true);
    setError(null);
    await base44.functions.invoke('capturePaypalOrder', { orderId: data.orderID });
    await onSuccess();
    setProcessing(false);
  };

  const onError = (err) => {
    console.error('PayPal error:', err);
    setError('Payment failed. Please try again.');
    setProcessing(false);
  };

  return (
    <PayPalScriptProvider options={{
      clientId: PAYPAL_CLIENT_ID,
      currency: 'USD',
      intent: 'capture',
      components: 'buttons',
      'enable-funding': 'venmo,paylater',
    }}>
      {error && <p className="text-destructive text-sm mb-3">{error}</p>}
      {processing && <p className="text-muted-foreground text-sm mb-3">Processing payment...</p>}
      <PayPalButtons
        style={{ layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 48 }}
        createOrder={createOrder}
        onApprove={onApprove}
        onError={onError}
        onCancel={() => setError('Payment cancelled. Please try again.')}
        forceReRender={[amount]}
      />
    </PayPalScriptProvider>
  );
}