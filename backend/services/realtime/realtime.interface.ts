import { OrderStatus, PaymentStatus } from '../../../shared/enums/order.enum';

export type RealtimeEventType = 'OrderStatusChanged' | 'OrderUpdated' | 'PaymentUpdated';

export interface OrderStatusChangedPayload {
  orderId: string;
  orderNumber: string;
  branchId: string;
  customerUserId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  timestamp: string;
}

export interface OrderUpdatedPayload {
  orderId: string;
  branchId: string;
  customerUserId: string;
  itemsCount: number;
  newTotal: number;
  timestamp: string;
}

export interface PaymentUpdatedPayload {
  orderId: string;
  branchId: string;
  paymentId: string;
  amount: number;
  status: PaymentStatus;
  timestamp: string;
}

export type RealtimeDomainEvent =
  | { id?: string; type: 'OrderStatusChanged'; payload: OrderStatusChangedPayload }
  | { id?: string; type: 'OrderUpdated'; payload: OrderUpdatedPayload }
  | { id?: string; type: 'PaymentUpdated'; payload: PaymentUpdatedPayload };

export interface RealtimeSubscriptionFilter {
  orderId?: string;
  branchId?: string;
  customerUserId?: string;
}

export interface IRealtimePublisher {
  publish(event: RealtimeDomainEvent): Promise<void>;
}

export interface IRealtimeSubscriber {
  subscribe(
    filter: RealtimeSubscriptionFilter,
    listener: (event: RealtimeDomainEvent) => void,
  ): () => void;
}

export interface IRealtimeService extends IRealtimePublisher, IRealtimeSubscriber {}
