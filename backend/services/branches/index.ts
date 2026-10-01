import { Branch, BranchSettings } from '../../../shared/types/entities.types';
import { BranchRepository } from '../../../database/repositories/branch.repository';
import { D1DatabaseLike } from '../../../database/types';

export interface IBranchesService {
  getBranchById(id: string): Promise<Branch | null>;
  listBranches(): Promise<Branch[]>;
  getBranchSettings(branchId: string): Promise<BranchSettings | null>;
}

export const BRANCHES_SERVICE_TOKEN = 'IBranchesService';

export class BranchesService implements IBranchesService {
  constructor(
    private branchRepo: BranchRepository,
    private db: D1DatabaseLike,
  ) {}

  async getBranchById(id: string): Promise<Branch | null> {
    return this.branchRepo.findById(id);
  }

  async listBranches(): Promise<Branch[]> {
    return this.branchRepo.listAll();
  }

  async getBranchSettings(branchId: string): Promise<BranchSettings | null> {
    return this.db
      .prepare('SELECT * FROM branch_settings WHERE branch_id = ?')
      .bind(branchId)
      .first<BranchSettings>();
  }
}
