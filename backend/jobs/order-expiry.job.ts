import { OrderRepository } from '../../database/repositories/order.repository';
import { IRealtimeService } from '../services/realtime/realtime.interface';
import { IOrderExpiryJob } from './order-expiry.job.interface';
import { OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';

export class OrderExpiryJob implements IOrderExpiryJob {
  constructor(
    private orderRepo: OrderRepository,
    private realtime?: IRealtimeService,
  ) {}

  async processExpiredOrders(): Promise<{ expiredCount: number }> {
    const now = new Date().toISOString();
    const expiredOrders = await this.orderRepo.findExpiredOrders(now);

    let expiredCount = 0;
    for (const order of expiredOrders) {
      // ponytail: audit_logs has NOT NULL FK on actor_user_id referencing users;
      // system-generated expiry has no user row. The EXPIRED status on the order
      // itself is the authoritative audit trail. Upgrade trigger: add a system_user
      // sentinel row to support system-sourced audit entries.
      await this.orderRepo.updateStatus(order.id, OrderStatus.EXPIRED, {
        cancelled_at: now,
      });

      await this.realtime?.publish({
        type: 'OrderStatusChanged',
        payload: {
          orderId: order.id,
          orderNumber: order.order_number,
          branchId: order.branch_id,
          customerUserId: order.customer_user_id,
          status: OrderStatus.EXPIRED,
          paymentStatus: order.payment_status as PaymentStatus,
          total: order.total,
          timestamp: now,
        },
      });

      expiredCount++;
    }

    return { expiredCount };
  }
}
