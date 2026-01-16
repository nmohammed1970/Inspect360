import { apiRequestJson } from './api';
import type { User } from '../types';

export interface UserDocument {
  id: string;
  userId: string;
  documentName: string;
  documentType: string;
  fileUrl: string;
  expiryDate?: string;
  createdAt: string;
}

export interface UpdateProfileData {
  firstName?: string;
  lastName?: string;
  phone?: string;
  profileImageUrl?: string;
  skills?: string[];
  qualifications?: string[];
}

export interface ChangePasswordData {
  currentPassword: string;
  newPassword: string;
}

export const profileService = {
  async updateProfile(data: UpdateProfileData): Promise<User> {
    return apiRequestJson<User>('PATCH', '/api/auth/profile', data);
  },

  async changePassword(data: ChangePasswordData): Promise<void> {
    await apiRequestJson('PATCH', '/api/auth/change-password', data);
  },

  async getUserDocuments(): Promise<UserDocument[]> {
    return apiRequestJson<UserDocument[]>('GET', '/api/user-documents');
  },

  async uploadDocument(data: {
    documentName: string;
    documentType: string;
    fileUrl: string;
    expiryDate?: string;
  }): Promise<UserDocument> {
    return apiRequestJson<UserDocument>('POST', '/api/user-documents', data);
  },

  async deleteDocument(id: string): Promise<void> {
    await apiRequestJson('DELETE', `/api/user-documents/${id}`);
  },
};

