import { z } from 'zod';
import { OrderStatus, PaymentMethod } from '../../shared/enums/order.enum';

export const idSchema = z.string().min(1, 'Identifier is required').max(100, 'Identifier too long');

export const orderItemSchema = z.object({
  productId: z.string().min(1, 'productId is required').max(100, 'productId too long'),
  quantity: z
    .number()
    .int('quantity must be an integer')
    .positive('quantity must be a positive integer')
    .finite('quantity must be finite')
    .max(10_000, 'quantity cannot exceed 10000'),
});

export const createOrderSchema = z.object({
  branchId: z.string().min(1, 'branchId is required').max(100, 'branchId too long'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required').max(100, 'Cannot exceed 100 items per order'),
  couponId: z.string().max(100).optional().nullable(),
  couponCode: z.string().max(100).optional().nullable(),
  offerId: z.string().max(100).optional().nullable(),
});

export const createBranchOrderSchema = createOrderSchema.extend({
  initialStatus: z
    .enum([
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.COMPLETED,
    ])
    .optional(),
  paymentMethod: z
    .enum([
      PaymentMethod.CASH,
      PaymentMethod.UPI,
      PaymentMethod.CARD,
      PaymentMethod.ONLINE,
      PaymentMethod.OTHER,
    ])
    .optional(),
  paymentNotes: z.string().max(500).optional(),
  customerUserId: z.string().max(100).optional(),
});

export const editOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required').max(100, 'Cannot exceed 100 items per order'),
});

export const recordPaymentSchema = z.object({
  amount: z
    .number()
    .positive('amount must be positive')
    .finite('amount must be finite')
    .max(1_000_000, 'amount cannot exceed 1000000'),
  method: z.enum([
    PaymentMethod.CASH,
    PaymentMethod.UPI,
    PaymentMethod.CARD,
    PaymentMethod.ONLINE,
    PaymentMethod.OTHER,
  ]),
  notes: z.string().max(500, 'notes too long').optional(),
});

export const verifyPaymentSchema = z.object({
  notes: z.string().max(500, 'notes too long').optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum([
    'PREPARING',
    'READY',
    'COMPLETED',
    'CANCELLED',
  ], {
    message: 'Status must be one of PREPARING, READY, COMPLETED, CANCELLED. Confirmation must use /confirm.',
  }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type EditOrderInput = z.infer<typeof editOrderSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
