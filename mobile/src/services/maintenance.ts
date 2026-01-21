import { apiRequestJson } from './api';
import type { MaintenanceRequest } from '../types';

export interface MaintenanceRequestWithDetails extends MaintenanceRequest {
  property?: { name: string; address: string };
  reportedByUser?: { firstName: string; lastName: string };
  assignedToUser?: { firstName: string; lastName: string };
}

export interface WorkOrder {
  id: string;
  status: string;
  slaDue?: string | null;
  costEstimate?: number | null;
  costActual?: number | null;
  createdAt: string;
  maintenanceRequest: {
    id: string;
    title: string;
    description?: string;
    priority: string;
  };
  contractor?: {
    id?: string;
    firstName?: string;
    lastName?: string;
    email: string;
  } | null;
  team?: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
}

export const maintenanceService = {
  async getMaintenanceRequests(): Promise<MaintenanceRequestWithDetails[]> {
    return apiRequestJson<MaintenanceRequestWithDetails[]>('GET', '/api/maintenance');
  },

  async getMaintenanceRequest(id: string): Promise<MaintenanceRequestWithDetails> {
    try {
      return await apiRequestJson<MaintenanceRequestWithDetails>('GET', `/api/maintenance/${id}`);
    } catch (error: any) {
      console.error('[MaintenanceService] Error fetching maintenance request:', id, error);
      // If it's a parse error (HTML response), provide better error message
      if (error.message?.includes('JSON Parse error') || error.message?.includes('Unexpected character')) {
        throw new Error(`Failed to load maintenance request. The server may not be responding correctly. Please check the backend server.`);
      }
      throw error;
    }
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

  async updateMaintenanceStatus(
    id: string,
    status: string,
    assignedTo?: string
  ): Promise<void> {
    await apiRequestJson('PATCH', `/api/maintenance/${id}`, { status, assignedTo });
  },

  async getWorkOrders(): Promise<WorkOrder[]> {
    return apiRequestJson<WorkOrder[]>('GET', '/api/work-orders');
  },

  async createWorkOrder(data: any): Promise<WorkOrder> {
    return apiRequestJson<WorkOrder>('POST', '/api/work-orders', data);
  },

  async updateWorkOrderStatus(id: string, status: string): Promise<void> {
    await apiRequestJson('PATCH', `/api/work-orders/${id}/status`, { status });
  },

  async analyzeImage(imageUrl: string, issueDescription: string): Promise<{ suggestedFixes: string }> {
    return apiRequestJson<{ suggestedFixes: string }>('POST', '/api/maintenance/analyze-image', {
      imageUrl,
      issueDescription,
    });
  },
};

