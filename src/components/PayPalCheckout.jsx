import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { base44 } from '@/api/base44Client';

const PAYPAL_CLIENT_ID = 'Adz5wY73h9nEH2eSHIOxR6GA_vD6bI7TykK_0dRsL3g5T7zBcQ1rbbF7naBDgd56ehUnfJi-U2fD-RfN';

export default function PayPalCheckout({ amount, packageId, packageName, packageSessions, sessionDurationMinutes, onSuccess }) {
  const createOrder = async () => {
    const res = await base44.functions.invoke('createPaypalOrder', {
      amount,
      packageId,
      packageName,
      packageSessions,
      sessionDurationMinutes,
    });
    return res.data.orderId;
  };

  const onApprove = async () => {
    // Payment approved — trigger credit grant in parent
    await onSuccess();
  };

  return (
    <PayPalScriptProvider options={{ clientId: PAYPAL_CLIENT_ID, currency: 'USD' }}>
      <PayPalButtons
        style={{ layout: 'vertical', color: 'blue', shape: 'rect', label: 'pay' }}
        createOrder={createOrder}
        onApprove={onApprove}
      />
    </PayPalScriptProvider>
  );
}