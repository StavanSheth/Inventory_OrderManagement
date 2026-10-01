import { Branch, BranchSettings } from '../../../shared/types/entities.types';

export interface IBranchesService {
  getBranchById(id: string): Promise<Branch | null>;
  listBranches(): Promise<Branch[]>;
  getBranchSettings(branchId: string): Promise<BranchSettings | null>;
}

export const BRANCHES_SERVICE_TOKEN = 'IBranchesService';
