import { apiRequestJson, apiRequest } from './api';
import type { Inspection } from '../types';

export interface InspectionEntry {
  id?: string;
  inspectionId: string;
  sectionRef: string;
  fieldKey: string;
  fieldType: string;
  valueJson?: any;
  note?: string;
  photos?: string[];
  maintenanceFlag?: boolean;
  markedForReview?: boolean;
  syncStatus?: 'synced' | 'pending' | 'conflict';
}

export interface InspectionResponse {
  id: string;
  inspectionId: string;
  sectionRef: string;
  fieldKey: string;
  value: any;
  mediaUrls?: string[];
  markedForReview?: boolean;
}

export interface InspectionDetail extends Inspection {
  templateSnapshotJson?: any;
  property?: any;
  block?: any;
  items?: any[];
  responses?: InspectionResponse[];
}

export interface AIAnalysisStatus {
  status: 'idle' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalFields: number;
  error: string | null;
}

export const inspectionsService = {
  async getMyInspections(): Promise<Inspection[]> {
    return apiRequestJson<Inspection[]>('GET', '/api/inspections/my');
  },

  async getInspection(id: string): Promise<InspectionDetail> {
    return apiRequestJson<InspectionDetail>('GET', `/api/inspections/${id}`);
  },

  async updateInspectionStatus(id: string, status: string, startedAt?: string): Promise<void> {
    const body: any = { status };
    if (startedAt) {
      body.startedAt = startedAt;
    }
    await apiRequestJson('PATCH', `/api/inspections/${id}/status`, body);
  },

  async updateInspection(id: string, updates: Partial<Inspection>): Promise<void> {
    await apiRequestJson('PUT', `/api/inspections/${id}`, updates);
  },

  async getInspectionEntries(inspectionId: string, updatedAfter?: string): Promise<InspectionEntry[]> {
    const url = updatedAfter 
      ? `/api/inspections/${inspectionId}/entries?updated_after=${encodeURIComponent(updatedAfter)}`
      : `/api/inspections/${inspectionId}/entries`;
    return apiRequestJson<InspectionEntry[]>('GET', url);
  },

  // Delta sync: Get entries updated after a specific timestamp
  async getInspectionEntriesDelta(inspectionId: string, updatedAfter: string): Promise<InspectionEntry[]> {
    return this.getInspectionEntries(inspectionId, updatedAfter);
  },

  async saveInspectionEntry(entry: InspectionEntry): Promise<InspectionEntry> {
    // Filter out local paths (file://) from photos and valueJson before sending to server
    const photos = entry.photos?.filter(p => !p.startsWith('file://')) || [];
    let valueJson = entry.valueJson;
    if (valueJson && typeof valueJson === 'object' && Array.isArray(valueJson.photos)) {
      valueJson = {
        ...valueJson,
        photos: valueJson.photos.filter((p: string) => !p.startsWith('file://'))
      };
    }

    return apiRequestJson<InspectionEntry>('POST', '/api/inspection-entries', {
      inspectionId: entry.inspectionId,
      sectionRef: entry.sectionRef,
      fieldKey: entry.fieldKey,
      fieldType: entry.fieldType,
      valueJson,
      note: entry.note,
      photos,
      maintenanceFlag: entry.maintenanceFlag,
      markedForReview: entry.markedForReview,
    });
  },

  async updateInspectionEntry(entryId: string, updates: Partial<InspectionEntry>): Promise<InspectionEntry> {
    // Filter out local paths from updates
    const photos = updates.photos?.filter(p => !p.startsWith('file://'));
    let valueJson = updates.valueJson;
    if (valueJson && typeof valueJson === 'object' && Array.isArray(valueJson.photos)) {
      valueJson = {
        ...valueJson,
        photos: valueJson.photos.filter((p: string) => !p.startsWith('file://'))
      };
    }

    return apiRequestJson<InspectionEntry>('PATCH', `/api/inspection-entries/${entryId}`, {
      ...updates,
      ...(photos !== undefined && { photos }),
      ...(valueJson !== undefined && { valueJson }),
    });
  },

  async saveInspectionResponse(
    inspectionId: string,
    response: Partial<InspectionResponse>
  ): Promise<InspectionResponse> {
    return apiRequestJson<InspectionResponse>(
      'POST',
      `/api/inspections/${inspectionId}/responses`,
      response
    );
  },

  async updateInspectionResponse(
    responseId: string,
    updates: Partial<InspectionResponse>
  ): Promise<void> {
    await apiRequestJson('PATCH', `/api/inspection-responses/${responseId}`, updates);
  },

  async getInspectionPDF(id: string): Promise<Blob> {
    const res = await apiRequest('GET', `/api/inspections/${id}/pdf`);
    return await res.blob();
  },

  async analyzeField(
    inspectionId: string,
    fieldKey: string,
    fieldLabel: string,
    fieldDescription: string,
    sectionName: string,
    photos: string[]
  ): Promise<{ analysis: string; tokenExceeded?: boolean }> {
    return apiRequestJson('POST', '/api/ai/inspect-field', {
      inspectionId,
      fieldKey,
      fieldLabel,
      fieldDescription,
      sectionName,
      photos,
    });
  },

  async startAIAnalysis(inspectionId: string): Promise<{ message: string }> {
    return apiRequestJson('POST', `/api/ai/analyze-inspection/${inspectionId}`);
  },

  async getAIAnalysisStatus(inspectionId: string): Promise<AIAnalysisStatus> {
    return apiRequestJson<AIAnalysisStatus>('GET', `/api/ai/analyze-inspection/${inspectionId}/status`);
  },

  async copyFromCheckIn(
    inspectionId: string,
    copyImages: boolean,
    copyNotes: boolean
  ): Promise<{ modifiedImageKeys?: string[]; modifiedNoteKeys?: string[] }> {
    return apiRequestJson('POST', `/api/inspections/${inspectionId}/copy-from-checkin`, {
      copyImages,
      copyNotes,
    });
  },

  async getMostRecentCheckIn(propertyId: string): Promise<{ inspection: InspectionDetail; entries: InspectionEntry[] } | null> {
    return apiRequestJson<{ inspection: InspectionDetail; entries: InspectionEntry[] } | null>(
      'GET',
      `/api/properties/${propertyId}/most-recent-checkin`
    );
  },

  async duplicateInspection(id: string, data: { type: string; scheduledDate: string; copyImages?: boolean; copyText?: boolean }): Promise<Inspection> {
    return apiRequestJson<Inspection>('POST', `/api/inspections/${id}/copy`, data);
  },

  async createInspection(data: {
    targetType: 'property' | 'block';
    propertyId?: string;
    blockId?: string;
    tenantId?: string;
    type: string;
    scheduledDate: string;
    templateId?: string;
    clerkId?: string;
    notes?: string;
  }): Promise<Inspection> {
    const payload: any = {
      type: data.type,
      scheduledDate: data.scheduledDate,
    };
    if (data.targetType === 'property' && data.propertyId) {
      payload.propertyId = data.propertyId;
    }
    if (data.targetType === 'block' && data.blockId) {
      payload.blockId = data.blockId;
    }
    if (data.tenantId && data.tenantId !== '__none__') {
      payload.tenantId = data.tenantId;
    }
    if (data.templateId && data.templateId !== '__none__') {
      payload.templateId = data.templateId;
    }
    if (data.clerkId) {
      payload.clerkId = data.clerkId;
    }
    if (data.notes) {
      payload.notes = data.notes;
    }
    return apiRequestJson<Inspection>('POST', '/api/inspections', payload);
  },
};

