import { createAuthInfrastructure, AuthFactoryOptions } from '../factories/auth.factory';
import { UserRepository } from '../../database/repositories/user.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { BranchRepository } from '../../database/repositories/branch.repository';
import { PromotionRepository } from '../../database/repositories/promotion.repository';
import { DiscountType } from '../../shared/enums/promotions.enum';
import { successResponse } from '../serializers/response';
import { handleApiError } from '../middleware/error-handler';
import { requireOwner } from '../../backend/policies/role.policy';
import { handleCorsPreflight, getCorsHeaders } from '../middleware/cors';
import { config } from '../../config/runtime';
import { D1DatabaseLike } from '../../database/types';
import { BadRequestError } from '../../backend/errors/app-error';

export interface MarketingCustomerDto {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  totalOrders: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  firstOrderAt: string | null;
  category: 'VIP' | 'FREQUENT' | 'REGULAR' | 'DORMANT';
  estimatedAgeGroup?: string;
}

/**
 * GET /api/v1/owner/marketing/customers
 * Aggregated customers with time-range order stats and categorization.
 */
export async function handleOwnerMarketingCustomersRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    requireOwner(userContext);

    const url = new URL(request.url);
    const range = url.searchParams.get('range') || '30d'; // 7d, 30d, 90d, 180d, 365d, all
    const category = url.searchParams.get('category') || 'ALL'; // ALL, VIP, FREQUENT, REGULAR, DORMANT
    const branchId = url.searchParams.get('branchId') || 'ALL';
    const minSpentParam = url.searchParams.get('minSpent');
    const minSpent = minSpentParam ? parseFloat(minSpentParam) : 0;

    let startDate: string | undefined;
    const now = new Date();

    switch (range) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '180d':
        startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '365d':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case 'all':
      default:
        startDate = undefined;
        break;
    }

    const userRepo = new UserRepository(db);
    const rawCustomers = await userRepo.getCustomersWithOrderStats({
      startDate,
      branchId: branchId === 'ALL' ? undefined : branchId,
    });

    // Categorization logic based on spending & frequency
    const categorizedCustomers: MarketingCustomerDto[] = rawCustomers.map((c) => {
      let cat: 'VIP' | 'FREQUENT' | 'REGULAR' | 'DORMANT' = 'REGULAR';

      if (c.totalSpent >= 1000 || c.totalOrders >= 5) {
        cat = 'VIP';
      } else if (c.totalOrders >= 3) {
        cat = 'FREQUENT';
      } else if (c.totalOrders === 0) {
        cat = 'DORMANT';
      } else {
        cat = 'REGULAR';
      }

      // Demographic age group simulation based on customer ID hash for testing/preview
      const hash = c.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      const ageGroups = ['18-24', '25-34', '35-49', '50+'];
      const estimatedAgeGroup = ageGroups[hash % ageGroups.length];

      return {
        ...c,
        category: cat,
        estimatedAgeGroup,
      };
    });

    // Apply category & minimum spend filters
    const filtered = categorizedCustomers.filter((c) => {
      if (category !== 'ALL' && c.category !== category) return false;
      if (minSpent > 0 && c.totalSpent < minSpent) return false;
      return true;
    });

    const totalRevenue = filtered.reduce((sum, c) => sum + c.totalSpent, 0);
    const totalOrders = filtered.reduce((sum, c) => sum + c.totalOrders, 0);
    const activeCount = filtered.filter((c) => c.totalOrders > 0).length;
    const vipCount = filtered.filter((c) => c.category === 'VIP').length;

    return successResponse(
      {
        customers: filtered,
        summary: {
          totalCount: filtered.length,
          activeCount,
          vipCount,
          totalRevenue,
          totalOrders,
          avgSpendPerCustomer: filtered.length > 0 ? Number((totalRevenue / filtered.length).toFixed(2)) : 0,
        },
        filters: { range, category, branchId, minSpent },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}

/**
 * POST /api/v1/owner/marketing/broadcast
 * Execute or record a simulated multi-channel broadcast (WhatsApp, Email, SMS) with/without images.
 */
export async function handleOwnerMarketingBroadcastRoute(
  request: Request,
  env?: { DB?: D1DatabaseLike },
  options: AuthFactoryOptions = {},
): Promise<Response> {
  const preflight = handleCorsPreflight(request, config.allowedOrigins);
  if (preflight) return preflight;

  const corsHeaders = getCorsHeaders(request, config.allowedOrigins);

  try {
    const { db, authMiddleware } = createAuthInfrastructure(env, options);
    const userContext = await authMiddleware.authenticateRequest(request, { requireSession: false });
    requireOwner(userContext);

    const body = (await request.json()) as {
      channel: 'WHATSAPP' | 'EMAIL' | 'SMS';
      recipients: Array<{
        userId: string;
        name: string;
        phone?: string | null;
        email?: string | null;
        message: string;
        imageUrl?: string | null;
      }>;
      messageTemplate?: string;
      imageUrl?: string | null;
      filtersApplied?: Record<string, unknown>;
      branchId?: string;
      promoCoupon?: {
        enabled: boolean;
        code: string;
        title?: string;
        discountType: 'PERCENTAGE' | 'FIXED';
        discountValue: number;
        minOrderValue?: number;
        maxDiscount?: number | null;
        expiryDays?: number;
      };
    };

    if (!body.channel || !Array.isArray(body.recipients) || body.recipients.length === 0) {
      throw new BadRequestError('channel and at least one recipient are required');
    }

    const branchRepo = new BranchRepository(db);
    const branches = await branchRepo.listAll();
    const effectiveBranchId = body.branchId && body.branchId !== 'ALL'
      ? body.branchId
      : (branches[0]?.id || 'branch-alpha');

    const campaignId = `camp-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    // 1. Insert campaign into messaging_campaigns table
    await db
      .prepare(`
        INSERT INTO messaging_campaigns (
          id, branch_id, created_by, audience_type, filters_json, message_body, status, simulated_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'SENT', ?, ?)
      `)
      .bind(
        campaignId,
        effectiveBranchId,
        userContext.userId,
        `BROADCAST_${body.channel}`,
        JSON.stringify(body.filtersApplied ?? {}),
        body.messageTemplate || body.recipients[0]?.message || 'Marketing message',
        body.recipients.length,
        nowIso,
      )
      .run();

    // 2. Assign private coupons if requested
    let promoResult: { createdCouponCount: number; assignedCount: number } | null = null;
    if (body.promoCoupon?.enabled && body.promoCoupon?.code?.trim()) {
      const promoRepo = new PromotionRepository(db);
      const recipientUserIds = body.recipients.map((r) => r.userId);
      const expiryIso = new Date(
        Date.now() + (body.promoCoupon.expiryDays || 14) * 24 * 60 * 60 * 1000
      ).toISOString();

      promoResult = await promoRepo.assignPrivateCouponToUsers({
        userIds: recipientUserIds,
        couponCode: body.promoCoupon.code.trim().toUpperCase(),
        title: body.promoCoupon.title || `Special Deal ${body.promoCoupon.code.trim().toUpperCase()}`,
        discountType: (body.promoCoupon.discountType as DiscountType) || DiscountType.PERCENTAGE,
        discountValue: body.promoCoupon.discountValue || 10,
        minOrderValue: body.promoCoupon.minOrderValue || 0,
        maxDiscount: body.promoCoupon.maxDiscount ?? null,
        branchId: effectiveBranchId,
        expiresAt: expiryIso,
        campaignId,
      });
    }

    // 3. Log to audit repository
    const auditRepo = new AuditRepository(db);
    await auditRepo.log({
      branch_id: effectiveBranchId,
      actor_user_id: userContext.userId,
      actor_type: 'USER',
      action: 'MARKETING_BROADCAST_SENT' as any,
      entity_type: 'campaign',
      entity_id: campaignId,
      metadata: {
        channel: body.channel,
        recipientCount: body.recipients.length,
        hasImage: Boolean(body.imageUrl || body.recipients.some((r) => Boolean(r.imageUrl))),
        imageUrl: body.imageUrl ?? null,
        promoAttached: Boolean(promoResult),
        couponCode: body.promoCoupon?.code ?? null,
      },
    });

    // 4. Generate clickable action previews with recipient-specific images
    const previews = body.recipients.slice(0, 10).map((r) => {
      const cleanPhone = (r.phone || '919876543210').replace(/[^0-9]/g, '');
      const recipientImage = r.imageUrl || body.imageUrl;
      const formattedMessage = recipientImage
        ? `${r.message}\n\n[Promo Banner: ${recipientImage}]`
        : r.message;
      const encodedMsg = encodeURIComponent(formattedMessage);

      let actionUrl = '';
      if (body.channel === 'WHATSAPP') {
        actionUrl = `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
      } else if (body.channel === 'EMAIL') {
        actionUrl = `mailto:${r.email || ''}?subject=${encodeURIComponent('Special Treat from IceCream Melt!')}&body=${encodedMsg}`;
      } else {
        actionUrl = `sms:${cleanPhone}?body=${encodedMsg}`;
      }

      return {
        userId: r.userId,
        name: r.name,
        phone: r.phone,
        email: r.email,
        imageUrl: recipientImage || null,
        actionUrl,
      };
    });

    return successResponse(
      {
        campaignId,
        channel: body.channel,
        dispatchedCount: body.recipients.length,
        hasImage: Boolean(body.imageUrl || body.recipients.some((r) => Boolean(r.imageUrl))),
        imageUrl: body.imageUrl ?? null,
        promoAssigned: promoResult,
        previews,
        timestamp: nowIso,
        status: 'SUCCESS',
      },
      201,
      corsHeaders,
    );
  } catch (error) {
    return handleApiError(error, corsHeaders);
  }
}
