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
  fieldType: "photo" | "photo_array";
};

export type UploadJob = {
  id: string;
  fileName: string;
  status: "pending" | "uploading" | "done" | "failed";
  error?: string;
  objectUrl?: string;
};
