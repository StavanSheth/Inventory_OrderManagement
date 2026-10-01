import { DeletionJob } from '../../../shared/types/entities.types';

export interface IDeletionService {
  createJob(requestedByUserId: string, branchId?: string, modules?: string[]): Promise<DeletionJob>;
  getJobStatus(jobId: string): Promise<DeletionJob | null>;
}

export const DELETION_SERVICE_TOKEN = 'IDeletionService';
