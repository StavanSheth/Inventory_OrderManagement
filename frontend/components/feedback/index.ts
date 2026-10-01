// Feedback component boundary exports (Phase 1 foundation)
export interface AlertMessage {
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}
