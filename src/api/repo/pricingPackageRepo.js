import { makeRepo } from '@/api/repoFactory';
import { COL } from '@/api/appwriteClient';

export const pricingPackageRepo = makeRepo(COL.PricingPackage);
