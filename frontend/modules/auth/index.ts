// Auth feature module boundary (Phase 1 foundation)
export interface AuthModuleState {
  isAuthenticated: boolean;
  userId?: string;
  email?: string;
}
