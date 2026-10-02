import { Order, OrderItem, Payment } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../../shared/enums/order.enum';
import { AuditAction } from '../../../shared/enums/audit.enum';
import { OrderRepository } from '../../../database/repositories/order.repository';
import { PaymentRepository } from '../../../database/repositories/payment.repository';
import { ProductRepository } from '../../../database/repositories/product.repository';
import { AuditRepository } from '../../../database/repositories/audit.repository';
import { BranchRepository } from '../../../database/repositories/branch.repository';
import { OrderCalculationService } from './order-calculation.service';
import { IRealtimeService } from '../realtime/realtime.interface';
import { IInventoryService } from '../inventory';
import { IPromotionsService, PromotionsService } from '../promotions';
import { D1PreparedStatementLike } from '../../../database/types';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../errors/app-error';
import {
  calculateOrderExpiresAt,
  assertValidOrderTransition,
  isTerminalOrderStatus,
  isOrderEditable,
} from '../../../shared/business-rules/order-rules';
import { OrderItemInput } from '../../../shared/contracts/order.contract';

export interface IOrdersService {
  getOrderById(branchId: string, orderId: string): Promise<{ order: Order; items: OrderItem[] } | null>;
  listOrders(branchId: string, limit?: number): Promise<Order[]>;
}

export const ORDERS_SERVICE_TOKEN = 'IOrdersService';

export interface CreateOrderOptions {
  actorUserId: string;
  branchId: string;
  customerUserId: string;
  items: OrderItemInput[];
  couponId?: string | null;
  couponCode?: string | null;
  offerId?: string | null;
}

export interface EditOrderOptions {
  actorUserId: string;
  orderId: string;
  items: OrderItemInput[];
}

export interface RecordPaymentOptions {
  actorUserId: string;
  orderId: string;
  branchId: string;
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

export interface VerifyPaymentOptions {
  actorUserId: string;
  paymentId: string;
  orderId: string;
  branchId?: string;
  notes?: string;
}

export class OrdersService implements IOrdersService {
  private calc = new OrderCalculationService();

  constructor(
    private orderRepo: OrderRepository,
    private paymentRepo?: PaymentRepository,
    private productRepo?: ProductRepository,
    private auditRepo?: AuditRepository,
    private branchRepo?: BranchRepository,
    private realtime?: IRealtimeService,
    private inventoryService?: IInventoryService,
    private promotionsService?: IPromotionsService,
  ) {}

  async getOrderById(branchId: string, orderId: string): Promise<{ order: Order; items: OrderItem[] } | null> {
    const order = await this.orderRepo.findByBranch(branchId, orderId);
    if (!order) return null;
    const items = await this.orderRepo.getOrderItems(orderId);
    return { order, items };
  }

  async listOrders(branchId: string, limit: number = 50): Promise<Order[]> {
    return this.orderRepo.listByBranch(branchId, limit);
  }

  async listOrdersByStatus(branchId: string, status?: OrderStatus, limit: number = 50): Promise<Order[]> {
    return this.orderRepo.listByBranchAndStatus(branchId, status, limit);
  }

  async getOrderDetail(orderId: string): Promise<{ order: Order; items: OrderItem[]; payments: Payment[] } | null> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) return null;
    const [items, payments] = await Promise.all([
      this.orderRepo.getOrderItems(orderId),
      this.paymentRepo ? this.paymentRepo.listByOrder(orderId) : Promise.resolve<Payment[]>([]),
    ]);
    return { order, items, payments };
  }

  async listCustomerOrders(customerUserId: string, limit: number = 50): Promise<Order[]> {
    return this.orderRepo.listByCustomer(customerUserId, limit);
  }

  async createOrder(opts: CreateOrderOptions): Promise<{ order: Order; items: OrderItem[]; expiresAt: string }> {
    if (!this.productRepo) throw new BadRequestError('ProductRepository is required to create orders');
    if (!this.branchRepo) throw new BadRequestError('BranchRepository is required to create orders');

    const branch = await this.branchRepo.findById(opts.branchId);
    if (!branch) throw new NotFoundError(`Branch ${opts.branchId} not found`);

    const settings = await this.branchRepo.getBranchSettings(opts.branchId);
    const expiryMinutes = settings?.order_expiry_minutes ?? 15;

    const allProducts = await this.productRepo.listByBranch(opts.branchId, true);
    const productsMap = new Map(allProducts.map((p) => [p.id, p]));

    // Step 1: Preliminary subtotal calculation
    const prelimTotals = this.calc.calculateTotals(opts.items, productsMap);
    const subtotal = prelimTotals.subtotal;

    const now = new Date();
    let couponDiscount = 0;
    let couponId = opts.couponId ?? null;
    let couponCode: string | null = opts.couponCode ?? null;
    let offerDiscount = 0;
    const offerId = opts.offerId ?? null;

    // Step 2: Server-side validation of promotions
    if (this.promotionsService) {
      if (opts.couponCode || opts.couponId) {
        let codeToValidate = opts.couponCode;
        if (!codeToValidate && opts.couponId) {
          const c = await this.promotionsService.getCouponById(opts.branchId, opts.couponId);
          codeToValidate = c?.code;
        }
        if (codeToValidate) {
          const val = await this.promotionsService.validateCoupon({
            branchId: opts.branchId,
            code: codeToValidate,
            subtotal,
            userId: opts.customerUserId,
            now,
          });
          if (!val.isValid) {
            throw new BadRequestError(val.reason ?? 'Invalid coupon code');
          }
          couponDiscount = val.discount;
          couponId = val.coupon?.id ?? couponId;
          couponCode = val.coupon?.code ?? codeToValidate;
        }
      }

      if (offerId) {
        const val = await this.promotionsService.validateOffer(opts.branchId, offerId, subtotal, now);
        if (!val.isValid) {
          throw new BadRequestError(val.reason ?? 'Invalid offer');
        }
        offerDiscount = val.discount;
      }
    }

    // Step 3: Authoritative totals calculation
    const { items: calcItems, discount, tax, total } = this.calc.calculateTotals(
      opts.items,
      productsMap,
      0.05,
      { offerDiscount, couponDiscount },
    );

    const expiresAt = calculateOrderExpiresAt(now, expiryMinutes);
    const orderId = `ord-${crypto.randomUUID()}`;
    const orderNumber = await this.orderRepo.generateNextOrderNumber(opts.branchId, branch.code);

    // Step 4: Persist pending order with promotion snapshots
    // NOTE: Inventory is NOT deducted at order creation. Coupon usage is NOT committed.
    const order = await this.orderRepo.create({
      id: orderId,
      order_number: orderNumber,
      branch_id: opts.branchId,
      customer_user_id: opts.customerUserId,
      status: OrderStatus.PENDING,
      subtotal,
      discount,
      tax,
      total,
      coupon_id: couponId,
      offer_id: offerId,
      coupon_code_snapshot: couponCode,
      coupon_discount_snapshot: couponDiscount,
      offer_discount_snapshot: offerDiscount,
      payment_status: PaymentStatus.PENDING,
      payment_method: null,
      placed_at: now.toISOString(),
      expires_at: expiresAt,
      items: calcItems,
    });

    const orderItems = await this.orderRepo.getOrderItems(orderId);

    await this.auditRepo?.log({
      branch_id: opts.branchId,
      actor_user_id: opts.actorUserId,
      action: AuditAction.ORDER_CREATED,
      entity_type: 'order',
      entity_id: orderId,
      metadata: {
        orderNumber,
        total,
        itemCount: calcItems.length,
        couponCode,
        couponDiscount,
        offerDiscount,
      },
    });

    await this.realtime?.publish({
      type: 'OrderStatusChanged',
      payload: {
        orderId,
        orderNumber,
        branchId: opts.branchId,
        customerUserId: opts.customerUserId,
        status: OrderStatus.PENDING,
        paymentStatus: PaymentStatus.PENDING,
        total,
        timestamp: now.toISOString(),
      },
    });

    return { order, items: orderItems, expiresAt };
  }

  async editOrder(opts: EditOrderOptions): Promise<{
    order: Order;
    items: OrderItem[];
    previousTotal: number;
    newTotal: number;
    paymentDifference: number;
    verifiedPaidAmount: number;
    additionalAmountRequired: number;
    overpaymentAmount: number;
  }> {
    if (!this.productRepo) throw new BadRequestError('ProductRepository is required to edit orders');

    const order = await this.orderRepo.findById(opts.orderId);
    if (!order) throw new NotFoundError(`Order ${opts.orderId} not found`);

    if (isTerminalOrderStatus(order.status)) {
      throw new BadRequestError(`Cannot edit order in terminal status: ${order.status}`);
    }

    const now = new Date();
    const settings = this.branchRepo ? await this.branchRepo.getBranchSettings(order.branch_id) : null;
    const editWindowMinutes = settings?.order_edit_window_minutes ?? 60;
    if (!isOrderEditable(order, editWindowMinutes, now)) {
      throw new BadRequestError('Order edit window has expired');
    }

    const previousItems = await this.orderRepo.getOrderItems(opts.orderId);
    const allProducts = await this.productRepo.listByBranch(order.branch_id, true);
    const productsMap = new Map(allProducts.map((p) => [p.id, p]));

    // Step 1: Preliminary totals
    const prelimTotals = this.calc.calculateTotals(opts.items, productsMap);
    const subtotal = prelimTotals.subtotal;

    let couponDiscount = 0;
    let couponId: string | null = order.coupon_id ?? null;
    let couponCode: string | null = order.coupon_code_snapshot ?? null;
    let offerDiscount = 0;
    const offerId: string | null = order.offer_id ?? null;

    // Step 2: Revalidate promotions against new subtotal
    if (this.promotionsService) {
      if (order.coupon_id || order.coupon_code_snapshot) {
        let code = order.coupon_code_snapshot;
        if (!code && order.coupon_id) {
          const c = await this.promotionsService.getCouponById(order.branch_id, order.coupon_id);
          code = c?.code ?? null;
        }
        if (code) {
          const val = await this.promotionsService.validateCoupon({
            branchId: order.branch_id,
            code,
            subtotal,
            userId: order.customer_user_id,
            now,
          });
          if (val.isValid) {
            couponDiscount = val.discount;
            couponId = val.coupon?.id ?? couponId;
            couponCode = val.coupon?.code ?? code;
          } else {
            // Invalidate coupon if new items no longer meet requirements (e.g. minimum order value)
            couponDiscount = 0;
            couponId = null;
            couponCode = null;
          }
        }
      }

      if (order.offer_id) {
        const val = await this.promotionsService.validateOffer(order.branch_id, order.offer_id, subtotal, now);
        if (val.isValid) {
          offerDiscount = val.discount;
        } else {
          offerDiscount = 0;
        }
      }
    }

    // Step 3: Authoritative totals with revalidated discounts
    const { items: newCalcItems, discount: newDiscount, tax, total: newTotal } = this.calc.calculateTotals(
      opts.items,
      productsMap,
      0.05,
      { offerDiscount, couponDiscount },
    );

    const previousTotal = order.total;
    const lastEditedAt = now.toISOString();

    // Authoritative calculation of verified payments from database
    const payments = this.paymentRepo ? await this.paymentRepo.listByOrder(opts.orderId) : [];
    const verifiedPaidAmount = payments
      .filter((p) => p.status === PaymentStatus.VERIFIED || p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);

    const editDiff = this.calc.calculateEditDifference(previousTotal, newTotal, verifiedPaidAmount);

    // Target payment status according to financial rules
    let targetPaymentStatus: PaymentStatus = order.payment_status;
    if (order.status === OrderStatus.CONFIRMED) {
      if (newTotal === verifiedPaidAmount) {
        targetPaymentStatus = PaymentStatus.VERIFIED;
      } else if (newTotal > verifiedPaidAmount) {
        targetPaymentStatus = PaymentStatus.PENDING;
      } else {
        targetPaymentStatus = PaymentStatus.VERIFIED;
      }
    } else {
      if (verifiedPaidAmount >= newTotal && newTotal > 0) {
        targetPaymentStatus = PaymentStatus.VERIFIED;
      } else if (verifiedPaidAmount > 0) {
        targetPaymentStatus = PaymentStatus.RECORDED;
      }
    }

    // Step 4: If order is CONFIRMED, calculate inventory delta statements!
    const extraStatements: D1PreparedStatementLike[] = [];
    if (order.status === OrderStatus.CONFIRMED && this.inventoryService) {
      const oldItemsList = previousItems.map((i) => ({ productId: i.product_id, quantity: i.quantity }));
      const newItemsList = newCalcItems.map((i) => ({ productId: i.product_id, quantity: i.quantity }));

      // Check positive deltas for stock availability
      const oldQtyMap = new Map<string, number>();
      for (const it of oldItemsList) {
        oldQtyMap.set(it.productId, (oldQtyMap.get(it.productId) ?? 0) + it.quantity);
      }
      const positiveDeltas: Array<{ productId: string; quantity: number }> = [];
      for (const it of newItemsList) {
        const oldQty = oldQtyMap.get(it.productId) ?? 0;
        if (it.quantity > oldQty) {
          positiveDeltas.push({ productId: it.productId, quantity: it.quantity - oldQty });
        }
      }

      if (positiveDeltas.length > 0) {
        const stockVal = await this.inventoryService.validateStockAvailability(order.branch_id, positiveDeltas);
        if (!stockVal.isAvailable) {
          throw new BadRequestError(`Cannot edit order: ${stockVal.errorMessage}`);
        }
      }

      const deltaInvStmts = await this.inventoryService.prepareOrderEditDeltaStatements({
        branchId: order.branch_id,
        orderId: opts.orderId,
        actorUserId: opts.actorUserId,
        oldItems: oldItemsList,
        newItems: newItemsList,
      });
      extraStatements.push(...deltaInvStmts);
    }

    const editCutoffIso = new Date(now.getTime() - editWindowMinutes * 60 * 1000).toISOString();
    const auditMetadata = {
      previousItems: previousItems.map((i) => ({
        productId: i.product_id,
        productName: i.product_name_snapshot,
        quantity: i.quantity,
        unitPrice: i.unit_price_snapshot,
        lineTotal: i.line_total,
      })),
      newItems: newCalcItems.map((i) => ({
        productId: i.product_id,
        productName: i.product_name_snapshot,
        quantity: i.quantity,
        unitPrice: i.unit_price_snapshot,
        lineTotal: i.line_total,
      })),
      previousTotal,
      newTotal,
      previousDiscount: order.discount,
      newDiscount,
      couponCode,
      couponDiscount,
      offerDiscount,
      verifiedPaidAmount,
      paymentDifference: editDiff.paymentDifference,
      additionalAmountRequired: editDiff.additionalAmountRequired,
      overpaymentAmount: editDiff.overpaymentAmount,
      actor: opts.actorUserId,
      timestamp: lastEditedAt,
    };

    // Atomic database mutation: item replacement, order totals, discount snapshots, payment status, inventory delta, and audit record in a single batch
    let updatedOrder: Order;
    try {
      updatedOrder = await this.orderRepo.atomicEditOrder({
        orderId: opts.orderId,
        branchId: order.branch_id,
        items: newCalcItems,
        subtotal,
        discount: newDiscount,
        tax,
        total: newTotal,
        couponId,
        offerId,
        couponCodeSnapshot: couponCode,
        couponDiscountSnapshot: couponDiscount,
        offerDiscountSnapshot: offerDiscount,
        paymentStatus: targetPaymentStatus,
        lastEditedAt,
        nowIso: lastEditedAt,
        editCutoffIso,
        auditLog: {
          id: `aud-${crypto.randomUUID()}`,
          branchId: order.branch_id,
          actorUserId: opts.actorUserId,
          action: AuditAction.ORDER_EDITED,
          metadata: auditMetadata,
        },
        extraStatements,
      });
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Order edit failed');
    }

    const updatedItems = await this.orderRepo.getOrderItems(opts.orderId);

    // Realtime events emitted strictly AFTER atomic commit
    await this.realtime?.publish({
      type: 'OrderUpdated',
      payload: {
        orderId: opts.orderId,
        branchId: order.branch_id,
        customerUserId: order.customer_user_id,
        itemsCount: newCalcItems.length,
        newTotal,
        timestamp: lastEditedAt,
      },
    });

    await this.realtime?.publish({
      type: 'OrderStatusChanged',
      payload: {
        orderId: opts.orderId,
        orderNumber: order.order_number,
        branchId: order.branch_id,
        customerUserId: order.customer_user_id,
        status: updatedOrder.status,
        paymentStatus: updatedOrder.payment_status,
        total: newTotal,
        timestamp: lastEditedAt,
      },
    });

    if (order.status === OrderStatus.CONFIRMED && this.inventoryService) {
      await this.auditRepo?.log({
        branch_id: order.branch_id,
        actor_user_id: opts.actorUserId,
        action: AuditAction.INVENTORY_ADJUSTED,
        entity_type: 'inventory',
        entity_id: opts.orderId,
        metadata: {
          orderId: opts.orderId,
          deltaType: 'order_edit',
          previousTotal,
          newTotal,
        },
      });
    }

    return {
      order: updatedOrder,
      items: updatedItems,
      previousTotal,
      newTotal,
      paymentDifference: editDiff.paymentDifference,
      verifiedPaidAmount,
      additionalAmountRequired: editDiff.additionalAmountRequired,
      overpaymentAmount: editDiff.overpaymentAmount,
    };
  }

  async updateOrderStatus(actorUserId: string, orderId: string, nextStatus: OrderStatus): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError(`Order ${orderId} not found`);

    assertValidOrderTransition(order.status, nextStatus);

    if (nextStatus === OrderStatus.CONFIRMED) {
      throw new BadRequestError(
        'Order confirmation requires verified payment and must be performed via the confirmation endpoint (POST /confirm).',
      );
    }

    if (order.status === OrderStatus.PENDING && nextStatus !== OrderStatus.CANCELLED) {
      throw new BadRequestError(
        'Invalid order status transition: pending orders can only be confirmed via /confirm with verified payment or cancelled.',
      );
    }

    const extra: { confirmed_at?: string; completed_at?: string; cancelled_at?: string } = {};
    const now = new Date().toISOString();
    if (nextStatus === OrderStatus.COMPLETED) extra.completed_at = now;
    if (nextStatus === OrderStatus.CANCELLED) extra.cancelled_at = now;

    const updated = await this.orderRepo.updateStatus(orderId, nextStatus, extra);

    const auditAction = nextStatus === OrderStatus.CANCELLED
      ? AuditAction.ORDER_CANCELLED
      : (nextStatus === OrderStatus.COMPLETED ? AuditAction.ORDER_COMPLETED : AuditAction.ORDER_STATUS_CHANGED);

    await this.auditRepo?.log({
      branch_id: order.branch_id,
      actor_user_id: actorUserId,
      action: auditAction,
      entity_type: 'order',
      entity_id: orderId,
      metadata: { previousStatus: order.status, nextStatus },
    });

    await this.realtime?.publish({
      type: 'OrderStatusChanged',
      payload: {
        orderId,
        orderNumber: order.order_number,
        branchId: order.branch_id,
        customerUserId: order.customer_user_id,
        status: nextStatus,
        paymentStatus: order.payment_status,
        total: order.total,
        timestamp: now,
      },
    });

    return updated;
  }

  async confirmOrder(actorUserId: string, orderId: string): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError(`Order ${orderId} not found`);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestError(`Cannot confirm order in status ${order.status}. Must be PENDING.`);
    }

    if (order.payment_status !== PaymentStatus.VERIFIED && order.payment_status !== PaymentStatus.COMPLETED) {
      throw new BadRequestError(
        `Order cannot be confirmed. Payment status is ${order.payment_status}. Payment must be VERIFIED first.`,
      );
    }

    const payments = this.paymentRepo ? await this.paymentRepo.listByOrder(orderId) : [];
    const verifiedPaid = payments
      .filter((p) => p.status === PaymentStatus.VERIFIED || p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);

    if (verifiedPaid < order.total) {
      throw new BadRequestError(
        `Cannot confirm order: verified payment amount (₹${verifiedPaid.toFixed(2)}) is less than order total (₹${order.total.toFixed(2)}).`,
      );
    }

    const now = new Date();
    if (now >= new Date(order.expires_at)) {
      throw new BadRequestError('Cannot confirm expired order');
    }

    const nowIso = now.toISOString();
    const orderItems = await this.orderRepo.getOrderItems(orderId);
    const extraStatements: D1PreparedStatementLike[] = [];

    // Step 1: Validate stock availability and prepare atomic inventory deduction statements
    if (this.inventoryService) {
      const itemsList = orderItems.map((i) => ({ productId: i.product_id, quantity: i.quantity }));
      const stockValidation = await this.inventoryService.validateStockAvailability(order.branch_id, itemsList);
      if (!stockValidation.isAvailable) {
        throw new BadRequestError(stockValidation.errorMessage ?? 'Insufficient stock for order confirmation');
      }

      const invStmts = await this.inventoryService.prepareOrderConfirmationStatements({
        branchId: order.branch_id,
        orderId,
        actorUserId,
        items: itemsList,
      });
      extraStatements.push(...invStmts);
    }

    // Step 2: Atomic coupon usage and limit increment
    if (order.coupon_id && this.promotionsService) {
      const coupon = await this.promotionsService.getCouponById(order.branch_id, order.coupon_id);
      if (!coupon || !coupon.active) {
        throw new BadRequestError('Coupon is no longer active');
      }

      // Revalidate all coupon usage constraints (total, per-user, daily) at confirmation time
      const val = await this.promotionsService.validateCoupon({
        branchId: order.branch_id,
        code: coupon.code,
        subtotal: order.subtotal,
        userId: order.customer_user_id,
        now,
      });
      if (!val.isValid) {
        throw new BadRequestError(`Cannot confirm order: Coupon usage limit reached (${val.reason})`);
      }

      const promoRepo = (this.promotionsService as PromotionsService).getPromotionRepo?.();
      if (promoRepo) {
        const usageId = `cu-${crypto.randomUUID()}`;
        const discountAmount = order.coupon_discount_snapshot ?? order.discount;
        extraStatements.push(
          promoRepo.prepareCouponIncrementStatement(order.coupon_id, nowIso),
          promoRepo.prepareCouponUsageStatement(
            usageId,
            order.coupon_id,
            order.customer_user_id,
            orderId,
            discountAmount,
            nowIso,
          ),
        );
      }
    }

    // Step 3: Atomic execution in D1 batch: order confirmation + stock deduction + movements + coupon usage + audit
    let updated: Order;
    try {
      updated = await this.orderRepo.confirmOrderConditionally(
        orderId,
        nowIso,
        {
          id: `aud-${crypto.randomUUID()}`,
          branchId: order.branch_id,
          actorUserId,
          action: AuditAction.ORDER_CONFIRMED,
          metadata: { confirmedAt: nowIso, previousStatus: order.status },
        },
        extraStatements,
      );
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Confirmation failed');
    }

    // Audit logging for Phase 4 coupon application and inventory consumption
    if (order.coupon_id) {
      await this.auditRepo?.log({
        branch_id: order.branch_id,
        actor_user_id: actorUserId,
        action: AuditAction.COUPON_APPLIED,
        entity_type: 'coupon',
        entity_id: order.coupon_id,
        metadata: { orderId, discountAmount: order.coupon_discount_snapshot ?? order.discount },
      });
    }

    if (this.inventoryService && orderItems.length > 0) {
      await this.auditRepo?.log({
        branch_id: order.branch_id,
        actor_user_id: actorUserId,
        action: AuditAction.INVENTORY_CONSUMED,
        entity_type: 'inventory',
        entity_id: orderId,
        metadata: { orderId, itemCount: orderItems.length },
      });
    }

    // Step 4: Publish realtime events strictly after authoritative commit
    await this.realtime?.publish({
      type: 'OrderStatusChanged',
      payload: {
        orderId,
        orderNumber: updated.order_number,
        branchId: updated.branch_id,
        customerUserId: updated.customer_user_id,
        status: OrderStatus.CONFIRMED,
        paymentStatus: updated.payment_status,
        total: updated.total,
        timestamp: nowIso,
      },
    });

    return updated;
  }

  async recordPayment(opts: RecordPaymentOptions): Promise<{ payment: Payment; order: Order }> {
    if (!this.paymentRepo) throw new BadRequestError('PaymentRepository is required for payments');

    const order = await this.orderRepo.findById(opts.orderId);
    if (!order) throw new NotFoundError(`Order ${opts.orderId} not found`);

    if (order.branch_id !== opts.branchId) {
      throw new ForbiddenError('Order belongs to a different branch');
    }

    if (isTerminalOrderStatus(order.status)) {
      throw new BadRequestError(`Cannot record payment for order in status ${order.status}`);
    }

    const now = new Date();
    if (new Date(order.expires_at) <= now || order.status === OrderStatus.EXPIRED) {
      throw new BadRequestError('Cannot record payment for expired order');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestError('Cannot record payment for cancelled order');
    }

    if (!opts.amount || typeof opts.amount !== 'number' || opts.amount <= 0) {
      throw new BadRequestError('Payment amount must be greater than zero');
    }

    // Determine current verified payments to calculate exact payable amount
    const payments = await this.paymentRepo.listByOrder(opts.orderId);
    const verifiedPaid = payments
      .filter((p) => p.status === PaymentStatus.VERIFIED || p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);

    const payableAmount = Math.round((order.total - verifiedPaid) * 100) / 100;
    if (payableAmount <= 0) {
      throw new BadRequestError('Order is already fully paid');
    }

    const roundedPaymentAmount = Math.round(opts.amount * 100) / 100;
    if (roundedPaymentAmount !== payableAmount) {
      throw new BadRequestError(
        `Payment amount ₹${roundedPaymentAmount} does not match required payable amount ₹${payableAmount}`,
      );
    }

    const paymentId = `pay-${crypto.randomUUID()}`;
    const { payment } = await this.paymentRepo.recordPaymentAtomically(
      {
        id: paymentId,
        order_id: opts.orderId,
        branch_id: opts.branchId,
        method: opts.method,
        amount: roundedPaymentAmount,
        status: PaymentStatus.RECORDED,
      },
      {
        id: `aud-${crypto.randomUUID()}`,
        branchId: opts.branchId,
        actorUserId: opts.actorUserId,
        action: AuditAction.PAYMENT_RECORDED,
        metadata: {
          paymentId,
          orderId: opts.orderId,
          amount: roundedPaymentAmount,
          method: opts.method,
          previousStatus: PaymentStatus.PENDING,
          newStatus: PaymentStatus.RECORDED,
          actor: opts.actorUserId,
          notes: opts.notes ?? null,
        },
      },
    );

    const updatedOrder = (await this.orderRepo.findById(opts.orderId))!;

    await this.realtime?.publish({
      type: 'PaymentUpdated',
      payload: {
        orderId: opts.orderId,
        branchId: opts.branchId,
        paymentId,
        amount: roundedPaymentAmount,
        status: PaymentStatus.RECORDED,
        timestamp: now.toISOString(),
      },
    });

    return { payment, order: updatedOrder };
  }

  async verifyPayment(opts: VerifyPaymentOptions): Promise<{ payment: Payment; order: Order }> {
    if (!this.paymentRepo) throw new BadRequestError('PaymentRepository is required for payment verification');

    const payment = await this.paymentRepo.findById(opts.paymentId);
    if (!payment) throw new NotFoundError(`Payment ${opts.paymentId} not found`);
    if (payment.order_id !== opts.orderId) {
      throw new ForbiddenError('Payment does not belong to the specified order');
    }
    if (opts.branchId && payment.branch_id !== opts.branchId) {
      throw new ForbiddenError('Payment does not belong to the specified branch');
    }

    const order = await this.orderRepo.findById(opts.orderId);
    if (!order) throw new NotFoundError(`Order ${opts.orderId} not found`);

    if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) {
      throw new BadRequestError(`Cannot verify payment for order in ${order.status} status`);
    }

    // Idempotent duplicate verification check
    if (payment.status === PaymentStatus.VERIFIED || payment.status === PaymentStatus.COMPLETED) {
      return { payment, order };
    }

    if (payment.status !== PaymentStatus.RECORDED) {
      throw new BadRequestError(`Payment in status ${payment.status} cannot be verified`);
    }

    const now = new Date().toISOString();
    const { payment: updatedPayment, wasUpdated } = await this.paymentRepo.verifyPaymentAtomically(
      opts.paymentId,
      opts.orderId,
      opts.actorUserId,
      now,
      opts.branchId,
      {
        id: `aud-${crypto.randomUUID()}`,
        branchId: payment.branch_id,
        actorUserId: opts.actorUserId,
        action: AuditAction.PAYMENT_VERIFIED,
        metadata: {
          paymentId: opts.paymentId,
          orderId: opts.orderId,
          amount: payment.amount,
          method: payment.method,
          previousStatus: payment.status,
          newStatus: PaymentStatus.VERIFIED,
          actor: opts.actorUserId,
          notes: opts.notes ?? null,
        },
      },
    );

    const updatedOrder = (await this.orderRepo.findById(opts.orderId))!;

    if (!wasUpdated) {
      if (updatedPayment.status === PaymentStatus.RECORDED) {
        if (updatedOrder.status === OrderStatus.EXPIRED || new Date(updatedOrder.expires_at).getTime() <= new Date(now).getTime()) {
          throw new BadRequestError('Cannot verify payment: order has expired');
        }
        if (updatedOrder.status === OrderStatus.CANCELLED) {
          throw new BadRequestError('Cannot verify payment: order is cancelled');
        }
        throw new BadRequestError('Payment verification failed');
      }
    }

    if (wasUpdated) {
      await this.realtime?.publish({
        type: 'PaymentUpdated',
        payload: {
          orderId: opts.orderId,
          branchId: payment.branch_id,
          paymentId: opts.paymentId,
          amount: payment.amount,
          status: PaymentStatus.VERIFIED,
          timestamp: now,
        },
      });
    }

    return { payment: updatedPayment, order: updatedOrder };
  }
}
