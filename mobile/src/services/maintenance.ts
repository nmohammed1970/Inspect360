import { apiRequestJson } from './api';
import type { MaintenanceRequest } from '../types';

export interface MaintenanceRequestWithDetails extends MaintenanceRequest {
  property?: { name: string; address: string };
  reportedByUser?: { firstName: string; lastName: string };
  assignedToUser?: { firstName: string; lastName: string };
}

export const maintenanceService = {
  async getMaintenanceRequests(): Promise<MaintenanceRequestWithDetails[]> {
    return apiRequestJson<MaintenanceRequestWithDetails[]>('GET', '/api/maintenance');
  },

  async getMaintenanceRequest(id: string): Promise<MaintenanceRequestWithDetails> {
    return apiRequestJson<MaintenanceRequestWithDetails>('GET', `/api/maintenance/${id}`);
  },

  async createMaintenanceRequest(
    data: Partial<MaintenanceRequest>
  ): Promise<MaintenanceRequest> {
    return apiRequestJson<MaintenanceRequest>('POST', '/api/maintenance', data);
  },

  async updateMaintenanceRequest(
    id: string,
    updates: Partial<MaintenanceRequest>
  ): Promise<void> {
    await apiRequestJson('PATCH', `/api/maintenance/${id}`, updates);
  },
};

