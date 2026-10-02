// Dashboard feature module boundary (Phase 1 foundation)
export interface DashboardModuleState {
  dateRange: 'today' | 'week' | 'month';
}

export * from './owner-dashboard-view';
