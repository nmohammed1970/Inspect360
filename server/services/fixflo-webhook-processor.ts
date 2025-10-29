import type { DatabaseStorage } from "../storage";

export async function processFixfloWebhook(
  webhookLogId: string,
  organizationId: string,
  payload: any,
  storage: DatabaseStorage
): Promise<void> {
  const eventType = payload.eventType || payload.event || "Unknown";
  
  console.log(`[Fixflo Webhook] Processing event: ${eventType}`);

  try {
    // Extract issue/job IDs from payload
    const fixfloIssueId = payload.issueId || payload.Issue?.Id || payload.Id;
    const fixfloJobId = payload.jobId || payload.Job?.Id;

    // Process based on event type
    switch (eventType) {
      case "IssueCreated":
        await handleIssueCreated(fixfloIssueId, payload, organizationId, storage);
        break;

      case "IssueUpdated":
        await handleIssueUpdated(fixfloIssueId, payload, organizationId, storage);
        break;

      case "ContractorAssigned":
      case "AssignedAgentUpdated":
        await handleContractorAssigned(fixfloIssueId, payload, organizationId, storage);
        break;

      case "JobCompleted":
        await handleJobCompleted(fixfloIssueId, fixfloJobId, payload, organizationId, storage);
        break;

      case "InvoiceAdded":
        await handleInvoiceAdded(fixfloIssueId, payload, organizationId, storage);
        break;

      case "AttachmentAdded":
        await handleAttachmentAdded(fixfloIssueId, payload, organizationId, storage);
        break;

      default:
        console.log(`[Fixflo Webhook] Unhandled event type: ${eventType}`);
    }

    // Mark webhook as processed
    await storage.updateFixfloWebhookLog(webhookLogId, {
      processingStatus: "processed",
      processedAt: new Date(),
    });

    console.log(`[Fixflo Webhook] Successfully processed event: ${eventType}`);
  } catch (error) {
    console.error(`[Fixflo Webhook] Error processing webhook:`, error);

    // Get current retry count
    const webhookLogs = await storage.getFixfloWebhookLogs(organizationId, 1);
    const currentLog = webhookLogs.find(log => log.id === webhookLogId);
    const retryCount = (currentLog?.retryCount || 0) + 1;

    // Update webhook log with error
    await storage.updateFixfloWebhookLog(webhookLogId, {
      processingStatus: retryCount < 3 ? "retrying" : "error",
      errorMessage: (error as Error).message,
      retryCount,
    });

    // Retry if under max retries
    if (retryCount < 3) {
      console.log(`[Fixflo Webhook] Retry ${retryCount}/3 for webhook ${webhookLogId}`);
      // In production, this would be handled by a queue
      setTimeout(() => {
        processFixfloWebhook(webhookLogId, organizationId, payload, storage);
      }, 5000 * retryCount); // Exponential backoff
    }
  }
}

async function handleIssueCreated(
  fixfloIssueId: string,
  payload: any,
  organizationId: string,
  storage: DatabaseStorage
): Promise<void> {
  console.log(`[Fixflo Webhook] Issue created: ${fixfloIssueId}`);
  
  // Check if we already have a maintenance request with this Fixflo Issue ID
  // If not, this issue was created in Fixflo directly (not from Inspect360)
  // We could optionally create a new maintenance request here
}

async function handleIssueUpdated(
  fixfloIssueId: string,
  payload: any,
  organizationId: string,
  storage: DatabaseStorage
): Promise<void> {
  console.log(`[Fixflo Webhook] Issue updated: ${fixfloIssueId}`);

  // Find maintenance request by Fixflo Issue ID
  const maintenanceRequests = await storage.getMaintenanceByOrganization(organizationId);
  const matchingRequest = maintenanceRequests.find(
    (req: any) => req.fixfloIssueId === fixfloIssueId
  );

  if (!matchingRequest) {
    console.log(`[Fixflo Webhook] No matching maintenance request found for issue ${fixfloIssueId}`);
    return;
  }

  // Update maintenance request with latest Fixflo data
  const updates: any = {
    fixfloStatus: payload.status || payload.Issue?.Status,
    fixfloSyncedAt: new Date(),
  };

  // Map Fixflo status to our status
  const fixfloStatus = (payload.status || payload.Issue?.Status || "").toLowerCase();
  if (fixfloStatus.includes("complete") || fixfloStatus.includes("closed")) {
    updates.status = "completed";
  } else if (fixfloStatus.includes("progress")) {
    updates.status = "in_progress";
  }

  await storage.updateMaintenanceRequest(matchingRequest.id, updates);
  console.log(`[Fixflo Webhook] Updated maintenance request ${matchingRequest.id}`);
}

async function handleContractorAssigned(
  fixfloIssueId: string,
  payload: any,
  organizationId: string,
  storage: DatabaseStorage
): Promise<void> {
  console.log(`[Fixflo Webhook] Contractor assigned to issue: ${fixfloIssueId}`);

  // Find maintenance request
  const maintenanceRequests = await storage.getMaintenanceByOrganization(organizationId);
  const matchingRequest = maintenanceRequests.find(
    (req: any) => req.fixfloIssueId === fixfloIssueId
  );

  if (!matchingRequest) {
    return;
  }

  // Update with contractor info
  const contractorName = 
    payload.assignedAgent?.name || 
    payload.AssignedAgent?.Name ||
    payload.contractor?.name;

  const updates: any = {
    fixfloContractorName: contractorName,
    fixfloSyncedAt: new Date(),
  };

  await storage.updateMaintenanceRequest(matchingRequest.id, updates);
  console.log(`[Fixflo Webhook] Updated contractor for maintenance request ${matchingRequest.id}`);
}

async function handleJobCompleted(
  fixfloIssueId: string,
  fixfloJobId: string | undefined,
  payload: any,
  organizationId: string,
  storage: DatabaseStorage
): Promise<void> {
  console.log(`[Fixflo Webhook] Job completed: ${fixfloIssueId}`);

  // Find maintenance request
  const maintenanceRequests = await storage.getMaintenanceByOrganization(organizationId);
  const matchingRequest = maintenanceRequests.find(
    (req: any) => req.fixfloIssueId === fixfloIssueId || req.fixfloJobId === fixfloJobId
  );

  if (!matchingRequest) {
    return;
  }

  // Mark as completed
  const updates: any = {
    status: "completed",
    fixfloStatus: "Completed",
    fixfloJobId: fixfloJobId,
    fixfloSyncedAt: new Date(),
  };

  await storage.updateMaintenanceRequest(matchingRequest.id, updates);
  console.log(`[Fixflo Webhook] Marked maintenance request ${matchingRequest.id} as completed`);
}

async function handleInvoiceAdded(
  fixfloIssueId: string,
  payload: any,
  organizationId: string,
  storage: DatabaseStorage
): Promise<void> {
  console.log(`[Fixflo Webhook] Invoice added to issue: ${fixfloIssueId}`);
  
  // Find maintenance request
  const maintenanceRequests = await storage.getMaintenanceByOrganization(organizationId);
  const matchingRequest = maintenanceRequests.find(
    (req: any) => req.fixfloIssueId === fixfloIssueId
  );

  if (!matchingRequest) {
    return;
  }

  // Store invoice data in aiAnalysisJson for now
  // In future, might want a dedicated invoices table
  const currentAnalysis = (matchingRequest.aiAnalysisJson as any) || {};
  const invoiceData = {
    amount: payload.invoice?.amount || payload.Invoice?.Amount,
    invoiceNumber: payload.invoice?.number || payload.Invoice?.Number,
    date: payload.invoice?.date || payload.Invoice?.Date,
    description: payload.invoice?.description || payload.Invoice?.Description,
  };

  const updates: any = {
    aiAnalysisJson: {
      ...currentAnalysis,
      fixfloInvoice: invoiceData,
    },
    fixfloSyncedAt: new Date(),
  };

  await storage.updateMaintenanceRequest(matchingRequest.id, updates);
  console.log(`[Fixflo Webhook] Added invoice data to maintenance request ${matchingRequest.id}`);
}

async function handleAttachmentAdded(
  fixfloIssueId: string,
  payload: any,
  organizationId: string,
  storage: DatabaseStorage
): Promise<void> {
  console.log(`[Fixflo Webhook] Attachment added to issue: ${fixfloIssueId}`);

  // Find maintenance request
  const maintenanceRequests = await storage.getMaintenanceByOrganization(organizationId);
  const matchingRequest = maintenanceRequests.find(
    (req: any) => req.fixfloIssueId === fixfloIssueId
  );

  if (!matchingRequest) {
    return;
  }

  // Get attachment URL from payload
  const attachmentUrl = payload.attachment?.url || payload.Attachment?.Url;
  
  if (!attachmentUrl) {
    console.log(`[Fixflo Webhook] No attachment URL in payload`);
    return;
  }

  // Add to photoUrls array
  const currentPhotoUrls = matchingRequest.photoUrls || [];
  const updatedPhotoUrls = [...currentPhotoUrls, attachmentUrl];

  const updates: any = {
    photoUrls: updatedPhotoUrls,
    fixfloSyncedAt: new Date(),
  };

  await storage.updateMaintenanceRequest(matchingRequest.id, updates);
  console.log(`[Fixflo Webhook] Added attachment to maintenance request ${matchingRequest.id}`);
}
