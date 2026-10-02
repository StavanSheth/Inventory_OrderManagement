import { OrderRepository } from '../../database/repositories/order.repository';
import { AuditRepository } from '../../database/repositories/audit.repository';
import { IRealtimeService } from '../services/realtime/realtime.interface';
import { IOrderExpiryJob } from './order-expiry.job.interface';
import { OrderStatus, PaymentStatus } from '../../shared/enums/order.enum';
import { AuditAction } from '../../shared/enums/audit.enum';

export class OrderExpiryJob implements IOrderExpiryJob {
  constructor(
    private orderRepo: OrderRepository,
    private realtime?: IRealtimeService,
    private auditRepo?: AuditRepository,
  ) {}

  async processExpiredOrders(): Promise<{ expiredCount: number }> {
    const now = new Date().toISOString();
    const expiredOrders = await this.orderRepo.findExpiredOrders(now);

    let expiredCount = 0;
    for (const order of expiredOrders) {
      // Atomic conditional update ensures idempotency and avoids races with confirmation
      const didExpire = await this.orderRepo.expireOrderConditionally(order.id, now);
      if (didExpire) {
        await this.auditRepo?.log({
          branch_id: order.branch_id,
          actor_user_id: null,
          actor_type: 'SYSTEM',
          action: AuditAction.ORDER_EXPIRED,
          entity_type: 'order',
          entity_id: order.id,
          metadata: {
            orderNumber: order.order_number,
            branchId: order.branch_id,
            previousStatus: order.status,
            newStatus: OrderStatus.EXPIRED,
            expiryTimestamp: now,
            actor: 'system',
            systemSource: 'cron_expiry',
          },
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
    }

    return { expiredCount };
  }
}
