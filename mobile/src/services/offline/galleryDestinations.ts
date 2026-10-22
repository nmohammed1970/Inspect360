import {
  extractCipCountsFromEntries,
  extractRepeatableCountsFromEntries,
  listPhotoDestinations,
  type PhotoDestination,
} from '../../../../shared/inspectionGallery';
import { getInspection, getInspectionEntries } from './database';

/**
 * Derive gallery assign destinations from the locally cached inspection
 * template snapshot (works offline). Falls back to empty list if not cached.
 */
export async function getLocalGalleryDestinations(
  inspectionId: string,
): Promise<PhotoDestination[]> {
  const record = await getInspection(inspectionId);
  if (!record?.data) return [];

  let inspection: any;
  try {
    inspection = JSON.parse(record.data);
  } catch {
    return [];
  }

  const structure = inspection?.templateSnapshotJson;
  if (!structure) return [];

  const entryRecords = await getInspectionEntries(inspectionId);
  const entries = entryRecords.map((r) => {
    try {
      return JSON.parse(r.data);
    } catch {
      return { sectionRef: r.sectionRef, fieldKey: r.fieldKey, valueJson: null };
    }
  });

  const fromEntries = extractRepeatableCountsFromEntries(entries);
  const snapshot = inspection?.propertyRoomCountsSnapshot;
  let counts = { ...fromEntries };
  if (snapshot && structure) {
    try {
      const { repeatableCountsFromPropertyLayout } = await import('../../../../shared/propertyLayout');
      const fromProperty = repeatableCountsFromPropertyLayout(structure, snapshot);
      counts = { ...fromProperty, ...fromEntries };
    } catch {
      // keep fromEntries
    }
  }

  const cipCounts = extractCipCountsFromEntries(entries);
  return listPhotoDestinations(structure, counts, cipCounts);
}
