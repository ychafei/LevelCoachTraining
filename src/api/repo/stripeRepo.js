import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const stripeConnectedAccountRepo = makeRepo(COL.StripeConnectedAccount);
export const stripePaymentRecordRepo = makeRepo(COL.StripePaymentRecord);
export const stripeTransferRecordRepo = makeRepo(COL.StripeTransferRecord);
export const stripeWebhookEventRepo = makeRepo(COL.StripeWebhookEvent);
