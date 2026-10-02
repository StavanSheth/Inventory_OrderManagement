import { OrderStatus, PaymentStatus, PaymentMethod } from '../enums/order.enum';
import { Order, OrderItem, Payment } from '../types/entities.types';

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderRequest {
  branchId: string;
  items: OrderItemInput[];
  couponId?: string | null;
}

export interface OrderDetailResponseData {
  order: Order;
  items: OrderItem[];
  payments: Payment[];
}

export interface CreateOrderResponseData {
  order: Order;
  items: OrderItem[];
  expiresAt: string;
}

export interface RecordPaymentRequest {
  amount: number;
  method: PaymentMethod;
  notes?: string;
}

export interface RecordPaymentResponseData {
  payment: Payment;
  order: Order;
}

export interface VerifyPaymentRequest {
  notes?: string;
}

export interface VerifyPaymentResponseData {
  payment: Payment;
  order: Order;
}

export interface ConfirmOrderResponseData {
  order: Order;
  confirmedAt: string;
}

export interface EditOrderRequest {
  items: OrderItemInput[];
}

export interface PaymentDifference {
  paymentDifference: number; // positive = additional payment required, negative = refund/credit
  verifiedPaidAmount: number;
  additionalAmountRequired: number;
  overpaymentAmount: number;
  refundCreditAmount?: number;
}

export interface EditOrderResponseData {
  order: Order;
  items: OrderItem[];
  previousTotal: number;
  newTotal: number;
  paymentDifference: number;
  verifiedPaidAmount?: number;
  additionalAmountRequired?: number;
  overpaymentAmount?: number;
  refundCreditAmount?: number;
}

export interface OrderStatusEvent {
  orderId: string;
  orderNumber: string;
  branchId: string;
  customerUserId: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  timestamp: string;
}
