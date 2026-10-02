import { D1DatabaseLike } from '../../../database/types';
import { BranchRepository } from '../../../database/repositories/branch.repository';
import { UserRepository } from '../../../database/repositories/user.repository';
import { SessionRepository } from '../../../database/repositories/session.repository';
import { OrderRepository } from '../../../database/repositories/order.repository';
import { AuditRepository } from '../../../database/repositories/audit.repository';
import { BranchStatus } from '../../../shared/enums/branch.enum';
import { AuditAction } from '../../../shared/enums/audit.enum';
import { NotFoundError } from '../../errors/app-error';
import {
  BranchDeletionPreviewResponse,
  AnonymizeCustomerResponse,
} from '../../../shared/contracts/deletion.contract';

export interface IDeletionService {
  previewBranchDeletion(branchId: string): Promise<BranchDeletionPreviewResponse>;
  deactivateBranch(actorUserId: string, branchId: string): Promise<{ success: boolean; branchId: string; status: string }>;
  anonymizeCustomer(actorUserId: string, customerUserId: string, reason?: string): Promise<AnonymizeCustomerResponse>;
}

export const DELETION_SERVICE_TOKEN = 'IDeletionService';

export class DeletionService implements IDeletionService {
  private branchRepo: BranchRepository;
  private userRepo: UserRepository;
  private sessionRepo: SessionRepository;
  private orderRepo: OrderRepository;
  private auditRepo: AuditRepository;

  constructor(private db: D1DatabaseLike) {
    this.branchRepo = new BranchRepository(db);
    this.userRepo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.orderRepo = new OrderRepository(db);
    this.auditRepo = new AuditRepository(db);
  }

  async previewBranchDeletion(branchId: string): Promise<BranchDeletionPreviewResponse> {
    const branch = await this.branchRepo.findById(branchId);
    if (!branch) throw new NotFoundError(`Branch ${branchId} not found`);

    const counts = await this.branchRepo.checkBranchDependencies(branchId);
    const blockingReasons: string[] = [];

    if (counts.orders > 0) {
      blockingReasons.push(`Branch has ${counts.orders} historical orders that must be preserved for audit & accounting.`);
    }
    if (counts.payments > 0) {
      blockingReasons.push(`Branch has ${counts.payments} financial payment records.`);
    }
    if (counts.inventoryMovements > 0) {
      blockingReasons.push(`Branch has ${counts.inventoryMovements} immutable inventory ledger records.`);
    }

    const canHardDelete = blockingReasons.length === 0;

    await this.auditRepo.log({
      branch_id: branchId,
      actor_type: 'SYSTEM',
      actor_user_id: null,
      action: AuditAction.DATA_DELETION_REQUESTED,
      entity_type: 'branch',
      entity_id: branchId,
      metadata: { counts, canHardDelete, blockingReasons },
    });

    return {
      branchId,
      canHardDelete,
      blockingReasons,
      counts,
    };
  }

  async deactivateBranch(actorUserId: string, branchId: string): Promise<{ success: boolean; branchId: string; status: string }> {
    const branch = await this.branchRepo.findById(branchId);
    if (!branch) throw new NotFoundError(`Branch ${branchId} not found`);

    const updated = await this.branchRepo.updateStatus(branchId, BranchStatus.INACTIVE);

    // Revoke active sessions associated with the branch
    await this.db
      .prepare('UPDATE application_sessions SET revoked_at = ? WHERE branch_id = ? AND revoked_at IS NULL')
      .bind(new Date().toISOString(), branchId)
      .run();

    await this.auditRepo.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.BRANCH_DEACTIVATED,
      entity_type: 'branch',
      entity_id: branchId,
      metadata: { previousStatus: branch.status, newStatus: updated.status, safeDeactivation: true },
    });

    return {
      success: true,
      branchId,
      status: updated.status,
    };
  }

  async anonymizeCustomer(
    actorUserId: string,
    customerUserId: string,
    reason?: string,
  ): Promise<AnonymizeCustomerResponse> {
    const customer = await this.userRepo.findById(customerUserId);
    if (!customer) throw new NotFoundError(`Customer ${customerUserId} not found`);

    // Check count of historical orders to ensure they remain preserved
    const orders = await this.orderRepo.listByCustomer(customerUserId, 1000);
    const preservedOrdersCount = orders.length;

    // Revoke all active sessions for this customer immediately
    const revokedSessionsCount = await this.sessionRepo.revokeAllForUser(customerUserId);

    // Anonymize the customer's personal data in users table
    const nowIso = new Date().toISOString();
    await this.userRepo.anonymizeUser(customerUserId);

    await this.auditRepo.log({
      branch_id: null,
      actor_user_id: actorUserId,
      action: AuditAction.DATA_ANONYMIZED,
      entity_type: 'user',
      entity_id: customerUserId,
      metadata: {
        reason: reason ?? 'Customer deletion/anonymization requested',
        preservedOrdersCount,
        revokedSessionsCount,
        anonymizedAt: nowIso,
      },
    });

    return {
      success: true,
      customerUserId,
      anonymizedAt: nowIso,
      preservedOrdersCount,
      revokedSessionsCount,
    };
  }
}
