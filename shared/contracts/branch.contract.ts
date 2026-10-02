import { Branch, BranchSettings } from '../types/entities.types';
import { BranchStatus } from '../enums/branch.enum';

export interface CreateBranchRequest {
  name: string;
  code: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
  status?: BranchStatus;
}

export interface UpdateBranchRequest {
  name?: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string;
  status?: BranchStatus;
}

export interface BranchDetailResponse {
  branch: Branch;
  settings: BranchSettings | null;
}
