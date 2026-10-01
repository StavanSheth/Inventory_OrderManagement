import { MessagingCampaign } from '../../../shared/types/entities.types';

export interface IMessagingService {
  createCampaign(branchId: string, createdByUserId: string, messageBody: string): Promise<MessagingCampaign>;
  getCampaign(campaignId: string): Promise<MessagingCampaign | null>;
}

export const MESSAGING_SERVICE_TOKEN = 'IMessagingService';
