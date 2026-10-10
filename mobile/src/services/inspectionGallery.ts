import { apiRequestJson } from './api';

export type GalleryAssignment = {
  id: string;
  sectionRef: string;
  fieldKey: string;
  label: string;
};

export type GalleryImage = {
  id: string;
  objectUrl: string;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  createdAt: string | null;
  assignments: GalleryAssignment[];
};

export type PhotoDestination = {
  sectionId: string;
  sectionRef: string;
  sectionLabel: string;
  fieldKey: string;
  fieldLabel: string;
  fieldType: 'photo' | 'photo_array';
};

export const inspectionGalleryService = {
  list(inspectionId: string) {
    return apiRequestJson<{ images: GalleryImage[] }>(
      'GET',
      `/api/inspections/${inspectionId}/gallery`,
    );
  },
  destinations(inspectionId: string) {
    return apiRequestJson<{ destinations: PhotoDestination[] }>(
      'GET',
      `/api/inspections/${inspectionId}/gallery/destinations`,
    );
  },
  register(
    inspectionId: string,
    images: Array<{ objectUrl: string; fileName?: string; mimeType?: string }>,
    assign?: { sectionRef: string; fieldKey: string } | null,
  ) {
    return apiRequestJson<{ images: GalleryImage[] }>(
      'POST',
      `/api/inspections/${inspectionId}/gallery/register`,
      { images, assign: assign || null },
    );
  },
  assign(inspectionId: string, imageIds: string[], sectionRef: string, fieldKey: string) {
    return apiRequestJson<{ images: GalleryImage[] }>(
      'POST',
      `/api/inspections/${inspectionId}/gallery/assign`,
      { imageIds, sectionRef, fieldKey },
    );
  },
  delete(inspectionId: string, imageIds: string[]) {
    return apiRequestJson<{ deleted: number; assignmentCount: number }>(
      'POST',
      `/api/inspections/${inspectionId}/gallery/delete`,
      { imageIds },
    );
  },
};
