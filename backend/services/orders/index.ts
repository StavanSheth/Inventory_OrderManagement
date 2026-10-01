import { Order, OrderItem, Payment } from '../../../shared/types/entities.types';
import { OrderStatus, PaymentStatus, PaymentMethod } from '../../../shared/enums/order.enum';
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
  canConfirmOrder,
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
      action: 'ORDER_CREATED',
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
  }> {
    if (!this.productRepo) throw new BadRequestError('ProductRepository is required to edit orders');

    const order = await this.orderRepo.findById(opts.orderId);
    if (!order) throw new NotFoundError(`Order ${opts.orderId} not found`);

    if (isTerminalOrderStatus(order.status)) {
      throw new BadRequestError(`Cannot edit order in terminal status: ${order.status}`);
    }

    const settings = this.branchRepo ? await this.branchRepo.getBranchSettings(order.branch_id) : null;
    const editWindowMinutes = settings?.order_edit_window_minutes ?? 60;
    if (!isOrderEditable(order, editWindowMinutes)) {
      throw new BadRequestError('Order edit window has expired');
    }

    const allProducts = await this.productRepo.listByBranch(order.branch_id, true);
    const productsMap = new Map(allProducts.map((p) => [p.id, p]));

    const { items: newCalcItems, subtotal, tax, total: newTotal } = this.calc.calculateTotals(opts.items, productsMap);
    const previousTotal = order.total;
    const lastEditedAt = new Date().toISOString();

    const updatedOrder = await this.orderRepo.updateOrderItemsAndTotals(
      opts.orderId,
      newCalcItems,
      subtotal,
      tax,
      newTotal,
      lastEditedAt,
    );
    const updatedItems = await this.orderRepo.getOrderItems(opts.orderId);

    // ponytail: alreadyPaid uses 0 (Phase 4 will sum verified payments)
    const { paymentDifference } = this.calc.calculateEditDifference(previousTotal, newTotal, 0);

    await this.auditRepo?.log({
      branch_id: order.branch_id,
      actor_user_id: opts.actorUserId,
      action: 'ORDER_EDITED',
      entity_type: 'order',
      entity_id: opts.orderId,
      metadata: { previousTotal, newTotal, paymentDifference },
    });

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

    return { order: updatedOrder, items: updatedItems, previousTotal, newTotal, paymentDifference };
  }

  async updateOrderStatus(actorUserId: string, orderId: string, nextStatus: OrderStatus): Promise<Order> {
    const order = await this.orderRepo.findById(orderId);
    if (!order) throw new NotFoundError(`Order ${orderId} not found`);

    assertValidOrderTransition(order.status, nextStatus);

    const extra: { confirmed_at?: string; completed_at?: string; cancelled_at?: string } = {};
    const now = new Date().toISOString();
    if (nextStatus === OrderStatus.CONFIRMED) extra.confirmed_at = now;
    if (nextStatus === OrderStatus.COMPLETED) extra.completed_at = now;
    if (nextStatus === OrderStatus.CANCELLED) extra.cancelled_at = now;

    const updated = await this.orderRepo.updateStatus(orderId, nextStatus, extra);

    await this.auditRepo?.log({
      branch_id: order.branch_id,
      actor_user_id: actorUserId,
      action: `ORDER_STATUS_${nextStatus}`,
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
    if (!canConfirmOrder(order)) {
      throw new BadRequestError(
        `Order cannot be confirmed. Status: ${order.status}, Payment: ${order.payment_status}`,
      );
    }
    return this.updateOrderStatus(actorUserId, orderId, OrderStatus.CONFIRMED);
  }

  async recordPayment(opts: RecordPaymentOptions): Promise<{ payment: Payment; order: Order }> {
    if (!this.paymentRepo) throw new BadRequestError('PaymentRepository is required for payments');

    const order = await this.orderRepo.findById(opts.orderId);
    if (!order) throw new NotFoundError(`Order ${opts.orderId} not found`);
    if (isTerminalOrderStatus(order.status)) {
      throw new BadRequestError(`Cannot record payment for order in status ${order.status}`);
    }

    const paymentId = `pay-${crypto.randomUUID()}`;
    const payment = await this.paymentRepo.create({
      id: paymentId,
      order_id: opts.orderId,
      branch_id: opts.branchId,
      method: opts.method,
      amount: opts.amount,
      status: PaymentStatus.RECORDED,
    });

    const updatedOrder = await this.orderRepo.updatePaymentStatus(opts.orderId, PaymentStatus.RECORDED, opts.method);

    await this.auditRepo?.log({
      branch_id: opts.branchId,
      actor_user_id: opts.actorUserId,
      action: 'PAYMENT_RECORDED',
      entity_type: 'payment',
      entity_id: paymentId,
      metadata: { orderId: opts.orderId, amount: opts.amount, method: opts.method, notes: opts.notes ?? null },
    });

    await this.realtime?.publish({
      type: 'PaymentUpdated',
      payload: {
        orderId: opts.orderId,
        branchId: opts.branchId,
        paymentId,
        amount: opts.amount,
        status: PaymentStatus.RECORDED,
        timestamp: new Date().toISOString(),
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
    if (payment.status === PaymentStatus.VERIFIED || payment.status === PaymentStatus.COMPLETED) {
      throw new BadRequestError(`Payment is already ${payment.status}`);
    }

    const now = new Date().toISOString();
    const updatedPayment = await this.paymentRepo.updateStatus(opts.paymentId, PaymentStatus.VERIFIED, opts.actorUserId, now);
    const updatedOrder = await this.orderRepo.updatePaymentStatus(opts.orderId, PaymentStatus.VERIFIED);

    await this.auditRepo?.log({
      branch_id: payment.branch_id,
      actor_user_id: opts.actorUserId,
      action: 'PAYMENT_VERIFIED',
      entity_type: 'payment',
      entity_id: opts.paymentId,
      metadata: { orderId: opts.orderId, notes: opts.notes ?? null },
    });

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

    return { payment: updatedPayment, order: updatedOrder };
  }
}
