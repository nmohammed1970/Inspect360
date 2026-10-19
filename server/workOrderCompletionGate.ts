import {
  computeCompletionChecklistProgress,
  type CompletionChecklistProgress,
} from "@shared/completionChecklist";
import { parseSignatureValue } from "@shared/signature";
import type { CompletionChecklistSnapshot, WorkOrder } from "@shared/schema";
import type { IStorage } from "./storage";

export type WorkOrderCompleteGateError = {
  code: "checklist_incomplete" | "signature_required";
  message: string;
  progress?: CompletionChecklistProgress;
};

/**
 * Hard gate before status → completed:
 * - required checklist items (if a snapshot is assigned) must be done
 * - customer signature with image must be present
 */
export async function assertWorkOrderReadyToComplete(
  storage: IStorage,
  workOrder: WorkOrder,
): Promise<WorkOrderCompleteGateError | null> {
  const snapshot = (workOrder as any).completionChecklistSnapshotJson as
    | CompletionChecklistSnapshot
    | null
    | undefined;

  if (snapshot?.items?.length) {
    const responses = await storage.getWorkOrderCompletionChecklistResponses(workOrder.id);
    const progress = computeCompletionChecklistProgress(snapshot, responses);
    if (progress.requiredIncomplete > 0) {
      return {
        code: "checklist_incomplete",
        message: `${progress.requiredIncomplete} required checklist step${
          progress.requiredIncomplete === 1 ? " is" : "s are"
        } still unfinished.`,
        progress,
      };
    }
  }

  const signature = parseSignatureValue((workOrder as any).customerSignatureJson);
  if (!signature?.image) {
    return {
      code: "signature_required",
      message: "Customer signature is required before completing this work order.",
    };
  }

  return null;
}
