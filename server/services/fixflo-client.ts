import type { FixfloConfig } from "@shared/schema";

export interface FixfloIssuePayload {
  propertyId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  category?: string;
  reporterId?: string;
  reporterName?: string;
  reporterEmail?: string;
  reporterPhone?: string;
  externalRef?: string;
}

export interface FixfloAttachment {
  url: string;
  filename: string;
  contentType?: string;
}

export interface FixfloIssueResponse {
  id: string;
  jobId?: string;
  status: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FixfloUpdatePayload {
  assignedAgentId?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  notes?: string;
}

export class FixfloClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = "FixfloClientError";
  }
}

export class FixfloClient {
  private baseUrl: string;
  private bearerToken: string;
  private maxRetries = 3;
  private retryDelayMs = 1000;

  constructor(config: FixfloConfig) {
    this.baseUrl = config.baseUrl;
    this.bearerToken = config.bearerToken || "";
    
    if (!this.bearerToken) {
      throw new FixfloClientError("Fixflo bearer token is required");
    }
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    attempt = 1
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${this.bearerToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      // Handle rate limiting with Retry-After
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : this.retryDelayMs * attempt;
        
        if (attempt < this.maxRetries) {
          console.log(`[Fixflo] Rate limited. Retrying after ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`);
          await this.delay(delayMs);
          return this.request<T>(method, endpoint, body, attempt + 1);
        }
        
        throw new FixfloClientError(
          "Rate limit exceeded",
          429,
          await response.text()
        );
      }

      // Retry on 5xx errors
      if (response.status >= 500) {
        if (attempt < this.maxRetries) {
          const delayMs = this.retryDelayMs * attempt;
          console.log(`[Fixflo] Server error ${response.status}. Retrying after ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`);
          await this.delay(delayMs);
          return this.request<T>(method, endpoint, body, attempt + 1);
        }
        
        throw new FixfloClientError(
          `Server error: ${response.status}`,
          response.status,
          await response.text()
        );
      }

      // Handle client errors (4xx)
      if (!response.ok) {
        const errorText = await response.text();
        throw new FixfloClientError(
          `HTTP ${response.status}: ${errorText}`,
          response.status,
          errorText
        );
      }

      // Parse response
      const contentType = response.headers.get("Content-Type");
      if (contentType?.includes("application/json")) {
        return await response.json() as T;
      }
      
      return await response.text() as T;
      
    } catch (error) {
      if (error instanceof FixfloClientError) {
        throw error;
      }
      
      // Network errors - retry if we haven't exhausted attempts
      if (attempt < this.maxRetries) {
        const delayMs = this.retryDelayMs * attempt;
        console.log(`[Fixflo] Network error. Retrying after ${delayMs}ms (attempt ${attempt}/${this.maxRetries})`);
        await this.delay(delayMs);
        return this.request<T>(method, endpoint, body, attempt + 1);
      }
      
      throw new FixfloClientError(
        `Network error: ${(error as Error).message}`,
        undefined,
        error
      );
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async createIssue(payload: FixfloIssuePayload): Promise<FixfloIssueResponse> {
    console.log(`[Fixflo] Creating issue: ${payload.title}`);
    
    // Map our priority values to Fixflo's expected format
    const priorityMapping: Record<string, string> = {
      "low": "Low",
      "medium": "Medium", 
      "high": "High",
      "urgent": "Emergency"
    };

    const fixfloPayload = {
      PropertyId: payload.propertyId,
      Title: payload.title,
      Description: payload.description,
      Priority: priorityMapping[payload.priority] || "Medium",
      Category: payload.category || "Maintenance",
      ExternalRef: payload.externalRef,
      Reporter: payload.reporterId ? {
        Id: payload.reporterId,
        Name: payload.reporterName,
        Email: payload.reporterEmail,
        Phone: payload.reporterPhone,
      } : undefined,
    };

    return await this.request<FixfloIssueResponse>("POST", "/Issues", fixfloPayload);
  }

  async updateIssue(issueId: string, payload: FixfloUpdatePayload): Promise<FixfloIssueResponse> {
    console.log(`[Fixflo] Updating issue: ${issueId}`);
    
    return await this.request<FixfloIssueResponse>(
      "PATCH",
      `/Issues/${issueId}`,
      payload
    );
  }

  async assignContractor(issueId: string, contractorId: string): Promise<FixfloIssueResponse> {
    console.log(`[Fixflo] Assigning contractor ${contractorId} to issue ${issueId}`);
    
    return await this.request<FixfloIssueResponse>(
      "PATCH",
      `/Issues/${issueId}/AssignedAgent`,
      { AgentId: contractorId }
    );
  }

  async getIssue(issueId: string): Promise<FixfloIssueResponse> {
    console.log(`[Fixflo] Fetching issue: ${issueId}`);
    
    return await this.request<FixfloIssueResponse>("GET", `/Issues/${issueId}`);
  }

  async getJobCompleted(sinceDate?: Date): Promise<FixfloIssueResponse[]> {
    const dateParam = sinceDate 
      ? `?since=${sinceDate.toISOString()}`
      : "";
    
    console.log(`[Fixflo] Fetching completed jobs${dateParam}`);
    
    return await this.request<FixfloIssueResponse[]>(
      "GET",
      `/Issues/JobCompleted${dateParam}`
    );
  }

  async uploadAttachment(
    issueId: string,
    attachment: FixfloAttachment
  ): Promise<void> {
    console.log(`[Fixflo] Uploading attachment to issue ${issueId}: ${attachment.filename}`);
    
    // Fixflo may support URL-based attachments or require binary upload
    // This implementation assumes URL-based attachment
    await this.request("POST", `/Issues/${issueId}/Attachments`, {
      Url: attachment.url,
      Filename: attachment.filename,
      ContentType: attachment.contentType || "image/jpeg",
    });
  }

  async downloadAttachment(attachmentUrl: string): Promise<Blob> {
    console.log(`[Fixflo] Downloading attachment: ${attachmentUrl}`);
    
    const response = await fetch(attachmentUrl, {
      headers: {
        "Authorization": `Bearer ${this.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new FixfloClientError(
        `Failed to download attachment: ${response.status}`,
        response.status
      );
    }

    return await response.blob();
  }

  async healthCheck(): Promise<boolean> {
    try {
      // Simple API call to verify connectivity and authentication
      await this.request("GET", "/Issues?limit=1");
      return true;
    } catch (error) {
      console.error(`[Fixflo] Health check failed:`, error);
      return false;
    }
  }
}

export async function createFixfloClient(config: FixfloConfig): Promise<FixfloClient> {
  if (!config.isEnabled) {
    throw new FixfloClientError("Fixflo integration is not enabled for this organization");
  }
  
  return new FixfloClient(config);
}
