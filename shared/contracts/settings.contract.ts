import { BranchSettings } from '../types/entities.types';

export interface UpdateBranchSettingsRequest {
  session_timeout_value?: number;
  session_timeout_unit?: 'MINUTES' | 'HOURS' | 'DAYS';
  order_expiry_minutes?: number;
  order_edit_window_minutes?: number;
  configuration_json?: string;
}

export interface BranchSettingsResponse {
  settings: BranchSettings;
}
