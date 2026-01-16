import { apiRequestJson } from './api';

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

export const assetsService = {
  /**
   * Get all assets for a property or block
   */
  async getAssets(propertyId?: string, blockId?: string): Promise<Asset[]> {
    const params = new URLSearchParams();
    if (propertyId) params.append('propertyId', propertyId);
    if (blockId) params.append('blockId', blockId);
    
    const query = params.toString();
    const url = query ? `/api/assets?${query}` : '/api/assets';
    return apiRequestJson<Asset[]>('GET', url);
  },

  /**
   * Get a single asset by ID
   */
  async getAsset(id: string): Promise<Asset> {
    return apiRequestJson<Asset>('GET', `/api/assets/${id}`);
  },

  /**
   * Create a new asset
   */
  async createAsset(data: CreateAssetData): Promise<Asset> {
    return apiRequestJson<Asset>('POST', '/api/assets', data);
  },

  /**
   * Update an existing asset
   */
  async updateAsset(data: UpdateAssetData): Promise<Asset> {
    const { id, ...updateData } = data;
    return apiRequestJson<Asset>('PATCH', `/api/assets/${id}`, updateData);
  },

  /**
   * Delete an asset
   */
  async deleteAsset(id: string): Promise<void> {
    return apiRequestJson<void>('DELETE', `/api/assets/${id}`);
  },
};

