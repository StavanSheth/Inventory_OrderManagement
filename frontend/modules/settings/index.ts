// Settings feature module boundary (Phase 1 foundation)
export interface SettingsModuleState {
  currentTab: 'general' | 'operational' | 'security';
}

export * from './branch-settings-view';
export * from './data-management-view';
