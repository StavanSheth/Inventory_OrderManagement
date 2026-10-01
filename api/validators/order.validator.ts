import { z } from 'zod';
import { PaymentMethod } from '../../shared/enums/order.enum';

export const orderItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.int().positive('quantity must be a positive integer'),
});

export const createOrderSchema = z.object({
  branchId: z.string().min(1, 'branchId is required'),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
  couponId: z.string().optional().nullable(),
});

export const editOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
});

export const recordPaymentSchema = z.object({
  amount: z.number().positive('amount must be positive'),
  method: z.enum([PaymentMethod.CASH, PaymentMethod.UPI, PaymentMethod.CARD, PaymentMethod.ONLINE, PaymentMethod.OTHER]),
  notes: z.string().optional(),
});

export const verifyPaymentSchema = z.object({
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type EditOrderInput = z.infer<typeof editOrderSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
