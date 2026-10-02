import { NextRequest } from 'next/server';
import { handleCustomerCouponsRoute } from '@/api/routes/customer-coupons.route';

export async function GET(request: NextRequest) {
  return handleCustomerCouponsRoute(request);
}
