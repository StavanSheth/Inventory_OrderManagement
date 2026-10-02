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

    const { items: calcItems, subtotal, discount, tax, total } = this.calc.calculateTotals(opts.items, productsMap);

    const now = new Date();
    const expiresAt = calculateOrderExpiresAt(now, expiryMinutes);
    const orderId = `ord-${crypto.randomUUID()}`;
    const orderNumber = await this.orderRepo.generateNextOrderNumber(opts.branchId, branch.code);

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
      coupon_id: opts.couponId ?? null,
      offer_id: null,
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
      metadata: { orderNumber, total, itemCount: calcItems.length },
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

    const { items: newCalcItems, subtotal, tax, total: newTotal } = this.calc.calculateTotals(opts.items, productsMap);
    const previousTotal = order.total;
    const lastEditedAt = now.toISOString();

    // Authoritative calculation of verified payments from database
    const payments = this.paymentRepo ? await this.paymentRepo.listByOrder(opts.orderId) : [];
    const verifiedPaidAmount = payments
      .filter((p) => p.status === PaymentStatus.VERIFIED || p.status === PaymentStatus.COMPLETED)
      .reduce((sum, p) => sum + p.amount, 0);

    const editDiff = this.calc.calculateEditDifference(previousTotal, newTotal, verifiedPaidAmount);

    // Determine target payment status according to financial rules
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
      verifiedPaidAmount,
      paymentDifference: editDiff.paymentDifference,
      additionalAmountRequired: editDiff.additionalAmountRequired,
      overpaymentAmount: editDiff.overpaymentAmount,
      actor: opts.actorUserId,
      timestamp: lastEditedAt,
    };

    // Atomic database mutation: item replacement, order totals, payment status, and audit record in a single batch
    let updatedOrder: Order;
    try {
      updatedOrder = await this.orderRepo.atomicEditOrder({
        orderId: opts.orderId,
        branchId: order.branch_id,
        items: newCalcItems,
        subtotal,
        tax,
        total: newTotal,
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
    let updated: Order;
    try {
      updated = await this.orderRepo.confirmOrderConditionally(orderId, nowIso, {
        id: `aud-${crypto.randomUUID()}`,
        branchId: order.branch_id,
        actorUserId,
        action: AuditAction.ORDER_CONFIRMED,
        metadata: { confirmedAt: nowIso, previousStatus: order.status },
      });
    } catch (err) {
      throw new BadRequestError(err instanceof Error ? err.message : 'Confirmation failed');
    }

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
