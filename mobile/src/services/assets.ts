import { apiRequestJson } from './api';

// Match web app AssetInventory type from shared/schema
export interface AssetInventory {
  id: string;
  organizationId: string;
  propertyId?: string | null;
  blockId?: string | null;
  name: string;
  category?: string | null;
  description?: string | null;
  location?: string | null;
  supplier?: string | null;
  supplierContact?: string | null;
  serialNumber?: string | null;
  modelNumber?: string | null;
  datePurchased?: Date | string | null;
  purchasePrice?: string | number | null;
  warrantyExpiryDate?: Date | string | null;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'needs_replacement';
  cleanliness?: 'very_clean' | 'clean' | 'acceptable' | 'needs_cleaning' | 'not_applicable' | null;
  expectedLifespanYears?: number | null;
  depreciationPerYear?: string | number | null;
  currentValue?: string | number | null;
  lastMaintenanceDate?: Date | string | null;
  nextMaintenanceDate?: Date | string | null;
  maintenanceNotes?: string | null;
  photos?: string[] | null;
  documents?: string[] | null;
  inspectionId?: string | null;
  inspectionEntryId?: string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface CreateAssetInventoryData extends Partial<AssetInventory> {
  name: string;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'needs_replacement';
  organizationId?: string;
}

export interface UpdateAssetInventoryData extends Partial<AssetInventory> {
  id: string;
}

export const assetsService = {
  /**
   * Get all assets from asset-inventory endpoint (matches web app)
   */
  async getAssetInventory(): Promise<AssetInventory[]> {
    return apiRequestJson<AssetInventory[]>('GET', '/api/asset-inventory');
  },

  /**
   * Get a single asset by ID
   */
  async getAssetInventoryItem(id: string): Promise<AssetInventory> {
    return apiRequestJson<AssetInventory>('GET', `/api/asset-inventory/${id}`);
  },

  /**
   * Create a new asset
   */
  async createAssetInventory(data: CreateAssetInventoryData): Promise<AssetInventory> {
    return apiRequestJson<AssetInventory>('POST', '/api/asset-inventory', data);
  },

  /**
   * Update an existing asset
   */
  async updateAssetInventory(data: UpdateAssetInventoryData): Promise<AssetInventory> {
    const { id, ...updateData } = data;
    return apiRequestJson<AssetInventory>('PATCH', `/api/asset-inventory/${id}`, updateData);
  },

  /**
   * Delete an asset
   */
  async deleteAssetInventory(id: string): Promise<void> {
    await apiRequestJson<void>('DELETE', `/api/asset-inventory/${id}`);
  },
};

// Legacy interface for backward compatibility (if needed elsewhere)
export interface Asset {
  id: string;
  name: string;
  description?: string;
  category?: string;
  condition?: string;
  location?: string;
  photos?: string[];
  propertyId?: string;
  blockId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAssetData {
  name: string;
  description?: string;
  category?: string;
  condition?: string;
  location?: string;
  photos?: string[];
  propertyId?: string;
  blockId?: string;
}

export interface UpdateAssetData extends Partial<CreateAssetData> {
  id: string;
}
