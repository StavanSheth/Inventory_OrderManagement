export interface IOrderExpiryJob {
  processExpiredOrders(): Promise<{ expiredCount: number }>;
}
