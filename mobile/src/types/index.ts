// Shared types for the mobile app
// These can be extended from shared/schema.ts if needed

export type UserRole = 'owner' | 'clerk' | 'compliance' | 'tenant' | 'contractor';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  organizationId: string;
  profileImageUrl?: string;
  skills?: string[];
  qualifications?: string[];
  isActive: boolean;
}

export interface Inspection {
  id: string;
  propertyId?: string;
  blockId?: string;
  templateId: string;
  assignedToId?: string;
  scheduledDate?: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'reviewed';
  type: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceRequest {
  id: string;
  propertyId?: string;
  blockId?: string;
  title: string;
  description?: string;
  status: 'open' | 'in_progress' | 'completed' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reportedById?: string;
  assignedToId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  blockId?: string;
  name: string;
  address: string;
  unitRef?: string;
  bedrooms?: number;
  bathrooms?: number;
  floor?: number;
  sqft?: number;
  status: string;
}

export interface Block {
  id: string;
  name: string;
  address: string;
  organizationId: string;
}

