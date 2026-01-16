import { apiRequestJson } from './api';
import type { Property, Block } from '../types';

export const propertiesService = {
  async getProperties(): Promise<Property[]> {
    return apiRequestJson<Property[]>('GET', '/api/properties');
  },

  async getProperty(id: string): Promise<Property> {
    return apiRequestJson<Property>('GET', `/api/properties/${id}`);
  },

  async getBlocks(): Promise<Block[]> {
    return apiRequestJson<Block[]>('GET', '/api/blocks');
  },

  async getBlock(id: string): Promise<Block> {
    return apiRequestJson<Block>('GET', `/api/blocks/${id}`);
  },

  async getPropertyTenants(propertyId: string): Promise<any[]> {
    return apiRequestJson<any[]>('GET', `/api/properties/${propertyId}/tenants`);
  },

  async getPropertyInventory(propertyId: string): Promise<any[]> {
    return apiRequestJson<any[]>('GET', `/api/properties/${propertyId}/inventory`);
  },
};

