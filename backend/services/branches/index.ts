import { Branch, BranchSettings } from '../../../shared/types/entities.types';
import { BranchRepository, CreateBranchInput } from '../../../database/repositories/branch.repository';
import { AuditRepository } from '../../../database/repositories/audit.repository';
import { BranchStatus } from '../../../shared/enums/branch.enum';
import { AuditAction } from '../../../shared/enums/audit.enum';
import { D1DatabaseLike } from '../../../database/types';
import { BadRequestError, NotFoundError } from '../../errors/app-error';
import {
  CreateBranchRequest,
  UpdateBranchRequest,
  BranchDetailResponse,
  UpdateBranchSettingsRequest,
} from '../../../shared/contracts';

export interface IBranchesService {
  getBranchById(id: string): Promise<Branch | null>;
  listBranches(status?: BranchStatus): Promise<Branch[]>;
  getBranchSettings(branchId: string): Promise<BranchSettings | null>;
  getBranchDetail(id: string): Promise<BranchDetailResponse | null>;
  createBranch(actorUserId: string, input: CreateBranchRequest): Promise<BranchDetailResponse>;
  updateBranch(actorUserId: string, branchId: string, input: UpdateBranchRequest): Promise<BranchDetailResponse>;
  setBranchStatus(actorUserId: string, branchId: string, status: BranchStatus): Promise<Branch>;
  updateBranchSettings(actorUserId: string, branchId: string, settings: UpdateBranchSettingsRequest): Promise<BranchSettings>;
}

export const BRANCHES_SERVICE_TOKEN = 'IBranchesService';

export class BranchesService implements IBranchesService {
  private auditRepo: AuditRepository;

  constructor(
    private branchRepo: BranchRepository,
    private db: D1DatabaseLike,
    auditRepo?: AuditRepository,
  ) {
    this.auditRepo = auditRepo ?? new AuditRepository(db);
  }

  async getBranchById(id: string): Promise<Branch | null> {
    return this.branchRepo.findById(id);
  }

  async listBranches(status?: BranchStatus): Promise<Branch[]> {
    return this.branchRepo.listAll(status);
  }

  async getBranchSettings(branchId: string): Promise<BranchSettings | null> {
    return this.branchRepo.getBranchSettings(branchId);
  }

  async getBranchDetail(id: string): Promise<BranchDetailResponse | null> {
    const branch = await this.branchRepo.findById(id);
    if (!branch) return null;
    let settings = await this.branchRepo.getBranchSettings(id);
    if (!settings) {
      settings = await this.branchRepo.createDefaultSettings(id);
    }
    return { branch, settings };
  }

  async createBranch(actorUserId: string, input: CreateBranchRequest): Promise<BranchDetailResponse> {
    if (!input.name || !input.name.trim()) {
      throw new BadRequestError('Branch name is required');
    }
    if (!input.code || !input.code.trim()) {
      throw new BadRequestError('Branch code is required');
    }

    const normalizedCode = input.code.trim().toUpperCase();
    const existing = await this.branchRepo.findByCode(normalizedCode);
    if (existing) {
      throw new BadRequestError(`Branch with code ${normalizedCode} already exists`);
    }

    const id = `br_${crypto.randomUUID().replace(/-/g, '')}`;
    const branchInput: CreateBranchInput = {
      id,
      name: input.name.trim(),
      code: normalizedCode,
      status: input.status ?? BranchStatus.ACTIVE,
      address: input.address?.trim() ?? null,
      phone: input.phone?.trim() ?? null,
      email: input.email?.trim() ?? null,
      timezone: input.timezone?.trim() ?? 'UTC',
    };

    const branch = await this.branchRepo.create(branchInput);
    const settings = await this.branchRepo.createDefaultSettings(id);

    await this.auditRepo.log({
      branch_id: id,
      actor_user_id: actorUserId,
      action: AuditAction.BRANCH_CREATED,
      entity_type: 'branch',
      entity_id: id,
      metadata: { name: branch.name, code: branch.code, status: branch.status },
    });

    return { branch, settings };
  }

  async updateBranch(actorUserId: string, branchId: string, input: UpdateBranchRequest): Promise<BranchDetailResponse> {
    const existing = await this.branchRepo.findById(branchId);
    if (!existing) throw new NotFoundError(`Branch ${branchId} not found`);

    if (input.code && input.code.trim().toUpperCase() !== existing.code) {
      const duplicate = await this.branchRepo.findByCode(input.code.trim().toUpperCase());
      if (duplicate) {
        throw new BadRequestError(`Branch with code ${input.code.trim().toUpperCase()} already exists`);
      }
    }

    const updated = await this.branchRepo.update(branchId, {
      name: input.name?.trim(),
      code: input.code?.trim().toUpperCase(),
      status: input.status,
      address: input.address !== undefined ? input.address?.trim() ?? null : undefined,
      phone: input.phone !== undefined ? input.phone?.trim() ?? null : undefined,
      email: input.email !== undefined ? input.email?.trim() ?? null : undefined,
      timezone: input.timezone?.trim(),
    });

    let settings = await this.branchRepo.getBranchSettings(branchId);
    if (!settings) {
      settings = await this.branchRepo.createDefaultSettings(branchId);
    }

    await this.auditRepo.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.BRANCH_UPDATED,
      entity_type: 'branch',
      entity_id: branchId,
      metadata: { updates: input },
    });

    return { branch: updated, settings };
  }

  async setBranchStatus(actorUserId: string, branchId: string, status: BranchStatus): Promise<Branch> {
    const existing = await this.branchRepo.findById(branchId);
    if (!existing) throw new NotFoundError(`Branch ${branchId} not found`);

    const updated = await this.branchRepo.updateStatus(branchId, status);
    const action = status === BranchStatus.INACTIVE ? AuditAction.BRANCH_DEACTIVATED : AuditAction.BRANCH_UPDATED;

    await this.auditRepo.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action,
      entity_type: 'branch',
      entity_id: branchId,
      metadata: { previousStatus: existing.status, newStatus: status },
    });

    return updated;
  }

  async updateBranchSettings(
    actorUserId: string,
    branchId: string,
    settings: UpdateBranchSettingsRequest,
  ): Promise<BranchSettings> {
    const existing = await this.branchRepo.findById(branchId);
    if (!existing) throw new NotFoundError(`Branch ${branchId} not found`);

    if (settings.session_timeout_value !== undefined) {
      if (settings.session_timeout_value <= 0 || !Number.isInteger(settings.session_timeout_value)) {
        throw new BadRequestError('session_timeout_value must be a positive integer');
      }
    }

    if (settings.session_timeout_unit !== undefined) {
      const validUnits = ['MINUTES', 'HOURS', 'DAYS'];
      if (!validUnits.includes(settings.session_timeout_unit)) {
        throw new BadRequestError(`session_timeout_unit must be one of: ${validUnits.join(', ')}`);
      }
    }

    if (settings.order_expiry_minutes !== undefined) {
      if (settings.order_expiry_minutes <= 0 || !Number.isInteger(settings.order_expiry_minutes)) {
        throw new BadRequestError('order_expiry_minutes must be a positive integer');
      }
    }

    if (settings.order_edit_window_minutes !== undefined) {
      if (settings.order_edit_window_minutes <= 0 || !Number.isInteger(settings.order_edit_window_minutes)) {
        throw new BadRequestError('order_edit_window_minutes must be a positive integer');
      }
    }

    const currentSettings = await this.branchRepo.getBranchSettings(branchId);
    const effectiveExpiry = settings.order_expiry_minutes ?? currentSettings?.order_expiry_minutes;
    const effectiveEditWindow = settings.order_edit_window_minutes ?? currentSettings?.order_edit_window_minutes;
    if (effectiveExpiry !== undefined && effectiveEditWindow !== undefined && effectiveExpiry < effectiveEditWindow) {
      throw new BadRequestError('order_expiry_minutes cannot be less than order_edit_window_minutes');
    }

    const updatedSettings = await this.branchRepo.updateBranchSettings(branchId, settings);

    await this.auditRepo.log({
      branch_id: branchId,
      actor_user_id: actorUserId,
      action: AuditAction.SETTINGS_UPDATED,
      entity_type: 'branch_settings',
      entity_id: updatedSettings.id,
      metadata: { branchId, updates: settings },
    });

    return updatedSettings;
  }
}
